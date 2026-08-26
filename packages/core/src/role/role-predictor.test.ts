import { describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import { makeDataset } from "../testing/fixtures.js";
import {
    getTeamComps,
    predictRoleProbabilities,
    predictRoles,
} from "./role-predictor.js";

/**
 * Five champions, each overwhelmingly a specialist, plus one flex pick.
 */
const dataset = makeDataset([
    { key: "top", roles: { [Role.Top]: { games: 1000 } } },
    { key: "jgl", roles: { [Role.Jungle]: { games: 1000 } } },
    { key: "mid", roles: { [Role.Middle]: { games: 1000 } } },
    { key: "adc", roles: { [Role.Bottom]: { games: 1000 } } },
    { key: "sup", roles: { [Role.Support]: { games: 1000 } } },
    {
        key: "flex",
        roles: {
            [Role.Top]: { games: 600 },
            [Role.Middle]: { games: 400 },
        },
    },
    { key: "unplayed", roles: {} },
]);

const champion = (key: string) => dataset.championData[key];

describe("getTeamComps", () => {
    it("enumerates every assignment, most likely first", () => {
        const comps = getTeamComps([champion("top"), champion("flex")]);

        // 5 roles for the first champion x 4 for the second.
        expect(comps).toHaveLength(20);
        for (let i = 1; i < comps.length; i++) {
            expect(comps[i - 1][1]).toBeGreaterThanOrEqual(comps[i][1]);
        }

        const [best, probability] = comps[0];
        expect(best.get(Role.Top)).toBe("top");
        expect(best.get(Role.Middle)).toBe("flex");
        expect(probability).toBeCloseTo(1 * 0.4, 12);
    });

    it("pins champions that already have a role", () => {
        const comps = getTeamComps([
            { ...champion("flex"), role: Role.Top },
            champion("mid"),
        ]);
        for (const [comp] of comps) {
            expect(comp.get(Role.Top)).toBe("flex");
        }
        expect(comps[0][0].get(Role.Middle)).toBe("mid");
    });

    it("returns the single existing comp when everything is pinned", () => {
        const comps = getTeamComps([{ ...champion("top"), role: Role.Top }]);
        expect(comps).toHaveLength(1);
        expect(comps[0][1]).toBe(1);
    });

    it("yields NaN probabilities for a champion with no games anywhere", () => {
        const comps = getTeamComps([champion("unplayed")]);
        expect(comps).toHaveLength(5);
        expect(comps.every(([, p]) => Number.isNaN(p))).toBe(true);
    });
});

describe("predictRoleProbabilities", () => {
    it("gives each champion a distribution summing to one", () => {
        const probabilities = predictRoleProbabilities(
            getTeamComps([champion("top"), champion("flex")]),
        );

        for (const [, byRole] of probabilities) {
            const total = [...byRole.values()].reduce((a, b) => a + b, 0);
            expect(total).toBeCloseTo(1, 12);
        }
    });

    it("is certain about a fully determined comp", () => {
        const probabilities = predictRoleProbabilities(
            getTeamComps([
                champion("top"),
                champion("jgl"),
                champion("mid"),
                champion("adc"),
                champion("sup"),
            ]),
        );
        expect(probabilities.get("top")!.get(Role.Top)).toBeCloseTo(1, 12);
        expect(probabilities.get("sup")!.get(Role.Support)).toBeCloseTo(1, 12);
    });
});

describe("predictRoles", () => {
    it("assigns each specialist to its role", () => {
        const roles = predictRoles(dataset, ["sup", "top", "adc", "jgl", "mid"]);
        expect([...roles.entries()]).toEqual([
            [Role.Top, "top"],
            [Role.Jungle, "jgl"],
            [Role.Middle, "mid"],
            [Role.Bottom, "adc"],
            [Role.Support, "sup"],
        ]);
    });

    it("never assigns two champions to the same role", () => {
        const roles = predictRoles(dataset, ["top", "flex", "mid"]);
        expect(new Set(roles.values()).size).toBe(3);
        expect(roles.size).toBe(3);
        // "top" is a pure top laner, so "flex" is pushed to mid, and the mid
        // specialist takes what is left.
        expect(roles.get(Role.Top)).toBe("top");
    });

    it("honours roles that are already known", () => {
        const roles = predictRoles(dataset, ["top", "flex"], {
            knownRoles: new Map([[Role.Top, "flex"]]),
        });
        expect(roles.get(Role.Top)).toBe("flex");
        expect(roles.get(Role.Top)).not.toBe("top");
        expect([...roles.values()]).toContain("top");
    });

    it("still places champions the dataset has never seen", () => {
        const roles = predictRoles(dataset, ["top", "brand-new-champion"]);
        expect([...roles.values()]).toContain("brand-new-champion");
        expect(new Set(roles.values()).size).toBe(2);
    });

    it("returns an empty map for no champions", () => {
        expect(predictRoles(dataset, [])).toEqual(new Map());
    });

    it("orders the result by role", () => {
        const roles = predictRoles(dataset, ["sup", "top"]);
        expect([...roles.keys()]).toEqual([Role.Top, Role.Support]);
    });
});
