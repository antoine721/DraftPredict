import { describe, expect, it } from "vitest";

import { DEV_KEY_RATE_LIMITS, RateLimiter } from "./rate-limiter.js";

/** Virtual clock: `sleep` simply moves time forward. */
function fakeClock(start = 0) {
    let current = start;
    return {
        now: () => current,
        sleep: async (ms: number) => {
            current += ms;
        },
        advance: (ms: number) => {
            current += ms;
        },
        get time() {
            return current;
        },
    };
}

describe("RateLimiter", () => {
    it("lets a burst through up to the bucket size", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 5, seconds: 1 }],
            now: clock.now,
            sleep: clock.sleep,
        });
        for (let i = 0; i < 5; i += 1) await limiter.acquire();
        expect(clock.time).toBe(0);
    });

    it("waits for a refill once the bucket is empty", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 5, seconds: 1 }],
            now: clock.now,
            sleep: clock.sleep,
        });
        for (let i = 0; i < 5; i += 1) await limiter.acquire();
        await limiter.acquire();
        // 5 requests per 1000ms -> one token every 200ms.
        expect(clock.time).toBe(200);
    });

    it("enforces the slowest of several windows (20/s and 100/2min)", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: DEV_KEY_RATE_LIMITS,
            now: clock.now,
            sleep: clock.sleep,
        });
        for (let i = 0; i < 100; i += 1) await limiter.acquire();
        // 20/s allows the first 20 instantly, then one every 50ms up to 100.
        expect(clock.time).toBe(80 * 50);

        // Serving 150 requests needs 50 tokens more than the 2-minute bucket
        // holds, and it only refills at 100/120s, so the long window takes
        // over: ~60s instead of the 7.5s the per-second window would allow.
        for (let i = 100; i < 150; i += 1) await limiter.acquire();
        expect(clock.time).toBeGreaterThan(55_000);
    });

    it("serialises concurrent acquires without double spending", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 2, seconds: 1 }],
            now: clock.now,
            sleep: clock.sleep,
        });
        const order: number[] = [];
        await Promise.all(
            [0, 1, 2, 3].map(async (index) => {
                await limiter.acquire();
                order.push(index);
            }),
        );
        expect(order).toEqual([0, 1, 2, 3]);
        // Two immediate, then one token every 500ms.
        expect(clock.time).toBe(1_000);
    });

    it("honours a Retry-After penalty for every method", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 10, seconds: 1 }],
            now: clock.now,
            sleep: clock.sleep,
        });
        limiter.penalize(5);
        expect(limiter.estimateWaitMs()).toBe(5_000);
        await limiter.acquire();
        expect(clock.time).toBeGreaterThanOrEqual(5_000);
    });

    it("scopes a method penalty to that method only", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 10, seconds: 1 }],
            methodRules: { "match-v5.byId": [{ requests: 10, seconds: 1 }] },
            now: clock.now,
            sleep: clock.sleep,
        });
        await limiter.acquire("match-v5.byId");
        limiter.penalize(3, { scope: "method", method: "match-v5.byId" });
        expect(limiter.estimateWaitMs("match-v5.byId")).toBe(3_000);
        expect(limiter.estimateWaitMs("summoner-v4.byPuuid")).toBe(0);
        await limiter.acquire("summoner-v4.byPuuid");
        expect(clock.time).toBe(0);
    });

    it("applies per-method limits on top of the application limits", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 100, seconds: 1 }],
            methodRules: { "match-v5.byId": [{ requests: 2, seconds: 1 }] },
            now: clock.now,
            sleep: clock.sleep,
        });
        await limiter.acquire("match-v5.byId");
        await limiter.acquire("match-v5.byId");
        await limiter.acquire("match-v5.byId");
        expect(clock.time).toBe(500);
    });

    it("reports a snapshot for the UI", async () => {
        const clock = fakeClock();
        const limiter = new RateLimiter({
            rules: [{ requests: 4, seconds: 1 }],
            now: clock.now,
            sleep: clock.sleep,
        });
        await limiter.acquire();
        const snapshot = limiter.snapshot();
        expect(snapshot.application[0]).toMatchObject({ requests: 4, seconds: 1 });
        expect(snapshot.application[0]!.available).toBeCloseTo(3, 5);
    });
});
