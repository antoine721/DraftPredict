import { describe, expect, it } from "vitest";
import { addStats, averageStats, divideStats, multiplyStats } from "./stats.js";
import { calculateWilsonCI } from "./statistics.js";

describe("addStats", () => {
    it("sums wins and games", () => {
        expect(addStats({ wins: 3, games: 5 }, { wins: 10, games: 21 })).toEqual({
            wins: 13,
            games: 26,
        });
    });

    it("returns an empty sample for no arguments", () => {
        expect(addStats()).toEqual({ wins: 0, games: 0 });
    });

    it("keeps fractional games, which the priors rely on", () => {
        expect(addStats({ wins: 1, games: 2 }, { wins: 0.5, games: 1.25 })).toEqual({
            wins: 1.5,
            games: 3.25,
        });
    });
});

describe("multiplyStats / divideStats", () => {
    it("scales both fields", () => {
        expect(multiplyStats({ wins: 3, games: 6 }, 2)).toEqual({
            wins: 6,
            games: 12,
        });
        expect(divideStats({ wins: 3, games: 6 }, 3)).toEqual({ wins: 1, games: 2 });
    });

    it("divides by zero the way JavaScript does", () => {
        expect(divideStats({ wins: 1, games: 2 }, 0)).toEqual({
            wins: Infinity,
            games: Infinity,
        });
    });
});

describe("averageStats", () => {
    it("averages both fields", () => {
        expect(averageStats({ wins: 10, games: 20 }, { wins: 0, games: 10 })).toEqual({
            wins: 5,
            games: 15,
        });
    });

    it("is the identity for a single sample", () => {
        expect(averageStats({ wins: 7, games: 9 })).toEqual({ wins: 7, games: 9 });
    });

    it("yields NaN for no samples, matching DraftGap", () => {
        const result = averageStats();
        expect(result.wins).toBeNaN();
        expect(result.games).toBeNaN();
    });
});

describe("calculateWilsonCI", () => {
    it("collapses to the point estimate at confidence 0", () => {
        expect(calculateWilsonCI(50, 100, 0)).toEqual([0.5, 0.5]);
    });

    it("brackets the observed winrate", () => {
        const [low, high] = calculateWilsonCI(55, 100, 0.95);
        expect(low).toBeLessThan(0.55);
        expect(high).toBeGreaterThan(0.55);
        expect(low).toBeGreaterThan(0);
        expect(high).toBeLessThan(1);
    });

    it("narrows as the sample grows", () => {
        const [smallLow, smallHigh] = calculateWilsonCI(55, 100, 0.95);
        const [bigLow, bigHigh] = calculateWilsonCI(5500, 10000, 0.95);
        expect(bigHigh - bigLow).toBeLessThan(smallHigh - smallLow);
    });

    it("widens with confidence", () => {
        const width = (c: 0.95 | 0.99 | 0.999) => {
            const [low, high] = calculateWilsonCI(55, 100, c);
            return high - low;
        };
        expect(width(0.95)).toBeLessThan(width(0.99));
        expect(width(0.99)).toBeLessThan(width(0.999));
    });
});
