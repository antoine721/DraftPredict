import { Role } from "@draftpredict/core";
import { describe, expect, it } from "vitest";

import { assignTeamRoles, normalizeRole } from "./roles.js";

describe("normalizeRole", () => {
    it("reads teamPosition first", () => {
        expect(normalizeRole("TOP", "JUNGLE", "MIDDLE", "SOLO")).toBe(Role.Top);
        expect(normalizeRole("UTILITY")).toBe(Role.Support);
        expect(normalizeRole("MIDDLE")).toBe(Role.Middle);
        expect(normalizeRole("BOTTOM")).toBe(Role.Bottom);
        expect(normalizeRole("JUNGLE")).toBe(Role.Jungle);
    });

    it("falls back to individualPosition when teamPosition is empty", () => {
        expect(normalizeRole("", "JUNGLE")).toBe(Role.Jungle);
        expect(normalizeRole(undefined, "UTILITY")).toBe(Role.Support);
    });

    it("ignores Riot's Invalid / NONE placeholders", () => {
        expect(normalizeRole("Invalid", "Invalid", "NONE", "NONE")).toBeNull();
        expect(normalizeRole("", "Invalid", "TOP", "SOLO")).toBe(Role.Top);
    });

    it("accepts the MID and SUPPORT spellings", () => {
        expect(normalizeRole("MID")).toBe(Role.Middle);
        expect(normalizeRole("SUPPORT")).toBe(Role.Support);
        expect(normalizeRole("ADC")).toBe(Role.Bottom);
    });

    it("combines lane and role for old matches", () => {
        expect(normalizeRole("", "", "BOTTOM", "DUO_SUPPORT")).toBe(Role.Support);
        expect(normalizeRole("", "", "BOTTOM", "DUO_CARRY")).toBe(Role.Bottom);
        expect(normalizeRole("", "", "BOT", "SUPPORT")).toBe(Role.Support);
        expect(normalizeRole("", "", "BOT", "CARRY")).toBe(Role.Bottom);
        expect(normalizeRole("", "", "MID", "SOLO")).toBe(Role.Middle);
        expect(normalizeRole("", "", "NONE", "SUPPORT")).toBe(Role.Support);
        expect(normalizeRole("", "", "NONE", "NONE")).toBeNull();
    });

    it("is case and whitespace insensitive", () => {
        expect(normalizeRole(" utility ")).toBe(Role.Support);
        expect(normalizeRole(null, null, "  Bottom ", " duo_carry ")).toBe(Role.Bottom);
    });
});

describe("assignTeamRoles", () => {
    it("keeps the normalised roles when they are unique", () => {
        const players = ["a", "b", "c", "d", "e"];
        const roles = [Role.Top, Role.Jungle, Role.Middle, Role.Bottom, Role.Support];
        const assigned = assignTeamRoles(
            players,
            (player) => roles[players.indexOf(player)]!,
        );
        expect([...assigned.values()]).toEqual(roles);
    });

    it("resolves duplicates and fills the gaps in participant order", () => {
        const players = ["a", "b", "c", "d", "e"];
        const roles: (Role | null)[] = [
            Role.Middle,
            Role.Middle,
            null,
            Role.Bottom,
            Role.Support,
        ];
        const assigned = assignTeamRoles(
            players,
            (player) => roles[players.indexOf(player)]!,
        );
        expect(assigned.get("a")).toBe(Role.Middle);
        expect(assigned.get("d")).toBe(Role.Bottom);
        expect(assigned.get("e")).toBe(Role.Support);
        // b and c take the two remaining slots, in order.
        expect(assigned.get("b")).toBe(Role.Top);
        expect(assigned.get("c")).toBe(Role.Jungle);
        expect(new Set(assigned.values()).size).toBe(5);
    });

    it("handles a team with no position data at all", () => {
        const players = ["a", "b", "c", "d", "e"];
        const assigned = assignTeamRoles(players, () => null);
        expect([...assigned.values()]).toEqual([
            Role.Top,
            Role.Jungle,
            Role.Middle,
            Role.Bottom,
            Role.Support,
        ]);
    });
});
