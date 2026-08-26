/**
 * A tiny TTL map.
 *
 * Playstyle profiling reads 50 matches through a rate-limited API; recomputing
 * it on every page view would burn the whole Riot budget. Entries carry their
 * own expiry so different jobs can use different lifetimes.
 */

export type TtlEntry<T> = {
    value: T;
    /** Epoch ms the entry was stored at. */
    storedAt: number;
    expiresAt: number;
};

export type TtlMapOptions = {
    /** Default lifetime in ms. */
    ttlMs: number;
    /** Hard cap on entries; the oldest is dropped first. Default 100. */
    maxEntries?: number;
    now?: () => number;
};

export class TtlMap<T> {
    private readonly entries = new Map<string, TtlEntry<T>>();
    private readonly ttlMs: number;
    private readonly maxEntries: number;
    private readonly now: () => number;

    constructor(options: TtlMapOptions) {
        this.ttlMs = options.ttlMs;
        this.maxEntries = options.maxEntries ?? 100;
        this.now = options.now ?? Date.now;
    }

    get(key: string): T | undefined {
        return this.getEntry(key)?.value;
    }

    getEntry(key: string): TtlEntry<T> | undefined {
        const entry = this.entries.get(key);
        if (!entry) return undefined;
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            return undefined;
        }
        // Refresh recency so the cap evicts genuinely cold entries.
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry;
    }

    set(key: string, value: T, ttlMs = this.ttlMs): T {
        const storedAt = this.now();
        this.entries.delete(key);
        this.entries.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done) break;
            this.entries.delete(oldest.value);
        }
        return value;
    }

    delete(key: string): void {
        this.entries.delete(key);
    }

    clear(): void {
        this.entries.clear();
    }

    get size(): number {
        return this.entries.size;
    }
}
