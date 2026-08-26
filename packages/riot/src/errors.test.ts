import { describe, expect, it } from "vitest";

import {
    REDACTED,
    RiotApiError,
    RiotAuthError,
    RiotNetworkError,
    RiotNotFoundError,
    RiotRateLimitError,
    isRetryable,
    isRiotApiError,
    redactApiKey,
    redactValue,
} from "./errors.js";

const KEY = "RGAPI-12345678-90ab-cdef-1234-567890abcdef";

describe("redaction", () => {
    it("removes RGAPI keys anywhere in a string", () => {
        expect(redactApiKey(`failed with ${KEY} header`)).toBe(
            `failed with ${REDACTED} header`,
        );
    });

    it("removes api_key query parameters", () => {
        expect(redactApiKey("https://x/y?api_key=secret&count=5")).toBe(
            `https://x/y?api_key=${REDACTED}&count=5`,
        );
    });

    it("removes a non RGAPI-shaped key when given", () => {
        expect(redactApiKey("token abc123 used", "abc123")).toBe(
            `token ${REDACTED} used`,
        );
    });

    it("redacts nested metadata and key-ish fields", () => {
        const meta = {
            url: `https://x?api_key=${KEY}`,
            headers: { "X-Riot-Token": KEY },
            nested: [{ note: `key ${KEY}` }],
            count: 3,
        };
        expect(redactValue(meta, KEY)).toEqual({
            url: `https://x?api_key=${REDACTED}`,
            headers: { "X-Riot-Token": REDACTED },
            nested: [{ note: `key ${REDACTED}` }],
            count: 3,
        });
    });
});

describe("typed errors", () => {
    it("never leaks the key in a message", () => {
        const error = new RiotApiError(`boom with ${KEY}`, {
            apiKey: KEY,
            endpoint: "match-v5.byId",
            status: 500,
            retryable: true,
        });
        expect(error.message).not.toContain(KEY);
        expect(error.message).toContain(REDACTED);
        expect(error.endpoint).toBe("match-v5.byId");
        expect(isRiotApiError(error)).toBe(true);
        expect(isRetryable(error)).toBe(true);
        expect(error.toJSON()).toMatchObject({
            code: "RIOT_API_ERROR",
            status: 500,
            retryable: true,
        });
    });

    it("describes an invalid key", () => {
        const error = new RiotAuthError({ status: 403, apiKey: KEY });
        expect(error).toBeInstanceOf(RiotApiError);
        expect(error.message).toBe("Riot API: invalid or expired API key");
        expect(error.code).toBe("FORBIDDEN");
        expect(error.retryable).toBe(false);
        expect(new RiotAuthError({ status: 401 }).code).toBe("UNAUTHORIZED");
    });

    it("keeps 404 and 429 details", () => {
        const notFound = new RiotNotFoundError();
        expect(notFound.status).toBe(404);
        expect(notFound.retryable).toBe(false);

        const limited = new RiotRateLimitError({
            retryAfterSeconds: 12,
            limitType: "application",
        });
        expect(limited.status).toBe(429);
        expect(limited.retryable).toBe(true);
        expect(limited.retryAfterSeconds).toBe(12);
        expect(limited.message).toContain("application");
        expect(limited.message).toContain("12s");
    });

    it("marks network errors retryable with status 0", () => {
        const error = new RiotNetworkError("socket hang up");
        expect(error.status).toBe(0);
        expect(error.retryable).toBe(true);
        expect(error.code).toBe("NETWORK_ERROR");
    });

    it("truncates and redacts the body", () => {
        const error = new RiotApiError("nope", {
            apiKey: KEY,
            body: `${KEY} ${"x".repeat(1000)}`,
        });
        expect(error.body).not.toContain(KEY);
        expect(error.body!.length).toBe(500);
    });
});
