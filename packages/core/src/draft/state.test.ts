import { describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import {
    cloneDraftState,
    deserializeDraftState,
    draftStateFromArrays,
    emptyDraftState,
    getOpenRoles,
    getTeam,
    getUnavailableChampions,
    isDraftComplete,
    serializeDraftState,
    teamToArray,
    withoutPick,
    withPick,
} from "./state.js";
import type { SerializedDraftState } from "./state.js";

const sample = () =>
    draftStateFromArrays(
        ["1", "2", null, "4", undefined],
        ["10", null, "12", "", "14"],
        { ally: ["99"], opponent: ["98", "97"] },
    );

describe("emptyDraftState", () => {
    it("starts with nothing picked or banned", () => {
        const state = emptyDraftState();
        expect(state.ally.size).toBe(0);
        expect(state.opponent.size).toBe(0);
        expect(state.bans).toEqual({ ally: [], opponent: [] });
    });

    it("returns a fresh object every call", () => {
        const a = emptyDraftState();
        a.ally.set(Role.Top, "1");
        expect(emptyDraftState().ally.size).toBe(0);
    });
});

describe("draftStateFromArrays", () => {
    it("indexes champions by role and skips empty slots", () => {
        const state = sample();
        expect([...state.ally.entries()]).toEqual([
            [Role.Top, "1"],
            [Role.Jungle, "2"],
            [Role.Bottom, "4"],
        ]);
        expect([...state.opponent.entries()]).toEqual([
            [Role.Top, "10"],
            [Role.Middle, "12"],
            [Role.Support, "14"],
        ]);
        expect(state.bans).toEqual({ ally: ["99"], opponent: ["98", "97"] });
    });

    it("copies the ban arrays", () => {
        const bans = ["1"];
        const state = draftStateFromArrays([], [], { ally: bans });
        bans.push("2");
        expect(state.bans.ally).toEqual(["1"]);
    });

    it("round-trips through teamToArray", () => {
        const state = sample();
        expect(teamToArray(state.ally)).toEqual(["1", "2", null, "4", null]);
    });
});

describe("serialization", () => {
    it("round-trips through JSON", () => {
        const state = sample();
        const json = JSON.stringify(serializeDraftState(state));
        const restored = deserializeDraftState(JSON.parse(json));

        expect([...restored.ally.entries()]).toEqual([...state.ally.entries()]);
        expect([...restored.opponent.entries()]).toEqual([...state.opponent.entries()]);
        expect(restored.bans).toEqual(state.bans);
    });

    it("produces a plain JSON-safe shape", () => {
        expect(serializeDraftState(sample())).toEqual({
            ally: [
                [0, "1"],
                [1, "2"],
                [3, "4"],
            ],
            opponent: [
                [0, "10"],
                [2, "12"],
                [4, "14"],
            ],
            bans: { ally: ["99"], opponent: ["98", "97"] },
        });
    });

    it("preserves an empty state", () => {
        const restored = deserializeDraftState(serializeDraftState(emptyDraftState()));
        expect(restored).toEqual(emptyDraftState());
    });

    it("drops malformed entries instead of throwing", () => {
        // A deliberately hostile wire payload: an out-of-range role and an
        // empty champion key.
        const payload = {
            ally: [
                [0, "1"],
                [9, "bad-role"],
                [1, ""],
            ],
            opponent: [],
            bans: { ally: [], opponent: [] },
        } as unknown as SerializedDraftState;

        const restored = deserializeDraftState(payload);
        expect([...restored.ally.entries()]).toEqual([[Role.Top, "1"]]);
    });
});

describe("state helpers", () => {
    it("selects a team by side", () => {
        const state = sample();
        expect(getTeam(state, "ally")).toBe(state.ally);
        expect(getTeam(state, "opponent")).toBe(state.opponent);
    });

    it("adds and removes picks without touching the original", () => {
        const state = sample();
        const withMid = withPick(state, "ally", Role.Middle, "7");

        expect(withMid.ally.get(Role.Middle)).toBe("7");
        expect(state.ally.has(Role.Middle)).toBe(false);

        const withoutTop = withoutPick(withMid, "ally", Role.Top);
        expect(withoutTop.ally.has(Role.Top)).toBe(false);
        expect(withMid.ally.get(Role.Top)).toBe("1");
    });

    it("clones deeply enough that mutation is contained", () => {
        const state = sample();
        const copy = cloneDraftState(state);
        copy.ally.set(Role.Middle, "7");
        copy.bans.ally.push("50");

        expect(state.ally.has(Role.Middle)).toBe(false);
        expect(state.bans.ally).toEqual(["99"]);
    });

    it("lists every unavailable champion", () => {
        expect(getUnavailableChampions(sample())).toEqual(
            new Set(["1", "2", "4", "10", "12", "14", "99", "98", "97"]),
        );
    });

    it("lists open roles in role order", () => {
        expect(getOpenRoles(sample().ally)).toEqual([Role.Middle, Role.Support]);
        expect(getOpenRoles(new Map())).toEqual([0, 1, 2, 3, 4]);
    });

    it("knows when both teams are full", () => {
        expect(isDraftComplete(sample())).toBe(false);
        expect(
            isDraftComplete(
                draftStateFromArrays(
                    ["1", "2", "3", "4", "5"],
                    ["6", "7", "8", "9", "10"],
                ),
            ),
        ).toBe(true);
    });
});
