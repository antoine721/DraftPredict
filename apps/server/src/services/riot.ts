import type {
    ChampionMasteryDto,
    CurrentGameInfo,
    MatchSummary,
    PlaystyleProfile,
    RankedSummary,
    RiotAccountDto,
    SummonerDto,
} from "@draftpredict/riot";
import {
    RiotApiClient,
    buildDraftFromSpectatorGame,
    isRiotApiError,
    profilePlaystyle,
    summarizeMatchOrNull,
} from "@draftpredict/riot";
import type { Dataset, SerializedDraftState } from "@draftpredict/core";
import { serializeDraftState } from "@draftpredict/core";
import type { ConfigService } from "../config/service.js";
import { ApiError } from "../errors.js";
import { TtlMap } from "../util/ttl-cache.js";

/**
 * Everything that needs the Riot API key.
 *
 * The client is created lazily, per platform, and thrown away whenever the key
 * changes; routes only ever see `ApiError` (428 when no key is configured), so
 * the key never reaches a response body or a log line.
 *
 * Riot's development budget is 20 requests/second and 100 per two minutes, and
 * a playstyle profile reads 50 matches. Results are therefore cached per puuid
 * with a TTL, and `refresh=1` is the only way to pay that cost again.
 */

export type RiotClientFactory = (options: {
    apiKey: string;
    platform: string;
}) => RiotApiClient;

export type ProfilePayload = {
    account: RiotAccountDto | null;
    summoner: SummonerDto;
    ranks: RankedSummary;
    mastery: ChampionMasteryDto[];
    platform: string;
};

export type MatchesPayload = {
    puuid: string;
    platform: string;
    count: number;
    matches: MatchSummary[];
    /** Match ids Riot returned but whose detail could not be fetched. */
    skipped: string[];
    fetchedAt: number;
};

export type PlaystylePayload = {
    puuid: string;
    platform: string;
    /** Matches actually analysed. */
    sampleSize: number;
    profile: PlaystyleProfile;
    fetchedAt: number;
    /** `true` when the answer came straight out of the cache. */
    cached: boolean;
};

export type LivePayload = {
    puuid: string;
    platform: string;
    inGame: boolean;
    game: CurrentGameInfo | null;
    draft: SerializedDraftState | null;
};

export type ProgressListener = (progress: {
    stage: "match-ids" | "matches" | "profiling";
    loaded: number;
    total: number;
}) => void;

export type RiotServiceOptions = {
    config: ConfigService;
    factory?: RiotClientFactory;
    /** Playstyle cache lifetime. Default 15 minutes. */
    playstyleTtlMs?: number;
    /** Match history cache lifetime. Default 2 minutes. */
    matchesTtlMs?: number;
    /** Profile cache lifetime. Default 1 minute. */
    profileTtlMs?: number;
};

const defaultFactory: RiotClientFactory = ({ apiKey, platform }) =>
    new RiotApiClient({ apiKey, platform });

export class RiotService {
    private readonly config: ConfigService;
    private readonly factory: RiotClientFactory;
    private readonly clients = new Map<string, RiotApiClient>();
    private clientKey: string | null = null;

    private readonly playstyleCache: TtlMap<PlaystylePayload>;
    private readonly matchesCache: TtlMap<MatchesPayload>;
    private readonly profileCache: TtlMap<ProfilePayload>;

    constructor(options: RiotServiceOptions) {
        this.config = options.config;
        this.factory = options.factory ?? defaultFactory;
        this.playstyleCache = new TtlMap({
            ttlMs: options.playstyleTtlMs ?? 15 * 60_000,
            maxEntries: 50,
        });
        this.matchesCache = new TtlMap({
            ttlMs: options.matchesTtlMs ?? 2 * 60_000,
            maxEntries: 50,
        });
        this.profileCache = new TtlMap({
            ttlMs: options.profileTtlMs ?? 60_000,
            maxEntries: 50,
        });

        this.config.onChange(() => this.reset());
    }

    isConfigured(): boolean {
        return this.config.hasRiotApiKey();
    }

    defaultPlatform(): string {
        return this.config.get().platform;
    }

    /** Drops cached clients and results — called whenever the key changes. */
    reset(): void {
        this.clients.clear();
        this.clientKey = null;
        this.playstyleCache.clear();
        this.matchesCache.clear();
        this.profileCache.clear();
    }

    /** The client for a platform. Throws `RIOT_KEY_MISSING` (428) with no key. */
    client(platform?: string): RiotApiClient {
        const apiKey = this.config.requireRiotApiKey();
        if (this.clientKey !== null && this.clientKey !== apiKey) this.reset();
        this.clientKey = apiKey;

        const target = (platform ?? this.defaultPlatform()).toLowerCase();
        const existing = this.clients.get(target);
        if (existing) return existing;

        let client: RiotApiClient;
        try {
            client = this.factory({ apiKey, platform: target });
        } catch (error) {
            if (isRiotApiError(error) && error.code === "UNKNOWN_PLATFORM") {
                throw new ApiError(400, "UNKNOWN_PLATFORM", error.message);
            }
            throw error;
        }
        this.clients.set(target, client);
        return client;
    }

    // ------------------------------------------------------------ account ---

    /** Resolves `Name#TAG`. */
    async lookup(
        riotId: string,
        platform?: string,
    ): Promise<RiotAccountDto & { platform: string }> {
        const { gameName, tagLine } = parseRiotId(riotId);
        const target = platform ?? this.defaultPlatform();
        const account = await this.client(target).account.byRiotId(gameName, tagLine);
        return { ...account, platform: target };
    }

    async profile(puuid: string, platform?: string): Promise<ProfilePayload> {
        const target = platform ?? this.defaultPlatform();
        const cacheKey = `${target}:${puuid}`;
        const cached = this.profileCache.get(cacheKey);
        if (cached) return cached;

        const client = this.client(target);
        const [summoner, ranks, mastery, account] = await Promise.all([
            client.summoner.byPuuid(puuid),
            client.league.ranksByPuuid(puuid),
            client.championMastery.topByPuuid(puuid, 10),
            client.account.byPuuid(puuid).catch(() => null),
        ]);

        return this.profileCache.set(cacheKey, {
            account,
            summoner,
            ranks,
            mastery,
            platform: target,
        });
    }

    // ------------------------------------------------------------ matches ---

    async matches(
        puuid: string,
        options: {
            count?: number;
            platform?: string;
            refresh?: boolean;
            onProgress?: ProgressListener;
        } = {},
    ): Promise<MatchesPayload> {
        const target = options.platform ?? this.defaultPlatform();
        const count = clamp(options.count ?? 20, 1, 100);
        const cacheKey = `${target}:${puuid}:${count}`;

        if (!options.refresh) {
            const cached = this.matchesCache.get(cacheKey);
            if (cached) return cached;
        }

        const client = this.client(target);
        options.onProgress?.({ stage: "match-ids", loaded: 0, total: count });
        const ids = await client.match.idsByPuuid(puuid, { count });

        const matches: MatchSummary[] = [];
        const skipped: string[] = [];

        for (const [index, id] of ids.entries()) {
            try {
                const match = await client.match.byId(id);
                const summary = summarizeMatchOrNull(match, puuid);
                if (summary) matches.push(summary);
                else skipped.push(id);
            } catch (error) {
                // One unavailable match must not sink a whole history page.
                if (isRiotApiError(error) && error.status === 404) skipped.push(id);
                else throw error;
            }
            options.onProgress?.({
                stage: "matches",
                loaded: index + 1,
                total: ids.length,
            });
        }

        return this.matchesCache.set(cacheKey, {
            puuid,
            platform: target,
            count,
            matches,
            skipped,
            fetchedAt: Date.now(),
        });
    }

    // ---------------------------------------------------------- playstyle ---

    async playstyle(
        puuid: string,
        options: {
            count?: number;
            platform?: string;
            refresh?: boolean;
            onProgress?: ProgressListener;
        } = {},
    ): Promise<PlaystylePayload> {
        const target = options.platform ?? this.defaultPlatform();
        const count = clamp(options.count ?? 50, 1, 100);
        const cacheKey = `${target}:${puuid}:${count}`;

        if (!options.refresh) {
            const cached = this.playstyleCache.get(cacheKey);
            if (cached) return { ...cached, cached: true };
        }

        const matchesOptions: Parameters<RiotService["matches"]>[1] = {
            count,
            platform: target,
            refresh: options.refresh ?? false,
        };
        if (options.onProgress) matchesOptions.onProgress = options.onProgress;

        const history = await this.matches(puuid, matchesOptions);

        options.onProgress?.({
            stage: "profiling",
            loaded: history.matches.length,
            total: history.matches.length,
        });

        const mastery = await this.client(target)
            .championMastery.topByPuuid(puuid, 20)
            .catch(() => [] as ChampionMasteryDto[]);

        const profile = profilePlaystyle(history.matches, { puuid, mastery });

        const payload: PlaystylePayload = {
            puuid,
            platform: target,
            sampleSize: history.matches.length,
            profile,
            fetchedAt: Date.now(),
            cached: false,
        };
        this.playstyleCache.set(cacheKey, payload);
        return payload;
    }

    // --------------------------------------------------------------- live ---

    async live(
        puuid: string,
        options: { platform?: string; dataset?: Dataset } = {},
    ): Promise<LivePayload> {
        const target = options.platform ?? this.defaultPlatform();
        const game = await this.client(target).spectator.activeGameByPuuid(puuid);

        if (!game) {
            return { puuid, platform: target, inGame: false, game: null, draft: null };
        }

        const draft = buildDraftFromSpectatorGame(game, puuid, {
            ...(options.dataset ? { dataset: options.dataset } : {}),
        });

        return {
            puuid,
            platform: target,
            inGame: true,
            game,
            draft: draft ? serializeDraftState(draft) : null,
        };
    }
}

/** Splits `Name#TAG`, rejecting anything that is not a Riot ID. */
export function parseRiotId(riotId: string): { gameName: string; tagLine: string } {
    const trimmed = riotId.trim();
    const hash = trimmed.lastIndexOf("#");
    if (hash <= 0 || hash === trimmed.length - 1) {
        throw new ApiError(
            400,
            "INVALID_RIOT_ID",
            'A Riot ID looks like "Nom#TAG" — both halves are required.',
        );
    }
    return {
        gameName: trimmed.slice(0, hash).trim(),
        tagLine: trimmed.slice(hash + 1).trim(),
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
