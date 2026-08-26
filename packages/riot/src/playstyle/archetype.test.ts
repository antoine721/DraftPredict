import { Role } from "@draftpredict/core";
import { describe, expect, it } from "vitest";

import { ARCHETYPES, pickArchetype } from "./archetype.js";
import {
    pickStrengths,
    pickWeaknesses,
    STRENGTH_THRESHOLD,
    WEAKNESS_THRESHOLD,
} from "./traits.js";
import { neutralAxes } from "./axes.js";
import type { AxisScores } from "./types.js";

const axes = (overrides: Partial<AxisScores> = {}): AxisScores => ({
    ...neutralAxes(),
    ...overrides,
});

describe("pickArchetype", () => {
    it("returns `unknown` without games", () => {
        const archetype = pickArchetype(axes(), { games: 0 });
        expect(archetype.key).toBe("unknown");
        expect(archetype.confidence).toBe(0);
        expect(archetype.runnerUp).toBeUndefined();
    });

    it("defaults to all-rounder for an average player", () => {
        expect(pickArchetype(axes(), { games: 10 }).key).toBe("all-rounder");
    });

    it.each([
        [
            "hyper-carry",
            {
                aggression: 80,
                farming: 80,
                survivability: 75,
                scaling: 60,
                teamplay: 30,
            },
        ],
        ["lane-bully", { aggression: 90, scaling: 20, farming: 60 }],
        [
            "scaling-farmer",
            { farming: 85, scaling: 85, aggression: 30, survivability: 65 },
        ],
        ["playmaker", { teamplay: 85, aggression: 75, vision: 60, farming: 25 }],
        [
            "vision-controller",
            { vision: 90, teamplay: 70, objectives: 60, farming: 35 },
        ],
        [
            "frontline-anchor",
            { teamplay: 80, objectives: 65, aggression: 60, survivability: 30 },
        ],
        ["split-pusher", { objectives: 85, farming: 80, teamplay: 20, vision: 40 }],
    ])("recognises a %s", (key, overrides) => {
        const archetype = pickArchetype(axes(overrides as Partial<AxisScores>), {
            games: 10,
            role: Role.Middle,
        });
        expect(archetype.key).toBe(key);
        expect(archetype.explanation.length).toBeGreaterThan(20);
        expect(archetype.confidence).toBeGreaterThan(0);
    });

    it("names the role it compares against", () => {
        const withRole = pickArchetype(axes({ vision: 90 }), {
            games: 5,
            role: Role.Support,
        });
        expect(withRole.explanation).toContain("Support");
        const withoutRole = pickArchetype(axes({ vision: 90 }), {
            games: 5,
            role: null,
        });
        expect(withoutRole.explanation).toContain("the average player");
    });

    it("exposes stable keys for the UI to translate", () => {
        const keys = ARCHETYPES.map((archetype) => archetype.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const archetype of ARCHETYPES) {
            expect(archetype.summary.length).toBeGreaterThan(10);
        }
    });
});

describe("strengths and weaknesses", () => {
    it("keeps only axes far enough from the baseline", () => {
        const scores = axes({
            vision: 90,
            farming: 80,
            teamplay: 62,
            aggression: 20,
            survivability: 35,
            consistency: 50,
        });
        expect(pickStrengths(scores).map((trait) => trait.axis)).toEqual([
            "vision",
            "farming",
            "teamplay",
        ]);
        expect(pickWeaknesses(scores).map((trait) => trait.axis)).toEqual([
            "aggression",
            "survivability",
        ]);
    });

    it("returns nothing for an average player", () => {
        expect(pickStrengths(axes())).toEqual([]);
        expect(pickWeaknesses(axes())).toEqual([]);
        expect(STRENGTH_THRESHOLD).toBeGreaterThan(50);
        expect(WEAKNESS_THRESHOLD).toBeLessThan(50);
    });

    it("caps the list", () => {
        const scores = axes({
            vision: 90,
            farming: 88,
            teamplay: 86,
            aggression: 84,
            objectives: 82,
        });
        expect(pickStrengths(scores)).toHaveLength(3);
        expect(pickStrengths(scores, 5)).toHaveLength(5);
    });
});
