import { describe, expect, it, vi } from "vitest";

import {
    RiotApiError,
    RiotAuthError,
    RiotNetworkError,
    RiotNotFoundError,
    RiotRateLimitError,
} from "./errors.js";
import {
    RiotHttpClient,
    computeBackoffMs,
    parseLimitType,
    parseRetryAfter,
    type RiotHttpOptions,
} from "./http.js";
import { mockFetch, type MockResponse } from "./testing/mock-fetch.js";

const KEY = "RGAPI-12345678-90ab-cdef-1234-567890abcdef";
const URL = "https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_1";

function makeClient(
    responses: readonly MockResponse[],
    overrides: Partial<RiotHttpOptions> = {},
) {
    const fetch = mockFetch(responses);
    let now = 0;
    const client = new RiotHttpClient({
        apiKey: KEY,
        fetch: fetch.fetch,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
        },
        jitter: () => 1,
        timeoutMs: 0,
        ...overrides,
    });
    return { client, fetch, clock: () => now };
}

describe("RiotHttpClient", () => {
    it("sends the key as a header and never in the URL", async () => {
        const { client, fetch } = makeClient([{ body: { ok: true } }]);
        const result = await client.request<{ ok: boolean }>({
            method: "match-v5.byId",
            url: URL,
        });
        expect(result).toEqual({ ok: true });
        expect(fetch.calls[0]!.init.headers["X-Riot-Token"]).toBe(KEY);
        expect(fetch.calls[0]!.url).not.toContain(KEY);
        expect(fetch.calls[0]!.init.method).toBe("GET");
    });

    it("maps 401 and 403 to an auth error without leaking the key", async () => {
        for (const status of [401, 403]) {
            const { client } = makeClient([{ status, text: `bad key ${KEY}` }]);
            const error = await client
                .request({ method: "match-v5.byId", url: URL })
                .catch((caught: unknown) => caught);
            expect(error).toBeInstanceOf(RiotAuthError);
            expect((error as RiotAuthError).message).toBe(
                "Riot API: invalid or expired API key",
            );
            expect((error as RiotAuthError).body).not.toContain(KEY);
        }
    });

    it("maps 404 to a not-found error, or null with requestOrNull", async () => {
        const { client, fetch } = makeClient([{ status: 404 }]);
        await expect(
            client.request({ method: "spectator-v5.activeGameByPuuid", url: URL }),
        ).rejects.toBeInstanceOf(RiotNotFoundError);
        await expect(
            client.requestOrNull({
                method: "spectator-v5.activeGameByPuuid",
                url: URL,
            }),
        ).resolves.toBeNull();
        expect(fetch.count).toBe(2);
    });

    it("never retries a 4xx other than 429", async () => {
        const { client, fetch } = makeClient([{ status: 400, text: "bad request" }]);
        const error = await client
            .request({ method: "match-v5.byId", url: URL })
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(RiotApiError);
        expect((error as RiotApiError).code).toBe("BAD_REQUEST");
        expect((error as RiotApiError).retryable).toBe(false);
        expect(fetch.count).toBe(1);
    });

    it("retries 5xx with exponential backoff and gives up after maxRetries", async () => {
        const { client, fetch, clock } = makeClient([{ status: 503 }], {
            maxRetries: 2,
            retryBaseDelayMs: 100,
        });
        const error = await client
            .request({ method: "match-v5.byId", url: URL })
            .catch((caught: unknown) => caught);
        expect(fetch.count).toBe(3);
        expect((error as RiotApiError).code).toBe("SERVICE_UNAVAILABLE");
        expect((error as RiotApiError).retryable).toBe(true);
        // jitter = 1 -> full delay: 100 + 200.
        expect(clock()).toBe(300);
    });

    it("recovers when a retried 5xx succeeds", async () => {
        const { client, fetch } = makeClient([
            { status: 500 },
            { body: { ok: 1 } },
        ]);
        await expect(
            client.request({ method: "match-v5.byId", url: URL }),
        ).resolves.toEqual({ ok: 1 });
        expect(fetch.count).toBe(2);
    });

    it("honours Retry-After and X-Rate-Limit-Type on 429", async () => {
        const events: unknown[] = [];
        const { client, fetch } = makeClient(
            [
                {
                    status: 429,
                    headers: {
                        "Retry-After": "3",
                        "X-Rate-Limit-Type": "application",
                    },
                },
                { body: { ok: true } },
            ],
            { onRateLimit: (event) => events.push(event) },
        );
        await expect(
            client.request({ method: "match-v5.byId", url: URL }),
        ).resolves.toEqual({ ok: true });
        expect(fetch.count).toBe(2);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            limitType: "application",
            retryAfterSeconds: 3,
            willRetry: true,
            attempt: 0,
        });
        // The limiter was penalised for at least the Retry-After window.
        expect(client.rateLimiter.snapshot().blockedUntil).toBeGreaterThan(0);
    });

    it("throws a rate limit error once retries are exhausted", async () => {
        const { client } = makeClient(
            [{ status: 429, headers: { "retry-after": "1" } }],
            { maxRetries: 1 },
        );
        const error = await client
            .request({ method: "match-v5.byId", url: URL })
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(RiotRateLimitError);
        expect((error as RiotRateLimitError).retryAfterSeconds).toBe(1);
    });

    it("scopes a method rate limit to that method", async () => {
        const { client } = makeClient(
            [{ status: 429, headers: { "retry-after": "2", "x-rate-limit-type": "method" } }],
            { maxRetries: 0 },
        );
        await client
            .request({ method: "match-v5.byId", url: URL })
            .catch(() => undefined);
        expect(client.rateLimiter.estimateWaitMs("match-v5.byId")).toBeGreaterThan(0);
        expect(client.rateLimiter.snapshot().blockedUntil).toBe(0);
    });

    it("retries transport failures", async () => {
        const { client, fetch } = makeClient([
            { throws: new Error("socket hang up") },
            { body: { ok: true } },
        ]);
        await expect(
            client.request({ method: "match-v5.byId", url: URL }),
        ).resolves.toEqual({ ok: true });
        expect(fetch.count).toBe(2);
    });

    it("wraps a permanent transport failure", async () => {
        const { client } = makeClient([{ throws: new Error("ENOTFOUND") }], {
            maxRetries: 1,
        });
        const error = await client
            .request({ method: "match-v5.byId", url: URL })
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(RiotNetworkError);
        expect((error as RiotNetworkError).message).toContain("ENOTFOUND");
    });

    it("rejects malformed JSON", async () => {
        const { client } = makeClient([{ text: "<html>nope</html>" }]);
        const error = await client
            .request({ method: "match-v5.byId", url: URL })
            .catch((caught: unknown) => caught);
        expect((error as RiotApiError).code).toBe("INVALID_JSON");
    });

    it("caches immutable resources and skips the cache for live ones", async () => {
        const { client, fetch } = makeClient([{ body: { ok: true } }]);
        await client.request({ method: "match-v5.byId", url: URL });
        await client.request({ method: "match-v5.byId", url: URL });
        expect(fetch.count).toBe(1);

        await client.request({ method: "spectator-v5.activeGameByPuuid", url: URL });
        await client.request({ method: "spectator-v5.activeGameByPuuid", url: URL });
        expect(fetch.count).toBe(3);
    });

    it("can run without a cache", async () => {
        const { client, fetch } = makeClient([{ body: { ok: true } }], {
            cache: false,
        });
        await client.request({ method: "match-v5.byId", url: URL });
        await client.request({ method: "match-v5.byId", url: URL });
        expect(fetch.count).toBe(2);
        expect(client.cache).toBeUndefined();
    });

    it("redacts the key from every log line", async () => {
        const warn = vi.fn();
        const { client } = makeClient([{ status: 500 }], {
            maxRetries: 1,
            logger: { warn },
        });
        await client
            .request({ method: "match-v5.byId", url: `${URL}?api_key=${KEY}` })
            .catch(() => undefined);
        expect(warn).toHaveBeenCalled();
        for (const call of warn.mock.calls) {
            expect(JSON.stringify(call)).not.toContain(KEY);
        }
    });

    it("refuses to be built without a key", () => {
        expect(() => new RiotHttpClient({ apiKey: "" })).toThrow(RiotAuthError);
    });
});

describe("header parsing and backoff", () => {
    it("parses Retry-After seconds", () => {
        expect(parseRetryAfter("5")).toBe(5);
        expect(parseRetryAfter(" 0 ")).toBe(0);
        expect(parseRetryAfter(null)).toBeUndefined();
        expect(parseRetryAfter("not-a-date")).toBeUndefined();
    });

    it("parses the rate limit type", () => {
        expect(parseLimitType("application")).toBe("application");
        expect(parseLimitType("METHOD")).toBe("method");
        expect(parseLimitType("service")).toBe("service");
        expect(parseLimitType(null)).toBe("unknown");
    });

    it("grows exponentially, jitters and caps", () => {
        expect(computeBackoffMs(0, 100, 10_000, 1)).toBe(100);
        expect(computeBackoffMs(1, 100, 10_000, 1)).toBe(200);
        expect(computeBackoffMs(3, 100, 10_000, 1)).toBe(800);
        expect(computeBackoffMs(0, 100, 10_000, 0)).toBe(50);
        expect(computeBackoffMs(20, 100, 10_000, 1)).toBe(10_000);
    });
});
