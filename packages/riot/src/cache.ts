/**
 * Tiny in-memory TTL cache with LRU eviction.
 *
 * Riot resources have wildly different volatility: a finished match is
 * immutable, ranked entries change every game. TTLs are therefore chosen per
 * endpoint — see {@link DEFAULT_CACHE_TTLS}.
 */

export type TtlCacheOptions = {
    /** Hard cap on stored entries; the least recently used one is evicted. */
    maxEntries?: number;
    now?: () => number;
};

type Entry<T> = { value: T; expiresAt: number };

export class TtlCache<T = unknown> {
    private readonly entries = new Map<string, Entry<T>>();
    private readonly maxEntries: number;
    private readonly now: () => number;
    private hitCount = 0;
    private missCount = 0;

    constructor(options: TtlCacheOptions = {}) {
        this.maxEntries = options.maxEntries ?? 1000;
        this.now = options.now ?? (() => Date.now());
    }

    get size(): number {
        return this.entries.size;
    }

    get stats(): { hits: number; misses: number; size: number } {
        return { hits: this.hitCount, misses: this.missCount, size: this.entries.size };
    }

    has(key: string): boolean {
        return this.peek(key) !== undefined;
    }

    /** Reads without counting a hit/miss and without refreshing LRU order. */
    peek(key: string): T | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return entry.value;
    }

    get(key: string): T | undefined {
        const value = this.peek(key);
        if (value === undefined) {
            this.missCount += 1;
            return undefined;
        }
        this.hitCount += 1;
        // Refresh LRU position.
        const entry = this.entries.get(key)!;
        this.entries.delete(key);
        this.entries.set(key, entry);
        return value;
    }

    /** Stores `value`; a `ttlMs` of `0` or less is a no-op (not cached). */
    set(key: string, value: T, ttlMs: number): void {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
        if (this.entries.has(key)) this.entries.delete(key);
        this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done) break;
            this.entries.delete(oldest.value);
        }
    }

    delete(key: string): boolean {
        return this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
        this.hitCount = 0;
        this.missCount = 0;
    }

    /** Drops expired entries. Cheap enough to call between batches. */
    prune(): number {
        const now = this.now();
        let removed = 0;
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt <= now) {
                this.entries.delete(key);
                removed += 1;
            }
        }
        return removed;
    }
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Logical method names used as cache/rate-limit keys. */
export type RiotMethod =
    | "account-v1.byRiotId"
    | "account-v1.byPuuid"
    | "summoner-v4.byPuuid"
    | "league-v4.entriesByPuuid"
    | "champion-mastery-v4.topByPuuid"
    | "champion-mastery-v4.scoreByPuuid"
    | "match-v5.idsByPuuid"
    | "match-v5.byId"
    | "match-v5.timelineById"
    | "spectator-v5.activeGameByPuuid"
    | "spectator-v5.featuredGames";

/**
 * Default cache lifetimes.
 *
 * A finished match and its timeline never change, so they are held for a day
 * (the process is expected to be short-lived; the disk cache in
 * `@draftpredict/data` is the long-term store). Everything that reflects live
 * state gets seconds, not minutes.
 */
export const DEFAULT_CACHE_TTLS: Record<RiotMethod, number> = {
    "account-v1.byRiotId": 12 * HOUR,
    "account-v1.byPuuid": 12 * HOUR,
    "summoner-v4.byPuuid": 10 * MINUTE,
    "league-v4.entriesByPuuid": 60 * SECOND,
    "champion-mastery-v4.topByPuuid": 5 * MINUTE,
    "champion-mastery-v4.scoreByPuuid": 5 * MINUTE,
    "match-v5.idsByPuuid": 60 * SECOND,
    "match-v5.byId": 24 * HOUR,
    "match-v5.timelineById": 24 * HOUR,
    // Live game state: never cached (0 disables caching entirely).
    "spectator-v5.activeGameByPuuid": 0,
    "spectator-v5.featuredGames": 30 * SECOND,
};
