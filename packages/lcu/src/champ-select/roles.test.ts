import { Role } from "@draftpredict/core";
import { describe, expect, it } from "vitest";
import { makeRoleDataset } from "../testing/dataset.js";
import { assignRoles, parseAssignedPosition } from "./roles.js";

/** Garen top, Viego jungle, Syndra mid, Caitlyn bot, Lulu support. */
const DATASET = makeRoleDataset({
    "86": { [Role.Top]: 9_000, [Role.Middle]: 200 },
    "234": { [Role.Jungle]: 9_000, [Role.Top]: 300 },
    "134": { [Role.Middle]: 9_000, [Role.Bottom]: 100 },
    "51": { [Role.Bottom]: 9_000, [Role.Middle]: 50 },
    "117": { [Role.Support]: 9_000, [Role.Middle]: 100 },
});

describe("parseAssignedPosition", () => {
    it.each([
        ["top", Role.Top],
        ["jungle", Role.Jungle],
        ["middle", Role.Middle],
        ["bottom", Role.Bottom],
        ["utility", Role.Support],
        ["UTILITY", Role.Support],
        [" Middle ", Role.Middle],
    ])("maps %s", (position, role) => {
        expect(parseAssignedPosition(position)).toBe(role);
    });

    it.each([["", "none", "invalid", undefined, null]].flat())(
        "returns null for %s",
        (position) => {
            expect(parseAssignedPosition(position)).toBeNull();
        },
    );
});

describe("assignRoles", () => {
    it("keeps the positions Riot assigned", () => {
        const roles = assignRoles([
            { cellId: 0, assignedRole: Role.Support, championKey: "117" },
            { cellId: 1, assignedRole: Role.Top, championKey: "86" },
        ]);

        expect(roles.get(0)).toBe(Role.Support);
        expect(roles.get(1)).toBe(Role.Top);
    });

    it("infers missing positions from the dataset", () => {
        const roles = assignRoles(
            [
                { cellId: 5, assignedRole: null, championKey: "86" },
                { cellId: 6, assignedRole: null, championKey: "234" },
                { cellId: 7, assignedRole: null, championKey: "134" },
                { cellId: 8, assignedRole: null, championKey: "51" },
                { cellId: 9, assignedRole: null, championKey: "117" },
            ],
            { dataset: DATASET },
        );

        expect([...roles.entries()]).toEqual([
            [5, Role.Top],
            [6, Role.Jungle],
            [7, Role.Middle],
            [8, Role.Bottom],
            [9, Role.Support],
        ]);
    });

    it("never gives two cells the same role", () => {
        const roles = assignRoles(
            [
                // Two mid laners: one of them has to move.
                { cellId: 0, assignedRole: null, championKey: "134" },
                { cellId: 1, assignedRole: null, championKey: "117" },
                { cellId: 2, assignedRole: null, championKey: "86" },
            ],
            { dataset: DATASET },
        );

        expect(new Set(roles.values()).size).toBe(3);
    });

    it("respects the roles already taken when inferring", () => {
        const roles = assignRoles(
            [
                // Syndra is pinned bottom, so the inference must place Caitlyn
                // somewhere else even though bottom is her best role.
                { cellId: 0, assignedRole: Role.Bottom, championKey: "134" },
                { cellId: 1, assignedRole: null, championKey: "51" },
            ],
            { dataset: DATASET },
        );

        expect(roles.get(0)).toBe(Role.Bottom);
        expect(roles.get(1)).not.toBe(Role.Bottom);
    });

    it("falls back to slot order without a dataset", () => {
        const roles = assignRoles([
            { cellId: 5, assignedRole: null, championKey: "117" },
            { cellId: 6, assignedRole: null, championKey: "86" },
        ]);

        expect(roles.get(5)).toBe(Role.Top);
        expect(roles.get(6)).toBe(Role.Jungle);
    });

    it("fills empty cells with whatever roles are left", () => {
        const roles = assignRoles(
            [
                { cellId: 5, assignedRole: null, championKey: "134" },
                { cellId: 6, assignedRole: null, championKey: null },
                { cellId: 7, assignedRole: null, championKey: null },
            ],
            { dataset: DATASET },
        );

        expect(roles.get(5)).toBe(Role.Middle);
        expect(roles.get(6)).toBe(Role.Top);
        expect(roles.get(7)).toBe(Role.Jungle);
    });

    it("can be told not to infer at all", () => {
        const roles = assignRoles(
            [{ cellId: 5, assignedRole: null, championKey: "134" }],
            { dataset: DATASET, infer: false },
        );

        // Still assigned, but by slot order rather than by the dataset.
        expect(roles.get(5)).toBe(Role.Top);
    });

    it("handles a champion the dataset has never seen", () => {
        const roles = assignRoles(
            [
                { cellId: 5, assignedRole: null, championKey: "99999" },
                { cellId: 6, assignedRole: null, championKey: "234" },
            ],
            { dataset: DATASET },
        );

        expect(roles.get(6)).toBe(Role.Jungle);
        expect(roles.get(5)).not.toBe(Role.Jungle);
        expect(roles.size).toBe(2);
    });

    it("survives a duplicated assigned position", () => {
        const roles = assignRoles([
            { cellId: 0, assignedRole: Role.Middle, championKey: "134" },
            { cellId: 1, assignedRole: Role.Middle, championKey: "117" },
        ]);

        expect(roles.get(0)).toBe(Role.Middle);
        expect(roles.get(1)).toBe(Role.Top);
    });

    it("returns an empty map for an empty team", () => {
        expect(assignRoles([]).size).toBe(0);
    });
});
