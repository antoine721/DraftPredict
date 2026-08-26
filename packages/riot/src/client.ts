import { TtlCache, type RiotMethod } from "./cache.js";
import { RiotApiError } from "./errors.js";
import { RiotHttpClient, type RiotHttpOptions } from "./http.js";
import type { RateLimiter, RateLimitRule } from "./rate-limiter.js";
import {
    parsePlatform,
    platformBaseUrl,
    platformToRegional,
    regionalBaseUrl,
    type PlatformId,
    type RegionalRoute,
} from "./routing.js";
import type { RiotAccountDto } from "./types/account.js";
import type { LeagueEntryDto } from "./types/league.js";
import type { ChampionMasteryDto } from "./types/mastery.js";
import type { MatchDto, MatchIdsQuery, MatchTimelineDto } from "./types/match.js";
import type { CurrentGameInfo, FeaturedGames } from "./types/spectator.js";
import type { SummonerDto } from "./types/summoner.js";
import { buildUrl, encodeSegment } from "./url.js";

/**
 * Conservative per-method budgets, on top of the application limits.
 *
 * On a development key the application limit (20/s, 100/2min) is always the
 * binding constraint; these matter for production keys and keep a burst of
 * match fetches from starving the rest of the app.
 */
export const DEFAULT_METHOD_RATE_LIMITS: Record<string, readonly RateLimitRule[]> = {
    "match-v5.byId": [{ requests: 250, seconds: 10 }],
    "match-v5.timelineById": [{ requests: 250, seconds: 10 }],
    "match-v5.idsByPuuid": [{ requests: 250, seconds: 10 }],
    "league-v4.entriesByPuuid": [{ requests: 100, seconds: 60 }],
    "spectator-v5.featuredGames": [{ requests: 60, seconds: 60 }],
};

export type RiotApiClientOptions = Omit<RiotHttpOptions, "apiKey"> & {
    /** Riot API key. Sent as `X-Riot-Token`, never in a URL, never logged. */
    apiKey: string;
    /** Platform routing value (`euw1`) or region code (`EUW`). */
    platform: PlatformId | string;
};

export type RankedSummary = {
    solo?: LeagueEntryDto;
    flex?: LeagueEntryDto;
    entries: LeagueEntryDto[];
};

/**
 * Typed Riot Games API client.
 *
 * ```ts
 * const client = new RiotApiClient({ apiKey, platform: "euw1" });
 * const account = await client.account.byRiotId("Faker", "KR1");
 * const ids = await client.match.idsByPuuid(account.puuid, { count: 20 });
 * ```
 *
 * All I/O goes through {@link RiotHttpClient}: shared token-bucket rate
 * limiter, retry with backoff, TTL cache and typed errors.
 */
export class RiotApiClient {
    readonly platform: PlatformId;
    readonly regional: RegionalRoute;
    readonly http: RiotHttpClient;

    private readonly options: RiotApiClientOptions;

    constructor(options: RiotApiClientOptions) {
        const platform = parsePlatform(String(options.platform ?? ""));
        if (!platform) {
            throw new RiotApiError(
                `Unknown Riot platform: ${String(options.platform)}`,
                { code: "UNKNOWN_PLATFORM", endpoint: "client" },
            );
        }
        this.options = options;
        this.platform = platform;
        this.regional = platformToRegional[platform];
        this.http = new RiotHttpClient({
            ...options,
            methodRateLimits: {
                ...DEFAULT_METHOD_RATE_LIMITS,
                ...options.methodRateLimits,
            },
        });
    }

    /** The shared limiter, e.g. to show "waiting 1.2s" in the UI. */
    get rateLimiter(): RateLimiter {
        return this.http.rateLimiter;
    }

    get cache(): TtlCache<unknown> | undefined {
        return this.http.cache;
    }

    /**
     * A client for another platform sharing this one's rate limiter and cache
     * (the Riot budget is per key, not per region).
     */
    forPlatform(platform: PlatformId | string): RiotApiClient {
        const parsed = parsePlatform(String(platform));
        if (parsed === this.platform) return this;
        return new RiotApiClient({
            ...this.options,
            platform,
            rateLimiter: this.http.rateLimiter,
            cache: this.http.cache ?? false,
        });
    }

    private platformUrl(
        path: string,
        query?: Record<string, string | number | undefined>,
    ): string {
        return buildUrl(platformBaseUrl(this.platform), path, query);
    }

    private regionalUrl(
        path: string,
        query?: Record<string, string | number | undefined>,
    ): string {
        return buildUrl(regionalBaseUrl(this.regional), path, query);
    }

    private get<T>(method: RiotMethod, url: string): Promise<T> {
        return this.http.request<T>({ method, url });
    }

    // --- account-v1 (regional) --------------------------------------------

    readonly account = {
        /** Resolves a Riot ID (`gameName#tagLine`) to an account. */
        byRiotId: (gameName: string, tagLine: string): Promise<RiotAccountDto> => {
            const name = gameName.trim();
            const tag = tagLine.trim().replace(/^#/, "");
            if (!name || !tag) {
                return Promise.reject(
                    new RiotApiError(
                        "A Riot ID needs both a game name and a tag line",
                        {
                            code: "INVALID_RIOT_ID",
                            endpoint: "account-v1.byRiotId",
                        },
                    ),
                );
            }
            return this.get<RiotAccountDto>(
                "account-v1.byRiotId",
                this.regionalUrl(
                    `/riot/account/v1/accounts/by-riot-id/${encodeSegment(name)}/${encodeSegment(tag)}`,
                ),
            );
        },

        byPuuid: (puuid: string): Promise<RiotAccountDto> =>
            this.get<RiotAccountDto>(
                "account-v1.byPuuid",
                this.regionalUrl(
                    `/riot/account/v1/accounts/by-puuid/${encodeSegment(puuid)}`,
                ),
            ),
    };

    // --- summoner-v4 (platform) -------------------------------------------

    readonly summoner = {
        byPuuid: (puuid: string): Promise<SummonerDto> =>
            this.get<SummonerDto>(
                "summoner-v4.byPuuid",
                this.platformUrl(
                    `/lol/summoner/v4/summoners/by-puuid/${encodeSegment(puuid)}`,
                ),
            ),
    };

    // --- league-v4 (platform) ---------------------------------------------

    readonly league = {
        entriesByPuuid: (puuid: string): Promise<LeagueEntryDto[]> =>
            this.get<LeagueEntryDto[]>(
                "league-v4.entriesByPuuid",
                this.platformUrl(
                    `/lol/league/v4/entries/by-puuid/${encodeSegment(puuid)}`,
                ),
            ),

        /** Ranked entries split into solo queue and flex. */
        ranksByPuuid: async (puuid: string): Promise<RankedSummary> => {
            const entries = await this.league.entriesByPuuid(puuid);
            return {
                solo: entries.find((entry) => entry.queueType === "RANKED_SOLO_5x5"),
                flex: entries.find((entry) => entry.queueType === "RANKED_FLEX_SR"),
                entries,
            };
        },
    };

    // --- champion-mastery-v4 (platform) -----------------------------------

    readonly championMastery = {
        topByPuuid: (puuid: string, count = 10): Promise<ChampionMasteryDto[]> =>
            this.get<ChampionMasteryDto[]>(
                "champion-mastery-v4.topByPuuid",
                this.platformUrl(
                    `/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeSegment(puuid)}/top`,
                    { count },
                ),
            ),

        scoreByPuuid: (puuid: string): Promise<number> =>
            this.get<number>(
                "champion-mastery-v4.scoreByPuuid",
                this.platformUrl(
                    `/lol/champion-mastery/v4/scores/by-puuid/${encodeSegment(puuid)}`,
                ),
            ),
    };

    // --- match-v5 (regional) ----------------------------------------------

    readonly match = {
        idsByPuuid: (puuid: string, query: MatchIdsQuery = {}): Promise<string[]> =>
            this.get<string[]>(
                "match-v5.idsByPuuid",
                this.regionalUrl(
                    `/lol/match/v5/matches/by-puuid/${encodeSegment(puuid)}/ids`,
                    {
                        start: query.start,
                        count: query.count,
                        queue: query.queue,
                        type: query.type,
                        startTime: query.startTime,
                        endTime: query.endTime,
                    },
                ),
            ),

        byId: (matchId: string): Promise<MatchDto> =>
            this.get<MatchDto>(
                "match-v5.byId",
                this.regionalUrl(`/lol/match/v5/matches/${encodeSegment(matchId)}`),
            ),

        timelineById: (matchId: string): Promise<MatchTimelineDto> =>
            this.get<MatchTimelineDto>(
                "match-v5.timelineById",
                this.regionalUrl(
                    `/lol/match/v5/matches/${encodeSegment(matchId)}/timeline`,
                ),
            ),

        /**
         * Match ids resolved to full matches, sequentially so the rate limiter
         * paces them. Matches that fail with a 404 are skipped.
         */
        recentByPuuid: async (
            puuid: string,
            query: MatchIdsQuery = {},
        ): Promise<MatchDto[]> => {
            const ids = await this.match.idsByPuuid(puuid, query);
            const matches: MatchDto[] = [];
            for (const id of ids) {
                const match = await this.http.requestOrNull<MatchDto>({
                    method: "match-v5.byId",
                    url: this.regionalUrl(`/lol/match/v5/matches/${encodeSegment(id)}`),
                });
                if (match) matches.push(match);
            }
            return matches;
        },
    };

    // --- spectator-v5 (platform) ------------------------------------------

    readonly spectator = {
        /** The player's live game, or `null` when they are not in one. */
        activeGameByPuuid: (puuid: string): Promise<CurrentGameInfo | null> =>
            this.http.requestOrNull<CurrentGameInfo>({
                method: "spectator-v5.activeGameByPuuid",
                url: this.platformUrl(
                    `/lol/spectator/v5/active-games/by-summoner/${encodeSegment(puuid)}`,
                ),
            }),

        featuredGames: (): Promise<FeaturedGames> =>
            this.get<FeaturedGames>(
                "spectator-v5.featuredGames",
                this.platformUrl("/lol/spectator/v5/featured-games"),
            ),
    };
}
