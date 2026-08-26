import { describe, expect, it } from "vitest";
import {
    WINRATE_SCALE_MAX,
    WINRATE_SCALE_MIN,
    deltaColor,
    deltaTone,
    winrateBarShare,
    winrateBgClass,
    winrateColor,
    winrateTextClass,
    winrateTone,
} from "./winrate";

describe("winrateColor", () => {
    it("returns the exact token colour at every stop", () => {
        expect(winrateColor(0.42)).toBe("#e5484d");
        expect(winrateColor(0.45)).toBe("#f0803c");
        expect(winrateColor(0.5)).toBe("#8b98ad");
        expect(winrateColor(0.55)).toBe("#4ac47a");
        expect(winrateColor(0.58)).toBe("#26d07c");
    });

    it("interpolates between stops", () => {
        const mid = winrateColor(0.525);
        expect(mid).not.toBe(winrateColor(0.5));
        expect(mid).not.toBe(winrateColor(0.55));
        expect(mid).toMatch(/^#[0-9a-f]{6}$/);
    });

    it("clamps outliers to the ends of the scale", () => {
        expect(winrateColor(0.1)).toBe(winrateColor(WINRATE_SCALE_MIN));
        expect(winrateColor(0.99)).toBe(winrateColor(WINRATE_SCALE_MAX));
    });

    it("falls back to neutral for a non-finite winrate", () => {
        expect(winrateColor(Number.NaN)).toBe("#8b98ad");
    });
});

describe("winrateTone", () => {
    it("buckets a winrate the way a player reads it", () => {
        expect(winrateTone(0.43)).toBe("terrible");
        expect(winrateTone(0.45)).toBe("bad");
        expect(winrateTone(0.5)).toBe("neutral");
        expect(winrateTone(0.55)).toBe("good");
        expect(winrateTone(0.58)).toBe("great");
    });

    it("exposes matching Tailwind classes", () => {
        expect(winrateTextClass(0.5)).toBe("text-winrate-neutral");
        expect(winrateTextClass(0.56)).toBe("text-winrate-good");
        expect(winrateBgClass(0.42)).toBe("bg-winrate-terrible");
    });
});

describe("deltas", () => {
    it("treats a delta as a winrate centred on 50 %", () => {
        expect(deltaColor(0)).toBe(winrateColor(0.5));
        expect(deltaColor(0.05)).toBe(winrateColor(0.55));
        expect(deltaTone(-0.05)).toBe("bad");
    });
});

describe("winrateBarShare", () => {
    it("maps the scale onto 0-1", () => {
        expect(winrateBarShare(WINRATE_SCALE_MIN)).toBe(0);
        expect(winrateBarShare(WINRATE_SCALE_MAX)).toBe(1);
        expect(winrateBarShare(0.5)).toBeCloseTo(0.5, 5);
    });

    it("clamps and never returns NaN", () => {
        expect(winrateBarShare(0)).toBe(0);
        expect(winrateBarShare(1)).toBe(1);
        expect(winrateBarShare(Number.NaN)).toBe(0.5);
    });
});
