import { describe, expect, it } from "vitest";
import {
    ARCHETYPE_KEYS,
    PLATFORMS,
    PLAYSTYLE_AXES,
    archetypeCopy,
    axisDescription,
    axisLabel,
    axisShortLabel,
    formatMetric,
    jobStageLabel,
    metricLabel,
    platformCode,
    platformLabel,
    traitAdvice,
    traitLabel,
} from "./labels";

/**
 * The French string table.
 *
 * `@draftpredict/riot` only guarantees the *keys*; the English strings next to
 * them are a developer fallback. These tests are what stops an English label
 * reaching the screen when the engine grows a new axis or archetype.
 */

const METRICS = [
    "killParticipation",
    "kaPerMinute",
    "damageShare",
    "soloKillsPerGame",
    "csPerMinute",
    "goldPerMinute",
    "goldShare",
    "visionScorePerMinute",
    "wardsPlacedPerMinute",
    "wardsKilledPerMinute",
    "controlWardsPerGame",
    "objectiveParticipation",
    "objectiveDamagePerMinute",
    "turretDamagePerMinute",
    "deathsPerMinute",
    "deathShare",
    "kda",
    "assistRatio",
    "damageTakenShare",
    "healShieldPerMinute",
] as const;

describe("axes", () => {
    it("translates all eight axes, long, short and explained", () => {
        expect(PLAYSTYLE_AXES).toHaveLength(8);
        for (const axis of PLAYSTYLE_AXES) {
            expect(axisLabel(axis)).not.toBe(axis);
            expect(axisShortLabel(axis).length).toBeGreaterThan(0);
            expect(axisDescription(axis).length).toBeGreaterThan(20);
        }
    });

    it("falls back to the key rather than crashing on an unknown axis", () => {
        expect(axisLabel("teleportation")).toBe("teleportation");
        expect(axisDescription("teleportation")).toBe("");
    });
});

describe("traits", () => {
    it("maps every strength and weakness labelKey to French advice", () => {
        for (const axis of PLAYSTYLE_AXES) {
            const strength = traitLabel(`playstyle.strength.${axis}`, axis);
            const weakness = traitLabel(`playstyle.weakness.${axis}`, axis);
            expect(strength).not.toBe(weakness);
            expect(traitAdvice(`playstyle.strength.${axis}`, axis).length).toBeGreaterThan(10);
            expect(traitAdvice(`playstyle.weakness.${axis}`, axis).length).toBeGreaterThan(10);
        }
    });

    it("degrades to the axis name for an unknown key kind", () => {
        expect(traitLabel("playstyle.something.vision", "vision")).toBe("Vision");
    });
});

describe("archetypes", () => {
    it("translates every archetype the engine can return", () => {
        for (const key of ARCHETYPE_KEYS) {
            const copy = archetypeCopy(`playstyle.archetype.${key}`, key);
            expect(copy.name.length).toBeGreaterThan(0);
            expect(copy.summary.length).toBeGreaterThan(20);
        }
    });

    it("uses the fallback key when the labelKey is unusable", () => {
        expect(archetypeCopy("", "all-rounder").name).toBe("Polyvalent");
        expect(archetypeCopy("playstyle.archetype.mystery", "mystery").name).toBe(
            "mystery",
        );
    });
});

describe("metrics", () => {
    it("names and formats every baseline metric", () => {
        for (const metric of METRICS) {
            expect(metricLabel(metric)).not.toBe(metric);
            expect(formatMetric(metric, 1.234)).toMatch(/\d/);
        }
    });

    it("formats shares as percentages and rates per minute", () => {
        expect(formatMetric("killParticipation", 0.48)).toBe("48,0\u00a0%");
        expect(formatMetric("csPerMinute", 7.25)).toContain("/");
        expect(formatMetric("inconnu", 2)).toBe("2,00");
    });
});

describe("jobs and platforms", () => {
    it("names the three stages of the playstyle job", () => {
        expect(jobStageLabel("match-ids")).toContain("liste");
        expect(jobStageLabel("matches")).toContain("parties");
        expect(jobStageLabel("profiling")).toContain("profil");
        expect(jobStageLabel("???")).toBe("Analyse en cours");
    });

    it("resolves a shard from its routing value or its region code", () => {
        expect(platformCode("euw1")).toBe("EUW");
        expect(platformCode("EUW")).toBe("EUW");
        expect(platformLabel("kr")).toContain("Corée");
        expect(platformLabel(null)).toBe("Région inconnue");
        expect(platformCode("mars")).toBe("MARS");
    });

    it("lists the shards Riot actually routes", () => {
        expect(PLATFORMS.map((entry) => entry.id)).toContain("euw1");
        expect(new Set(PLATFORMS.map((entry) => entry.id)).size).toBe(PLATFORMS.length);
    });
});
