import {
    DEFAULT_RANK,
    DEFAULT_REGION,
    DEFAULT_RISK_LEVEL,
    parseRank,
    parseRegion,
    parseRiskLevel,
} from "@draftpredict/core";
import { RiotApiClient, isRiotApiError } from "@draftpredict/riot";
import { ApiError } from "../errors.js";
import type { ConfigFileInput, ConfigUpdateInput } from "./schema.js";
import { isRiotApiKeyShape, previewRiotApiKey } from "./schema.js";
import { ConfigStore } from "./store.js";
import type {
    ConfigOrigin,
    PublicConfig,
    RiotKeyProbeResult,
    ServerConfig,
} from "./types.js";

/**
 * The single source of truth for settings.
 *
 * Precedence is defaults < environment < config file, so an operator can pin a
 * key with `RIOT_API_KEY` and a user can still change their rank in the UI
 * without the two fighting. Nothing here ever returns the key itself.
 */

export const DEFAULT_PORT = 4700;
export const DEFAULT_PLATFORM = "euw1";

export type RiotKeyProbe = (
    apiKey: string,
    platform: string,
) => Promise<RiotKeyProbeResult>;

export type ConfigServiceOptions = {
    store?: ConfigStore;
    env?: NodeJS.ProcessEnv;
    /** Live key check. Defaults to a real, short-timeout Riot call. */
    probe?: RiotKeyProbe;
    /** Set `false` to never touch the network when saving a key. */
    allowProbe?: boolean;
};

export type ConfigChangeListener = (config: PublicConfig) => void;

export class ConfigService {
    readonly store: ConfigStore;

    private readonly env: NodeJS.ProcessEnv;
    private readonly probe: RiotKeyProbe;
    private readonly allowProbe: boolean;
    private readonly listeners = new Set<ConfigChangeListener>();

    private file: ConfigFileInput;

    constructor(options: ConfigServiceOptions = {}) {
        this.store = options.store ?? new ConfigStore();
        this.env = options.env ?? process.env;
        this.probe = options.probe ?? defaultRiotKeyProbe;
        this.allowProbe = options.allowProbe ?? true;
        this.file = this.store.read();
    }

    // -------------------------------------------------------------- reads ---

    /** The effective configuration, key included. Never serialise this. */
    get(): ServerConfig {
        const env = this.envConfig();
        return {
            riotApiKey: this.file.riotApiKey ?? env.riotApiKey ?? null,
            platform: this.file.platform ?? env.platform ?? DEFAULT_PLATFORM,
            rank: this.file.rank ?? env.rank ?? DEFAULT_RANK,
            region: this.file.region ?? env.region ?? DEFAULT_REGION,
            riskLevel: this.file.riskLevel ?? env.riskLevel ?? DEFAULT_RISK_LEVEL,
            minGames: this.file.minGames ?? env.minGames ?? 1000,
            ignoreChampionWinrates: this.file.ignoreChampionWinrates ?? false,
            lcuEnabled: this.file.lcuEnabled ?? env.lcuEnabled ?? true,
            allowRemoteDataset:
                this.file.allowRemoteDataset ?? env.allowRemoteDataset ?? true,
            datasetLocalRoot:
                this.file.datasetLocalRoot ?? env.datasetLocalRoot ?? null,
            language: this.file.language ?? "en_US",
            theme: this.file.theme ?? "dark",
        };
    }

    /** The safe projection: what `GET /api/config` returns. */
    getPublic(): PublicConfig {
        const config = this.get();
        const { riotApiKey, ...rest } = config;
        return {
            ...rest,
            hasRiotApiKey: Boolean(riotApiKey),
            riotApiKeyPreview: previewRiotApiKey(riotApiKey),
            riotApiKeySource: this.riotApiKeySource(),
            configPath: this.store.path,
        };
    }

    getRiotApiKey(): string | null {
        return this.get().riotApiKey;
    }

    hasRiotApiKey(): boolean {
        return Boolean(this.get().riotApiKey);
    }

    /** Throws the documented 428 when no key is configured. */
    requireRiotApiKey(): string {
        const key = this.getRiotApiKey();
        if (!key) throw ApiError.riotKeyMissing();
        return key;
    }

    riotApiKeySource(): ConfigOrigin | null {
        if (this.file.riotApiKey) return "file";
        if (this.env.RIOT_API_KEY) return "env";
        return null;
    }

    /** `PORT`, or 4700. */
    port(): number {
        const raw = this.env.PORT;
        const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
    }

    // ------------------------------------------------------------- writes ---

    /**
     * Validates, optionally probes, then persists.
     *
     * The probe is best-effort by design: the dev container (and plenty of
     * real machines behind a proxy) cannot reach `api.riotgames.com`, and
     * refusing to save a perfectly good key because of that would be worse
     * than saving one that turns out to be expired.
     */
    async update(
        patch: ConfigUpdateInput,
    ): Promise<{ config: PublicConfig; probe: RiotKeyProbeResult }> {
        const { validateKey, ...rest } = patch;
        const next: ConfigFileInput = { ...rest };

        let probe: RiotKeyProbeResult = {
            attempted: false,
            ok: false,
            status: "skipped",
            message: "No API key was submitted",
        };

        if ("riotApiKey" in next) {
            const raw = next.riotApiKey;
            if (raw === null || raw === "") {
                next.riotApiKey = null;
                probe = {
                    attempted: false,
                    ok: false,
                    status: "skipped",
                    message: "API key cleared",
                };
            } else if (typeof raw === "string") {
                const key = raw.trim();
                if (!isRiotApiKeyShape(key)) {
                    throw new ApiError(
                        400,
                        "RIOT_KEY_INVALID",
                        "That does not look like a Riot API key. Keys start with " +
                            '"RGAPI-" and are issued at developer.riotgames.com.',
                    );
                }
                next.riotApiKey = key;

                const platform = next.platform ?? this.get().platform;
                probe =
                    validateKey === false || !this.allowProbe
                        ? {
                              attempted: false,
                              ok: false,
                              status: "skipped",
                              message: "Live validation was skipped",
                          }
                        : await this.runProbe(key, platform);

                if (probe.status === "unauthorized") {
                    throw new ApiError(
                        400,
                        "RIOT_KEY_REJECTED",
                        "Riot rejected this API key. Development keys expire after " +
                            "24 hours — generate a new one at developer.riotgames.com.",
                    );
                }
            }
        }

        this.file = this.store.write(next);
        const config = this.getPublic();
        this.emit(config);
        return { config, probe };
    }

    /** Re-reads the file from disk (used after an external edit). */
    reload(): PublicConfig {
        this.file = this.store.read();
        const config = this.getPublic();
        this.emit(config);
        return config;
    }

    onChange(listener: ConfigChangeListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // ---------------------------------------------------------- internals ---

    private emit(config: PublicConfig): void {
        for (const listener of this.listeners) {
            try {
                listener(config);
            } catch {
                // A misbehaving listener must not fail the write that just
                // succeeded on disk.
            }
        }
    }

    private async runProbe(
        key: string,
        platform: string,
    ): Promise<RiotKeyProbeResult> {
        try {
            return await this.probe(key, platform);
        } catch (error) {
            return {
                attempted: true,
                ok: false,
                status: "unreachable",
                message: describeUnreachable(error),
            };
        }
    }

    private envConfig(): Partial<ServerConfig> {
        const env = this.env;
        const out: Partial<ServerConfig> = {};

        const key = env.RIOT_API_KEY?.trim();
        if (key) out.riotApiKey = key;

        const platform = env.DRAFTPREDICT_PLATFORM?.trim();
        if (platform) out.platform = platform;

        const rank = env.DRAFTPREDICT_RANK ? parseRank(env.DRAFTPREDICT_RANK) : undefined;
        if (rank) out.rank = rank;

        const region = env.DRAFTPREDICT_REGION
            ? parseRegion(env.DRAFTPREDICT_REGION)
            : undefined;
        if (region) out.region = region;

        const riskLevel = env.DRAFTPREDICT_RISK_LEVEL
            ? parseRiskLevel(env.DRAFTPREDICT_RISK_LEVEL)
            : undefined;
        if (riskLevel) out.riskLevel = riskLevel;

        const minGames = env.DRAFTPREDICT_MIN_GAMES
            ? Number.parseInt(env.DRAFTPREDICT_MIN_GAMES, 10)
            : Number.NaN;
        if (Number.isFinite(minGames) && minGames >= 0) out.minGames = minGames;

        if (env.DRAFTPREDICT_LCU === "0" || env.DRAFTPREDICT_LCU === "false") {
            out.lcuEnabled = false;
        }
        if (env.DRAFTPREDICT_OFFLINE === "1" || env.DRAFTPREDICT_OFFLINE === "true") {
            out.allowRemoteDataset = false;
        }
        const localRoot = env.DRAFTPREDICT_DATASET_DIR?.trim();
        if (localRoot) out.datasetLocalRoot = localRoot;

        return out;
    }
}

function describeUnreachable(error: unknown): string {
    if (isRiotApiError(error)) return error.message;
    return "Riot could not be reached, so the key was not verified.";
}

/**
 * The default probe: one cheap, key-only call with a short timeout and no
 * retries. `featured-games` needs nothing but a valid key.
 */
export const defaultRiotKeyProbe: RiotKeyProbe = async (apiKey, platform) => {
    try {
        const client = new RiotApiClient({
            apiKey,
            platform,
            maxRetries: 0,
            timeoutMs: 4000,
            cache: false,
        });
        await client.spectator.featuredGames();
        return {
            attempted: true,
            ok: true,
            status: "ok",
            message: "Riot accepted the key.",
        };
    } catch (error) {
        if (isRiotApiError(error) && (error.status === 401 || error.status === 403)) {
            return {
                attempted: true,
                ok: false,
                status: "unauthorized",
                message: error.message,
            };
        }
        return {
            attempted: true,
            ok: false,
            status: "unreachable",
            message: describeUnreachable(error),
        };
    }
};
