/**
 * A small LRU with per-entry TTL.
 *
 * Datasets are tens of megabytes each, so the memory tier holds a handful of
 * them and evicts the least recently used. Expiry is lazy — an expired entry
 * is still readable through {@link LruCache.peekStale}, which is what lets the
 * service serve stale data when every provider is down.
 */
export type CacheEntry<V> = {
    value: V;
    storedAt: number;
    expiresAt: number;
};

export type LruCacheOptions = {
    maxEntries?: number;
    /** Entry lifetime in ms. `0` or `Infinity` disables expiry. */
    ttlMs?: number;
    /** Clock, injectable so tests do not have to sleep. */
    now?: () => number;
};

export class LruCache<V> {
    private readonly entries = new Map<string, CacheEntry<V>>();
    private readonly maxEntries: number;
    private readonly ttlMs: number;
    private readonly now: () => number;

    constructor(options: LruCacheOptions = {}) {
        this.maxEntries = Math.max(1, options.maxEntries ?? 8);
        this.ttlMs = options.ttlMs ?? 0;
        this.now = options.now ?? Date.now;
    }

    get size(): number {
        return this.entries.size;
    }

    keys(): string[] {
        return [...this.entries.keys()];
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /** The entry, or `undefined` when missing or expired. Refreshes recency. */
    get(key: string): V | undefined {
        return this.getEntry(key)?.value;
    }

    getEntry(key: string): CacheEntry<V> | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;

        if (this.isExpired(entry)) return undefined;

        // Re-insert to mark as most recently used.
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry;
    }

    /** The entry even when expired, without touching recency. */
    peekStale(key: string): CacheEntry<V> | undefined {
        return this.entries.get(key);
    }

    isExpired(entry: CacheEntry<V>): boolean {
        return entry.expiresAt !== Infinity && entry.expiresAt <= this.now();
    }

    set(key: string, value: V, ttlMs = this.ttlMs): void {
        const storedAt = this.now();
        this.entries.delete(key);
        this.entries.set(key, {
            value,
            storedAt,
            expiresAt:
                ttlMs > 0 && Number.isFinite(ttlMs) ? storedAt + ttlMs : Infinity,
        });

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
    }
}
