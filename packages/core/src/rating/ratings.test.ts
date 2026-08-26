import { describe, expect, it } from "vitest";
import {
    getDuoWinrate,
    getMatchupWinrate,
    ratingToWinrate,
    winrateToRating,
} from "./ratings.js";

describe("ratingToWinrate", () => {
    it("maps 0 rating to an even matchup", () => {
        expect(ratingToWinrate(0)).toBe(0.5);
    });

    it("maps 400 rating to 10:1 odds", () => {
        expect(ratingToWinrate(400)).toBeCloseTo(10 / 11, 12);
        expect(ratingToWinrate(-400)).toBeCloseTo(1 / 11, 12);
    });

    it("is monotonic and bounded", () => {
        let previous = 0;
        for (let d = -2000; d <= 2000; d += 25) {
            const winrate = ratingToWinrate(d);
            expect(winrate).toBeGreaterThan(previous);
            expect(winrate).toBeGreaterThan(0);
            expect(winrate).toBeLessThan(1);
            previous = winrate;
        }
    });
});

describe("winrateToRating", () => {
    it("maps 50% to 0 (negative zero, as -400 * log10(1))", () => {
        expect(winrateToRating(0.5) === 0).toBe(true);
        expect(Object.is(winrateToRating(0.5), -0)).toBe(true);
    });

    it("is the inverse of ratingToWinrate", () => {
        for (let d = -1200; d <= 1200; d += 7) {
            expect(winrateToRating(ratingToWinrate(d))).toBeCloseTo(d, 9);
        }
        for (let w = 0.01; w < 0.99; w += 0.01) {
            expect(ratingToWinrate(winrateToRating(w))).toBeCloseTo(w, 12);
        }
    });

    it("blows up at the boundaries, as DraftGap does", () => {
        expect(winrateToRating(1)).toBe(Infinity);
        expect(winrateToRating(0)).toBe(-Infinity);
        expect(winrateToRating(NaN)).toBeNaN();
    });
});

describe("getMatchupWinrate", () => {
    it("is 50% between equals", () => {
        expect(getMatchupWinrate(0.55, 0.55)).toBeCloseTo(0.5, 12);
    });

    it("favours the stronger champion", () => {
        expect(getMatchupWinrate(0.55, 0.45)).toBeGreaterThan(0.5);
        expect(getMatchupWinrate(0.45, 0.55)).toBeLessThan(0.5);
    });

    it("is antisymmetric", () => {
        expect(getMatchupWinrate(0.6, 0.48) + getMatchupWinrate(0.48, 0.6)).toBeCloseTo(
            1,
            12,
        );
    });
});

describe("getDuoWinrate", () => {
    it("compounds two winrates", () => {
        expect(getDuoWinrate(0.5, 0.5)).toBeCloseTo(0.5, 12);
        expect(getDuoWinrate(0.55, 0.55)).toBeGreaterThan(0.55);
        // 0.55 and 0.45 have equal and opposite ratings, so they cancel.
        expect(getDuoWinrate(0.55, 0.45)).toBeCloseTo(0.5, 12);
    });
});
