import { join } from "node:path";

import type { MatchDto } from "@draftpredict/riot";

import {
    DEFAULT_QUEUES,
    MIN_MATCH_DURATION_SECONDS,
    SUMMONERS_RIFT_MAP_ID,
} from "../constants.js";
import { ensureDir } from "../util/fs.js";
import { JsonlShardWriter } from "../util/jsonl.js";
import type { PipelineLogger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import { SeenIdSet } from "./seen-ids.js";
import type { CollectParams } from "./state.js";
import { CollectStateStore } from "./state.js";
import type {
    CollectResult,
    CollectSource,
    CollectStopReason,
    RawMatchRecord,
} from "./types.js";


export type CollectOptions = {
    source: CollectSource;
    /** Run directory: shards, state file and seen-id list live here. */
    outDir: string;
    /** Platform the run pulls from ("euw1"), recorded in the state file. */
    platform?: string;

    /** Queues to walk. Default `[420, 440]`. */
    queues?: readonly number[];
    /** Epoch **seconds**, inclusive. */
    startTime?: number;
    /** Epoch **seconds**, exclusive. */
    endTime?: number;

    /** PUUIDs to seed the frontier with. */
    seedPuuids?: readonly string[];
    /** `gameName#tagLine` seeds, resolved through the source. */
    seedRiotIds?: readonly string[];
    /** Apex ladders to seed from, e.g. `["challenger","grandmaster"]`. */
    seedApex?: readonly ("challenger" | "grandmaster" | "master")[];
    /** Queue the apex ladders are read for. Default `RANKED_SOLO_5x5`. */
    apexQueue?: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR";

    /** Enqueue the players of every collected match. Default `true`. */
    expand?: boolean;
    /** Cap on how many players may ever be queued. Default 100000. */
    maxPlayers?: number;
    /** Stop after writing this many matches in this run. */
    maxMatches?: number;
    /** Match ids to consider per player and queue. Default 100. */
    maxPerPlayer?: number;
    /** Also fetch match timelines (doubles the request cost). */
    timelines?: boolean;

    /** Lines per shard. Default 5000. */
    shardSize?: number;
    /** Gzip shards. Default `true`. */
    gzip?: boolean;
    /** Ignore an existing state file and start over. */
    fresh?: boolean;
    /** Save the state every N matches. Default 25. */
    saveEvery?: number;

    signal?: AbortSignal;
    logger?: PipelineLogger;
    /** Called after every written match, for progress reporting. */
    onProgress?: (progress: {
        matchesWritten: number;
        pending: number;
        matchId: string;
    }) => void;
};

/** Where a run keeps its files. */
export function collectPaths(outDir: string): {
    shards: string;
    state: string;
    seen: string;
} {
    return {
        shards: join(outDir, "shards"),
        state: join(outDir, "state.json"),
        seen: join(outDir, "seen-matches.txt"),
    };
}

/**
 * Walks match histories and writes raw matches to newline-delimited shards.
 *
 * The run is a breadth-first walk: seed players are queued, their matches are
 * fetched, and (with `expand`) the ten players of every match are queued in
 * turn — which is how a handful of apex accounts turns into a region-wide
 * sample. Every side effect is restartable:
 *
 *  - match ids go into an append-only seen-set before the match is fetched,
 *  - the player queue, per-player cursor and shard position live in a state
 *    file that is rewritten atomically every `saveEvery` matches,
 *  - shards are appended to, never rewritten.
 *
 * Interrupting the process (`SIGINT`, a crash, a full disk) therefore costs at
 * most the matches fetched since the last checkpoint, and re-running the same
 * command continues from there.
 */
export async function collectMatches(options: CollectOptions): Promise<CollectResult> {
    const logger = options.logger ?? silentLogger;
    const queues = [...(options.queues ?? DEFAULT_QUEUES)];
    const paths = collectPaths(ensureDir(options.outDir));
    const params: CollectParams = {
        platform: options.platform ?? "unknown",
        queues,
        startTime: options.startTime,
        endTime: options.endTime,
    };

    const store = await CollectStateStore.open(paths.state, params, {
        fresh: options.fresh,
        saveEvery: options.saveEvery,
    });
    if (store.discardedReason) {
        logger.warn(`starting a fresh run: ${store.discardedReason}`);
    } else if (store.resumed) {
        logger.info(
            `resuming: ${store.pending.length} players queued, ${store.stats.matchesWritten} matches already collected`,
        );
    }

    const seen = await SeenIdSet.open(paths.seen);
    const writer = new JsonlShardWriter({
        dir: paths.shards,
        maxLines: options.shardSize,
        gzip: options.gzip,
        startIndex: store.data.shard.index,
        startLines: store.data.shard.lines,
    });

    const maxPlayers = options.maxPlayers ?? 100_000;
    const maxPerPlayer = options.maxPerPlayer ?? 100;
    const expand = options.expand ?? true;
    const pageSize = 100;

    let stopped: CollectStopReason = "complete";
    let error: string | undefined;
    let writtenThisRun = 0;

    const aborted = (): boolean => options.signal?.aborted === true;

    try {
        await seedFrontier(options, store, logger, maxPlayers);

        if (store.pending.length === 0) {
            logger.warn("no players to walk — pass --seed-apex, --seed-summoner or --seed-puuid");
            stopped = "no-seeds";
        }

        walk: while (store.pending.length > 0) {
            if (aborted()) {
                stopped = "aborted";
                break;
            }

            const puuid = store.peek()!;
            const resumeCursor =
                store.data.cursor && store.data.cursor.puuid === puuid
                    ? store.data.cursor
                    : null;

            for (
                let queueIndex = resumeCursor?.queueIndex ?? 0;
                queueIndex < queues.length;
                queueIndex += 1
            ) {
                const queue = queues[queueIndex];
                let start =
                    resumeCursor && resumeCursor.queueIndex === queueIndex
                        ? resumeCursor.start
                        : 0;

                while (start < maxPerPlayer) {
                    if (aborted()) {
                        stopped = "aborted";
                        break walk;
                    }

                    store.setCursor({ puuid, queueIndex, start });
                    const count = Math.min(pageSize, maxPerPlayer - start);
                    let ids: string[];
                    try {
                        ids = await options.source.matchIds(puuid, {
                            start,
                            count,
                            queue,
                            startTime: options.startTime,
                            endTime: options.endTime,
                        });
                    } catch (requestError) {
                        store.stats.errors += 1;
                        logger.warn(
                            `match ids failed for a player (queue ${queue}): ${describe(requestError, logger)}`,
                        );
                        break;
                    }
                    store.stats.requests += 1;

                    for (const matchId of ids) {
                        if (aborted()) {
                            stopped = "aborted";
                            break walk;
                        }
                        if (seen.has(matchId)) {
                            store.stats.duplicates += 1;
                            continue;
                        }
                        await seen.add(matchId);

                        const record = await fetchRecord(
                            matchId,
                            options,
                            store,
                            logger,
                            queues,
                        );
                        if (!record) continue;

                        await writer.write(record);
                        store.stats.matchesWritten += 1;
                        writtenThisRun += 1;
                        store.setShard(writer.shardIndex, writer.shardLines);

                        if (expand) {
                            for (const participantPuuid of record.match.metadata
                                .participants) {
                                store.enqueue(participantPuuid, maxPlayers);
                            }
                        }

                        options.onProgress?.({
                            matchesWritten: store.stats.matchesWritten,
                            pending: store.pending.length,
                            matchId,
                        });
                        await store.tick();

                        if (
                            options.maxMatches !== undefined &&
                            writtenThisRun >= options.maxMatches
                        ) {
                            stopped = "max-matches";
                            break walk;
                        }
                    }

                    if (ids.length < count) break;
                    start += ids.length;
                }
            }

            store.advance();
            await store.tick();
        }
    } catch (runError) {
        stopped = "error";
        error = describe(runError, logger);
        logger.error(`collection failed: ${error}`);
    } finally {
        await writer.close();
        await seen.close();
        store.setShard(writer.shardIndex, writer.shardLines);
        await store.checkpoint();
    }

    return {
        stats: { ...store.stats },
        stopped,
        shards: [...writer.files],
        seenIds: seen.size,
        pending: store.pending.length,
        stateFile: paths.state,
        error,
    };
}

/** Turns seed options into queued players. */
async function seedFrontier(
    options: CollectOptions,
    store: CollectStateStore,
    logger: PipelineLogger,
    maxPlayers: number,
): Promise<void> {
    let added = 0;

    for (const puuid of options.seedPuuids ?? []) {
        if (store.enqueue(puuid.trim(), maxPlayers)) added += 1;
    }

    for (const riotId of options.seedRiotIds ?? []) {
        const [gameName, tagLine] = splitRiotId(riotId);
        if (!gameName || !tagLine) {
            logger.warn(`ignoring seed "${riotId}": expected gameName#tagLine`);
            continue;
        }
        if (!options.source.puuidByRiotId) {
            logger.warn("this source cannot resolve Riot IDs; ignoring summoner seeds");
            break;
        }
        try {
            const puuid = await options.source.puuidByRiotId(gameName, tagLine);
            store.stats.requests += 1;
            if (store.enqueue(puuid, maxPlayers)) added += 1;
        } catch (error) {
            store.stats.errors += 1;
            logger.warn(`could not resolve ${gameName}#${tagLine}: ${describe(error, logger)}`);
        }
    }

    const tiers = options.seedApex ?? [];
    if (tiers.length > 0) {
        if (!options.source.apexPuuids) {
            logger.warn("this source cannot read apex ladders; ignoring --seed-apex");
        } else {
            for (const tier of tiers) {
                try {
                    const puuids = await options.source.apexPuuids(
                        tier,
                        options.apexQueue ?? "RANKED_SOLO_5x5",
                    );
                    store.stats.requests += 1;
                    for (const puuid of puuids) {
                        if (store.enqueue(puuid, maxPlayers)) added += 1;
                    }
                } catch (error) {
                    store.stats.errors += 1;
                    logger.warn(`could not read the ${tier} ladder: ${describe(error, logger)}`);
                }
            }
        }
    }

    if (added > 0) {
        logger.info(`seeded ${added} players (${store.pending.length} queued)`);
        await store.checkpoint();
    }
}

/** Fetches one match (and its timeline) and decides whether to keep it. */
async function fetchRecord(
    matchId: string,
    options: CollectOptions,
    store: CollectStateStore,
    logger: PipelineLogger,
    queues: readonly number[],
): Promise<RawMatchRecord | null> {
    let match: MatchDto | null;
    try {
        match = await options.source.match(matchId);
    } catch (error) {
        store.stats.errors += 1;
        logger.warn(`match ${matchId} failed: ${describe(error, logger)}`);
        return null;
    }
    store.stats.requests += 1;

    if (!match) {
        store.stats.matchesMissing += 1;
        return null;
    }
    if (!isCollectible(match, queues)) {
        store.stats.matchesRejected += 1;
        return null;
    }

    const record: RawMatchRecord = {
        match,
        collectedAt: new Date().toISOString(),
        platform: match.info.platformId,
    };

    if (options.timelines && options.source.timeline) {
        try {
            const timeline = await options.source.timeline(matchId);
            store.stats.requests += 1;
            if (timeline) record.timeline = timeline;
        } catch (error) {
            store.stats.errors += 1;
            logger.warn(`timeline ${matchId} failed: ${describe(error, logger)}`);
        }
    }

    return record;
}

/** Is this match worth a line in a shard? */
export function isCollectible(match: MatchDto, queues: readonly number[]): boolean {
    const info = match.info;
    if (!info) return false;
    if (!queues.includes(info.queueId)) return false;
    if (info.mapId !== SUMMONERS_RIFT_MAP_ID) return false;
    if (info.participants?.length !== 10) return false;

    const duration =
        info.gameEndTimestamp === undefined && info.gameDuration > 10_000
            ? Math.round(info.gameDuration / 1000)
            : Math.round(info.gameDuration);
    if (duration < MIN_MATCH_DURATION_SECONDS) return false;
    if (info.participants.some((participant) => participant.gameEndedInEarlySurrender)) {
        return false;
    }
    return true;
}

export function splitRiotId(riotId: string): [string, string] {
    const [name = "", tag = ""] = riotId.split("#");
    return [name.trim(), tag.trim().replace(/^#/, "")];
}

function describe(error: unknown, logger: PipelineLogger): string {
    const message = error instanceof Error ? error.message : String(error);
    return logger.redact(message);
}
