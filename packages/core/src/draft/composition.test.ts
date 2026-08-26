import { describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import { makeDataset, makeTeam } from "../testing/fixtures.js";
import { getTeamComposition } from "./composition.js";

const dataset = makeDataset([
    {
        key: "1",
        roles: {
            [Role.Top]: {
                games: 100,
                wins: 60,
                damageProfile: { magic: 0, physical: 30, true: 10 },
            },
        },
    },
    {
        key: "2",
        roles: {
            [Role.Middle]: {
                games: 300,
                wins: 120,
                damageProfile: { magic: 50, physical: 10, true: 0 },
            },
        },
    },
    { key: "3", roles: {} },
]);

describe("getTeamComposition", () => {
    it("summarises each pick in role order", () => {
        const composition = getTeamComposition(
            dataset,
            makeTeam([
                [Role.Middle, "2"],
                [Role.Top, "1"],
            ]),
        );

        expect(composition.champions.map((c) => c.championKey)).toEqual(["1", "2"]);
        expect(composition.champions[0]).toMatchObject({
            role: Role.Top,
            wins: 60,
            games: 100,
            winrate: 0.6,
        });
        expect(composition.champions[1].winrate).toBeCloseTo(0.4, 12);
    });

    it("sums the damage profiles and reports the share", () => {
        const composition = getTeamComposition(
            dataset,
            makeTeam([
                [Role.Top, "1"],
                [Role.Middle, "2"],
            ]),
        );

        expect(composition.damageDistribution).toEqual({
            magic: 50,
            physical: 40,
            true: 10,
        });
        expect(composition.damageDistributionShare).toEqual({
            magic: 0.5,
            physical: 0.4,
            true: 0.1,
        });
    });

    it("weights the average winrate by games", () => {
        const composition = getTeamComposition(
            dataset,
            makeTeam([
                [Role.Top, "1"],
                [Role.Middle, "2"],
            ]),
        );
        // (60 + 120) / (100 + 300)
        expect(composition.totalStats).toEqual({ wins: 180, games: 400 });
        expect(composition.averageWinrate).toBeCloseTo(0.45, 12);
    });

    it("reports the open roles and completeness", () => {
        const partial = getTeamComposition(dataset, makeTeam([[Role.Top, "1"]]));
        expect(partial.openRoles).toEqual([
            Role.Jungle,
            Role.Middle,
            Role.Bottom,
            Role.Support,
        ]);
        expect(partial.isComplete).toBe(false);

        const complete = getTeamComposition(
            dataset,
            makeTeam([
                [Role.Top, "1"],
                [Role.Jungle, "1"],
                [Role.Middle, "2"],
                [Role.Bottom, "2"],
                [Role.Support, "3"],
            ]),
        );
        expect(complete.openRoles).toEqual([]);
        expect(complete.isComplete).toBe(true);
    });

    it("falls back to 50% and no damage for an empty team", () => {
        const composition = getTeamComposition(dataset, new Map());
        expect(composition.champions).toEqual([]);
        expect(composition.averageWinrate).toBe(0.5);
        expect(composition.damageDistribution).toEqual({
            magic: 0,
            physical: 0,
            true: 0,
        });
        expect(composition.damageDistributionShare).toEqual({
            magic: 0,
            physical: 0,
            true: 0,
        });
    });

    it("treats an unknown champion as an unplayed one", () => {
        const composition = getTeamComposition(
            dataset,
            makeTeam([[Role.Top, "does-not-exist"]]),
        );
        expect(composition.champions[0]).toMatchObject({
            games: 0,
            wins: 0,
            winrate: 0.5,
        });
    });
});
