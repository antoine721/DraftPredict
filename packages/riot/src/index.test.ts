import { describe, expect, it } from "vitest";

import * as riot from "./index.js";

describe("public surface", () => {
    it("exports the client, match analysis and playstyle entry points", () => {
        for (const name of [
            "RiotApiClient",
            "RiotApiError",
            "RiotAuthError",
            "RiotNotFoundError",
            "RiotRateLimitError",
            "RateLimiter",
            "TtlCache",
            "PLATFORMS",
            "platformToRegional",
            "summarizeMatch",
            "normalizeRole",
            "buildDraftFromMatch",
            "profilePlaystyle",
            "DEFAULT_BASELINES",
        ]) {
            expect(riot, name).toHaveProperty(name);
        }
    });

    it("has no module-load side effects beyond plain data", () => {
        expect(riot.PLATFORMS.length).toBeGreaterThan(0);
        expect(riot.DEV_KEY_RATE_LIMITS).toEqual([
            { requests: 20, seconds: 1 },
            { requests: 100, seconds: 120 },
        ]);
    });
});

describe("queues", () => {
    it("names the queues a player can meet", () => {
        expect(riot.getQueueName(420)).toBe("Ranked Solo/Duo");
        expect(riot.getQueueName(450)).toBe("ARAM");
        expect(riot.getQueueName(987_654)).toBe("Queue 987654");
    });

    it("knows which queues are ranked and which have a draft", () => {
        expect(riot.isRankedQueue(420)).toBe(true);
        expect(riot.isRankedQueue(400)).toBe(false);
        expect(riot.isDraftQueue(400)).toBe(true);
        expect(riot.isDraftQueue(450)).toBe(false);
    });
});
