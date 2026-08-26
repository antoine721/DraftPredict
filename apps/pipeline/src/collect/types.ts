import type { MatchDto, MatchTimelineDto } from "@draftpredict/riot";

/** One line of a raw shard: a match, optionally with its timeline. */
export type RawMatchRecord = {
    match: MatchDto;
    /** Present only when the run was started with `--timelines`. */
    timeline?: MatchTimelineDto;
    /** ISO timestamp of when the match was pulled. */
    collectedAt?: string;
    /** Platform the match was pulled from, e.g. "euw1". */
    platform?: string;
};

/** Ranked tiers that have their own apex league endpoint. */
export type ApexTier = "challenger" | "grandmaster" | "master";

export const APEX_TIERS: readonly ApexTier[] = ["challenger", "grandmaster", "master"];

export type ApexQueue = "RANKED_SOLO_5x5" | "RANKED_FLEX_SR";

export type MatchIdQuery = {
    start?: number;
    count?: number;
    queue?: number;
    /** Epoch **seconds**, as match-v5 wants them. */
    startTime?: number;
    endTime?: number;
};

/**
 * Everything the collector needs from the outside world.
 *
 * A structural type rather than the concrete `RiotApiClient` so the collector
 * can be driven by a fake in tests — no network, no API key, no rate limiter.
 */
export type CollectSource = {
    /** Match ids for a player, newest first. */
    matchIds(puuid: string, query: MatchIdQuery): Promise<string[]>;
    /** A finished match, or `null` when Riot no longer has it. */
    match(matchId: string): Promise<MatchDto | null>;
    /** The match timeline, when the run collects builds. */
    timeline?(matchId: string): Promise<MatchTimelineDto | null>;
    /** PUUIDs of an apex league, used to seed a run. */
    apexPuuids?(tier: ApexTier, queue: ApexQueue): Promise<string[]>;
    /** Resolves `gameName#tagLine` to a PUUID. */
    puuidByRiotId?(gameName: string, tagLine: string): Promise<string>;
};

export type CollectStats = {
    /** Matches appended to a shard. */
    matchesWritten: number;
    /** Matches fetched but rejected (wrong queue/map, remake, unusable roles). */
    matchesRejected: number;
    /** Ids skipped because they were already in the seen set. */
    duplicates: number;
    /** Matches Riot could not return (404 / gone). */
    matchesMissing: number;
    /** Players whose match history was walked to the end. */
    playersProcessed: number;
    /** Requests issued through the source (ids + matches + timelines). */
    requests: number;
    errors: number;
};

export function emptyCollectStats(): CollectStats {
    return {
        matchesWritten: 0,
        matchesRejected: 0,
        duplicates: 0,
        matchesMissing: 0,
        playersProcessed: 0,
        requests: 0,
        errors: 0,
    };
}

export type CollectStopReason =
    | "complete"
    | "max-matches"
    | "aborted"
    | "no-seeds"
    | "error";

export type CollectResult = {
    stats: CollectStats;
    stopped: CollectStopReason;
    /** Shard files written or appended to during this run. */
    shards: string[];
    /** Match ids known after the run (written this run or previously). */
    seenIds: number;
    /** Players still queued — a resumed run picks up here. */
    pending: number;
    stateFile: string;
    error?: string;
};
