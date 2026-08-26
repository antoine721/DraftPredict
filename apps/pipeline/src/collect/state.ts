import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ensureDir, writeFileAtomic } from "../util/fs.js";
import type { CollectStats } from "./types.js";
import { emptyCollectStats } from "./types.js";

/** Bumped whenever the on-disk shape changes incompatibly. */
export const COLLECT_STATE_VERSION = 1;

/**
 * The parameters a resumed run must agree with. Changing any of them means the
 * shards would mix two different samples, so the state is started over instead.
 */
export type CollectParams = {
    platform: string;
    queues: number[];
    startTime?: number;
    endTime?: number;
};

export type CollectCursor = {
    puuid: string;
    /** Index into `params.queues` being walked. */
    queueIndex: number;
    /** `start` offset already consumed for that queue. */
    start: number;
};

export type CollectStateData = {
    version: number;
    createdAt: string;
    updatedAt: string;
    params: CollectParams;
    /** Players whose history still has to be walked, oldest first. */
    pending: string[];
    /** Every player ever enqueued, so expansion never loops. */
    queued: string[];
    cursor: CollectCursor | null;
    stats: CollectStats;
    shard: { index: number; lines: number };
};

export function emptyCollectState(params: CollectParams): CollectStateData {
    const now = new Date().toISOString();
    return {
        version: COLLECT_STATE_VERSION,
        createdAt: now,
        updatedAt: now,
        params,
        pending: [],
        queued: [],
        cursor: null,
        stats: emptyCollectStats(),
        shard: { index: 0, lines: 0 },
    };
}

/** Same sample? Two runs may only share a state file when these agree. */
export function paramsMatch(a: CollectParams, b: CollectParams): boolean {
    return (
        a.platform === b.platform &&
        a.startTime === b.startTime &&
        a.endTime === b.endTime &&
        a.queues.length === b.queues.length &&
        a.queues.every((queue, index) => queue === b.queues[index])
    );
}

export type LoadCollectStateOptions = {
    /** Ignore any existing file and start over. */
    fresh?: boolean;
};

export type LoadedCollectState = {
    data: CollectStateData;
    /** Whether an existing, compatible state file was picked up. */
    resumed: boolean;
    /** Set when a state file existed but could not be reused. */
    discardedReason?: string;
};

/** Reads the state file, falling back to a fresh state on any mismatch. */
export async function loadCollectState(
    path: string,
    params: CollectParams,
    options: LoadCollectStateOptions = {},
): Promise<LoadedCollectState> {
    if (options.fresh || !existsSync(path)) {
        return { data: emptyCollectState(params), resumed: false };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
        return {
            data: emptyCollectState(params),
            resumed: false,
            discardedReason: `state file is unreadable (${
                error instanceof Error ? error.message : String(error)
            })`,
        };
    }

    const data = parsed as Partial<CollectStateData> | null;
    if (!data || typeof data !== "object" || data.version !== COLLECT_STATE_VERSION) {
        return {
            data: emptyCollectState(params),
            resumed: false,
            discardedReason: "state file has an incompatible version",
        };
    }
    if (!data.params || !paramsMatch(data.params, params)) {
        return {
            data: emptyCollectState(params),
            resumed: false,
            discardedReason: "state file was written for different parameters",
        };
    }

    return {
        data: {
            ...emptyCollectState(params),
            ...data,
            params,
            stats: { ...emptyCollectStats(), ...(data.stats ?? {}) },
            shard: data.shard ?? { index: 0, lines: 0 },
            pending: data.pending ?? [],
            queued: data.queued ?? [],
            cursor: data.cursor ?? null,
        },
        resumed: true,
    };
}

export async function saveCollectState(
    path: string,
    data: CollectStateData,
): Promise<void> {
    ensureDir(dirname(path));
    data.updatedAt = new Date().toISOString();
    await writeFileAtomic(path, JSON.stringify(data, null, 4));
}

/**
 * The live state of a run: an in-memory queue plus a throttled writer.
 *
 * Saving on every match would dominate the run's I/O; saving only at the end
 * would lose everything on a `SIGINT`. So it saves every `saveEvery` matches
 * and on every explicit checkpoint (shard rotation, shutdown).
 */
export class CollectStateStore {
    readonly path: string;
    readonly data: CollectStateData;
    readonly resumed: boolean;
    readonly discardedReason: string | undefined;

    private readonly queued: Set<string>;
    private readonly saveEvery: number;
    private readonly minSaveIntervalMs: number;
    private readonly now: () => number;
    private sinceSave = 0;
    private lastSaveAt = 0;

    constructor(
        path: string,
        loaded: LoadedCollectState,
        options: { saveEvery?: number; minSaveIntervalMs?: number; now?: () => number } = {},
    ) {
        this.path = path;
        this.data = loaded.data;
        this.resumed = loaded.resumed;
        this.discardedReason = loaded.discardedReason;
        this.queued = new Set(loaded.data.queued);
        this.saveEvery = Math.max(1, options.saveEvery ?? 25);
        // The queue can hold tens of thousands of players, so a checkpoint is
        // not free. Rewriting it more than once every couple of seconds buys
        // nothing: the seen-id list, not this file, is what prevents duplicate
        // work after a crash.
        this.minSaveIntervalMs = Math.max(0, options.minSaveIntervalMs ?? 2000);
        this.now = options.now ?? (() => Date.now());
        this.lastSaveAt = this.now();
    }

    static async open(
        path: string,
        params: CollectParams,
        options: LoadCollectStateOptions & {
            saveEvery?: number;
            minSaveIntervalMs?: number;
            now?: () => number;
        } = {},
    ): Promise<CollectStateStore> {
        const loaded = await loadCollectState(path, params, options);
        return new CollectStateStore(path, loaded, options);
    }

    get pending(): string[] {
        return this.data.pending;
    }

    get stats(): CollectStats {
        return this.data.stats;
    }

    /** Queues a player unless they have been queued before. */
    enqueue(puuid: string, limit = Number.POSITIVE_INFINITY): boolean {
        if (!puuid || this.queued.has(puuid)) return false;
        if (this.queued.size >= limit) return false;
        this.queued.add(puuid);
        this.data.queued.push(puuid);
        this.data.pending.push(puuid);
        return true;
    }

    hasQueued(puuid: string): boolean {
        return this.queued.has(puuid);
    }

    /** The player at the head of the queue, without removing them. */
    peek(): string | undefined {
        return this.data.pending[0];
    }

    /** Drops the head of the queue and clears the cursor. */
    advance(): void {
        this.data.pending.shift();
        this.data.cursor = null;
        this.data.stats.playersProcessed += 1;
    }

    setCursor(cursor: CollectCursor | null): void {
        this.data.cursor = cursor;
    }

    setShard(index: number, lines: number): void {
        this.data.shard = { index, lines };
    }

    /** Saves when enough has happened since the last write. */
    async tick(): Promise<void> {
        this.sinceSave += 1;
        if (this.sinceSave < this.saveEvery) return;
        const elapsed = this.now() - this.lastSaveAt;
        if (elapsed < this.minSaveIntervalMs && this.sinceSave < this.saveEvery * 10) {
            return;
        }
        await this.checkpoint();
    }

    /** Forces a save. */
    async checkpoint(): Promise<void> {
        this.sinceSave = 0;
        this.lastSaveAt = this.now();
        await saveCollectState(this.path, this.data);
    }
}
