import { describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import { makeDataset, makeTeam } from "../testing/fixtures.js";
import {
    getDamageDistribution,
    getTeamDamageDistribution,
} from "./damage-distribution.js";

const dataset = makeDataset([
    {
        key: "1",
        roles: {
            [Role.Top]: { damageProfile: { magic: 0.1, physical: 0.8, true: 0.1 } },
        },
    },
    {
        key: "2",
        roles: {
            [Role.Middle]: {
                damageProfile: { magic: 0.9, physical: 0.05, true: 0.05 },
            },
        },
    },
]);

describe("getTeamDamageDistribution", () => {
    it("sums the profiles of the picked champions", () => {
        const distribution = getTeamDamageDistribution(
            dataset,
            makeTeam([
                [Role.Top, "1"],
                [Role.Middle, "2"],
            ]),
        );
        expect(distribution.magic).toBeCloseTo(1, 12);
        expect(distribution.physical).toBeCloseTo(0.85, 12);
        expect(distribution.true).toBeCloseTo(0.15, 12);
    });

    it("uses the profile of the role the champion is played in", () => {
        // Champion 1 has no Middle profile, so it contributes nothing there.
        expect(
            getTeamDamageDistribution(dataset, makeTeam([[Role.Middle, "1"]])),
        ).toEqual({ magic: 0, physical: 0, true: 0 });
    });

    it("is all zero for an empty team", () => {
        expect(getTeamDamageDistribution(dataset, new Map())).toEqual({
            magic: 0,
            physical: 0,
            true: 0,
        });
    });

    it("skips champions missing from the dataset", () => {
        const distribution = getTeamDamageDistribution(
            dataset,
            makeTeam([
                [Role.Top, "1"],
                [Role.Jungle, "unknown"],
            ]),
        );
        expect(distribution.physical).toBeCloseTo(0.8, 12);
    });

    it("is exported under the ARCHITECTURE name too", () => {
        expect(getDamageDistribution).toBe(getTeamDamageDistribution);
    });
});
