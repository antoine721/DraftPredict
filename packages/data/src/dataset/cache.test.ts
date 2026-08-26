import { describe, expect, it } from "vitest";
import { LruCache } from "./cache.js";

function clock(start = 1000) {
    let now = start;
    return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("LruCache", () => {
    it("evicts the least recently used entry", () => {
        const cache = new LruCache<number>({ maxEntries: 2 });
        cache.set("a", 1);
        cache.set("b", 2);
        cache.get("a"); // "a" is now the most recent
        cache.set("c", 3);

        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("a")).toBe(1);
        expect(cache.get("c")).toBe(3);
        expect(cache.size).toBe(2);
    });

    it("expires entries after the ttl", () => {
        const time = clock();
        const cache = new LruCache<string>({ ttlMs: 100, now: time.now });
        cache.set("k", "v");

        time.advance(99);
        expect(cache.get("k")).toBe("v");

        time.advance(2);
        expect(cache.get("k")).toBeUndefined();
        // Still readable as a stale fallback.
        expect(cache.peekStale("k")?.value).toBe("v");
    });

    it("treats a ttl of zero as no expiry", () => {
        const time = clock();
        const cache = new LruCache<string>({ ttlMs: 0, now: time.now });
        cache.set("k", "v");
        time.advance(1_000_000);
        expect(cache.get("k")).toBe("v");
    });

    it("supports a per-entry ttl", () => {
        const time = clock();
        const cache = new LruCache<string>({ ttlMs: 1000, now: time.now });
        cache.set("short", "a", 10);
        cache.set("long", "b");

        time.advance(20);
        expect(cache.get("short")).toBeUndefined();
        expect(cache.get("long")).toBe("b");
    });

    it("deletes and clears", () => {
        const cache = new LruCache<number>();
        cache.set("a", 1);
        expect(cache.delete("a")).toBe(true);
        expect(cache.has("a")).toBe(false);

        cache.set("b", 2);
        cache.clear();
        expect(cache.keys()).toEqual([]);
    });
});
