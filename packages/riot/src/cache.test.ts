import { describe, expect, it } from "vitest";

import { DEFAULT_CACHE_TTLS, TtlCache } from "./cache.js";

describe("TtlCache", () => {
    it("stores and reads a value", () => {
        const cache = new TtlCache<number>();
        cache.set("a", 1, 1_000);
        expect(cache.get("a")).toBe(1);
        expect(cache.stats.hits).toBe(1);
    });

    it("expires entries", () => {
        let now = 0;
        const cache = new TtlCache<number>({ now: () => now });
        cache.set("a", 1, 100);
        now = 99;
        expect(cache.get("a")).toBe(1);
        now = 100;
        expect(cache.get("a")).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it("ignores non-positive TTLs (live resources are never cached)", () => {
        const cache = new TtlCache<number>();
        cache.set("live", 1, 0);
        expect(cache.get("live")).toBeUndefined();
        expect(cache.size).toBe(0);
    });

    it("evicts the least recently used entry", () => {
        const cache = new TtlCache<number>({ maxEntries: 2 });
        cache.set("a", 1, 1_000);
        cache.set("b", 2, 1_000);
        expect(cache.get("a")).toBe(1); // refresh a
        cache.set("c", 3, 1_000);
        expect(cache.get("b")).toBeUndefined();
        expect(cache.get("a")).toBe(1);
        expect(cache.get("c")).toBe(3);
    });

    it("prunes expired entries", () => {
        let now = 0;
        const cache = new TtlCache<number>({ now: () => now });
        cache.set("a", 1, 10);
        cache.set("b", 2, 100);
        now = 50;
        expect(cache.prune()).toBe(1);
        expect(cache.size).toBe(1);
    });

    it("gives immutable resources a long TTL and live ones none", () => {
        expect(DEFAULT_CACHE_TTLS["match-v5.byId"]).toBeGreaterThanOrEqual(
            60 * 60 * 1000,
        );
        expect(DEFAULT_CACHE_TTLS["match-v5.timelineById"]).toBe(
            DEFAULT_CACHE_TTLS["match-v5.byId"],
        );
        expect(DEFAULT_CACHE_TTLS["spectator-v5.activeGameByPuuid"]).toBe(0);
        expect(DEFAULT_CACHE_TTLS["league-v4.entriesByPuuid"]).toBeLessThanOrEqual(
            60_000,
        );
    });
});
