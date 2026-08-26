import { describe, expect, it } from "vitest";
import {
    buildPriorGamesByRiskLevel,
    displayNameByRiskLevel,
    isRiskLevel,
    parseRiskLevel,
    priorGamesByRiskLevel,
    RiskLevel,
} from "./risk-level.js";

describe("risk levels", () => {
    it("lists the five levels from least to most risky", () => {
        expect([...RiskLevel]).toEqual([
            "very-low",
            "low",
            "medium",
            "high",
            "very-high",
        ]);
    });

    it("uses DraftGap's prior games", () => {
        expect(priorGamesByRiskLevel).toEqual({
            "very-low": 3000,
            low: 2000,
            medium: 1000,
            high: 500,
            "very-high": 250,
        });
        expect(buildPriorGamesByRiskLevel).toEqual({
            "very-low": 3000,
            low: 2000,
            medium: 1000,
            high: 750,
            "very-high": 500,
        });
    });

    it("uses strictly fewer prior games as risk increases", () => {
        for (let i = 1; i < RiskLevel.length; i++) {
            expect(priorGamesByRiskLevel[RiskLevel[i]]).toBeLessThan(
                priorGamesByRiskLevel[RiskLevel[i - 1]],
            );
        }
    });

    it("names every level", () => {
        for (const level of RiskLevel) {
            expect(displayNameByRiskLevel[level]).toBeTruthy();
        }
    });
});

describe("parseRiskLevel", () => {
    it("accepts every spelling the API may see", () => {
        expect(parseRiskLevel("very-high")).toBe("very-high");
        expect(parseRiskLevel("veryHigh")).toBe("very-high");
        expect(parseRiskLevel("VERY_HIGH")).toBe("very-high");
        expect(parseRiskLevel(" Very High ")).toBe("very-high");
        expect(parseRiskLevel("medium")).toBe("medium");
    });

    it("rejects anything else", () => {
        expect(parseRiskLevel("extreme")).toBeUndefined();
        expect(parseRiskLevel("")).toBeUndefined();
    });
});

describe("isRiskLevel", () => {
    it("guards the canonical union only", () => {
        expect(isRiskLevel("medium")).toBe(true);
        expect(isRiskLevel("veryHigh")).toBe(false);
        expect(isRiskLevel(3)).toBe(false);
    });
});
