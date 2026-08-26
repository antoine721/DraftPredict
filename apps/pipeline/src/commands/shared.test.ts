import { describe, expect, it } from "vitest";

import {
    UsageError,
    parseNumberList,
    parseTimestampSeconds,
    readApiKey,
    requireRank,
    requireRegion,
    toList,
} from "./shared.js";
import { createLogger } from "../util/logger.js";

describe("argument helpers", () => {
    it("splits repeated and comma-separated flags", () => {
        expect(parseNumberList(["420,440", "700"])).toEqual([420, 440, 700]);
        expect(parseNumberList(undefined)).toEqual([]);
        expect(toList("challenger, grandmaster")).toEqual(["challenger", "grandmaster"]);
    });

    it("reads dates and epochs as epoch seconds", () => {
        expect(parseTimestampSeconds("2026-08-01")).toBe(Date.parse("2026-08-01T00:00:00Z") / 1000);
        expect(parseTimestampSeconds("2026-08-01T12:30:00Z")).toBe(
            Date.parse("2026-08-01T12:30:00Z") / 1000,
        );
        expect(parseTimestampSeconds("1770000000")).toBe(1_770_000_000);
        // Milliseconds are accepted and converted.
        expect(parseTimestampSeconds("1770000000000")).toBe(1_770_000_000);
        expect(parseTimestampSeconds(undefined)).toBeUndefined();
        expect(() => parseTimestampSeconds("last tuesday")).toThrow(UsageError);
    });

    it("validates ranks and regions against the core vocabulary", () => {
        expect(requireRank("platinum_plus")).toBe("PLATINUM_PLUS");
        expect(requireRank(undefined)).toBe("PLATINUM_PLUS");
        expect(requireRegion("euw")).toBe("EUW");
        expect(() => requireRank("bronze5")).toThrow(UsageError);
        expect(() => requireRegion("mars")).toThrow(UsageError);
    });
});

describe("readApiKey", () => {
    it("comes from the environment only", () => {
        expect(readApiKey({ RIOT_API_KEY: "RGAPI-abc" })).toBe("RGAPI-abc");
        expect(() => readApiKey({})).toThrow(/RIOT_API_KEY is not set/);
    });
});

describe("logger redaction", () => {
    it("never prints an API key, whether or not it was registered", () => {
        const lines: string[] = [];
        const key = "RGAPI-11112222-3333-4444-5555-666677778888";
        const logger = createLogger({
            level: "debug",
            secrets: [key],
            write: (_level, line) => lines.push(line),
        });

        logger.error(`request failed with key ${key}`);
        logger.warn("another key leaked: RGAPI-99998888-7777-6666-5555-444433332222");
        logger.info("a secret in metadata", { apiKey: key });

        expect(lines.join("\n")).not.toContain("RGAPI-");
        expect(lines.every((line) => line.includes("[REDACTED]"))).toBe(true);
    });
});
