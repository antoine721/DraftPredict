import type { Rank, Region, RiskLevel } from "@draftpredict/core";

/**
 * The server's own settings.
 *
 * `riotApiKey` is the only secret here: it lives in `~/.draftpredict/config.json`
 * (mode 0600) or in the environment, and it never crosses the wire — see
 * {@link PublicConfig}.
 */
export type ServerConfig = {
    riotApiKey: string | null;
    /** Riot platform routing value used by default, e.g. `euw1`. */
    platform: string;
    rank: Rank;
    region: Region;
    riskLevel: RiskLevel;
    minGames: number;
    ignoreChampionWinrates: boolean;
    /** Start the League Client watcher at boot. */
    lcuEnabled: boolean;
    /** Allow the DraftGap remote provider. Off => offline demo data only. */
    allowRemoteDataset: boolean;
    /** Directory holding datasets produced by `apps/pipeline`. */
    datasetLocalRoot: string | null;
    language: string;
    theme: "dark" | "light" | "system";
};

/** Where each effective value came from, so Settings can explain itself. */
export type ConfigOrigin = "default" | "env" | "file";

export type PublicConfig = Omit<ServerConfig, "riotApiKey"> & {
    hasRiotApiKey: boolean;
    /** `RGAPI-****1234` — enough to recognise a key, useless to steal. */
    riotApiKeyPreview: string | null;
    riotApiKeySource: ConfigOrigin | null;
    /** Absolute path of the config file (it may not exist yet). */
    configPath: string;
};

export type RiotKeyProbeResult = {
    /** Whether a live call was attempted at all. */
    attempted: boolean;
    /** `true` only when Riot answered and accepted the key. */
    ok: boolean;
    /** Machine-readable outcome: `ok`, `unauthorized`, `unreachable`, `skipped`. */
    status: "ok" | "unauthorized" | "unreachable" | "skipped";
    /** Human-readable, always redacted. */
    message: string;
};
