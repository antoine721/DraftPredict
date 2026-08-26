import { beforeEach, describe, expect, it } from "vitest";
import type { SerializedChampSelectState } from "../api/types";
import { emptyBoard } from "./draft-board";
import {
    selectAnalyzeRequest,
    selectCanRedo,
    selectCanUndo,
    selectSuggestionsRequest,
    useDraftStore,
} from "./draft-store";

function reset(): void {
    useDraftStore.setState({
        board: emptyBoard(),
        selected: { team: "ally", role: 0 },
        followClient: false,
        liveUpdatedAt: null,
        riskLevel: null,
        rank: null,
        region: null,
        minGames: null,
        ignoreChampionWinrates: null,
        past: [],
        future: [],
    });
}

const champSelect = (ally: [number, string][]): SerializedChampSelectState =>
    ({
        ally,
        opponent: [],
        allyHovers: [],
        opponentHovers: [],
        bans: { ally: [], opponent: [] },
    }) as unknown as SerializedChampSelectState;

describe("draft store", () => {
    beforeEach(reset);

    it("places and clears picks", () => {
        const store = useDraftStore.getState();
        store.setPick("ally", 0, "266");
        expect(useDraftStore.getState().board.ally[0]).toBe("266");
        useDraftStore.getState().clearSlot("ally", 0);
        expect(useDraftStore.getState().board.ally[0]).toBeNull();
    });

    it("fills the selected slot and moves to the next open one", () => {
        useDraftStore.getState().selectSlot({ team: "ally", role: 0 });
        useDraftStore.getState().pickInSelectedSlot("266");
        expect(useDraftStore.getState().board.ally[0]).toBe("266");
        expect(useDraftStore.getState().selected).toEqual({ team: "ally", role: 1 });
    });

    it("swaps two slots", () => {
        useDraftStore.getState().setPick("ally", 0, "266");
        useDraftStore.getState().setPick("ally", 1, "64");
        useDraftStore
            .getState()
            .moveSlot({ team: "ally", role: 0 }, { team: "ally", role: 1 });
        expect(useDraftStore.getState().board.ally[0]).toBe("64");
        expect(useDraftStore.getState().board.ally[1]).toBe("266");
    });

    it("caps bans at five and refuses duplicates", () => {
        for (const key of ["1", "2", "3", "4", "5", "6"]) {
            useDraftStore.getState().addBan("ally", key);
        }
        useDraftStore.getState().addBan("ally", "1");
        expect(useDraftStore.getState().board.bans.ally).toEqual([
            "1",
            "2",
            "3",
            "4",
            "5",
        ]);
        useDraftStore.getState().removeBan("ally", "3");
        expect(useDraftStore.getState().board.bans.ally).toEqual(["1", "2", "4", "5"]);
    });

    it("undoes and redoes manual edits", () => {
        useDraftStore.getState().setPick("ally", 0, "266");
        useDraftStore.getState().setPick("ally", 1, "64");
        expect(selectCanUndo(useDraftStore.getState())).toBe(true);

        useDraftStore.getState().undo();
        expect(useDraftStore.getState().board.ally[1]).toBeNull();
        expect(useDraftStore.getState().board.ally[0]).toBe("266");
        expect(selectCanRedo(useDraftStore.getState())).toBe(true);

        useDraftStore.getState().redo();
        expect(useDraftStore.getState().board.ally[1]).toBe("64");
    });

    it("never records a no-op edit", () => {
        useDraftStore.getState().setPick("ally", 0, null);
        expect(useDraftStore.getState().past).toHaveLength(0);
    });

    describe("suivre le client", () => {
        it("ignores champ-select frames while the mode is off", () => {
            useDraftStore.getState().applyChampSelect(champSelect([[0, "266"]]));
            expect(useDraftStore.getState().board.ally[0]).toBeNull();
        });

        it("mirrors the client while the mode is on", () => {
            useDraftStore.getState().setFollowClient(true);
            useDraftStore.getState().applyChampSelect(champSelect([[0, "266"]]));
            expect(useDraftStore.getState().board.ally[0]).toBe("266");
            expect(useDraftStore.getState().liveUpdatedAt).not.toBeNull();
        });

        it("does not fill the undo stack with live frames", () => {
            useDraftStore.getState().setFollowClient(true);
            useDraftStore.getState().applyChampSelect(champSelect([[0, "266"]]));
            useDraftStore.getState().applyChampSelect(champSelect([[0, "122"]]));
            expect(useDraftStore.getState().past).toHaveLength(0);
        });

        it("turns itself off on the first manual edit", () => {
            useDraftStore.getState().setFollowClient(true);
            useDraftStore.getState().applyChampSelect(champSelect([[0, "266"]]));
            useDraftStore.getState().setPick("ally", 1, "64");
            expect(useDraftStore.getState().followClient).toBe(false);
            useDraftStore.getState().applyChampSelect(champSelect([[0, "999"]]));
            expect(useDraftStore.getState().board.ally[0]).toBe("266");
        });

        it("turns itself off on undo, clear and ban edits", () => {
            useDraftStore.getState().setFollowClient(true);
            useDraftStore.getState().addBan("ally", "1");
            expect(useDraftStore.getState().followClient).toBe(false);
        });
    });

    describe("request selectors", () => {
        it("builds the analyze body in wire format", () => {
            useDraftStore.getState().setPick("ally", 0, "266");
            useDraftStore.getState().setPick("opponent", 2, "157");
            useDraftStore.getState().addBan("opponent", "50");
            expect(selectAnalyzeRequest(useDraftStore.getState())).toEqual({
                team: [[0, "266"]],
                enemy: [[2, "157"]],
                bans: { ally: [], opponent: ["50"] },
            });
        });

        it("only sends config overrides that were actually set", () => {
            expect(
                selectAnalyzeRequest(useDraftStore.getState()).config,
            ).toBeUndefined();
            useDraftStore.getState().setRiskLevel("high");
            useDraftStore.getState().setRank("DIAMOND_PLUS");
            const request = selectAnalyzeRequest(useDraftStore.getState());
            expect(request.config).toEqual({ riskLevel: "high" });
            expect(request.rank).toBe("DIAMOND_PLUS");
        });

        it("adds the suggestion limit and role filter", () => {
            const request = selectSuggestionsRequest(useDraftStore.getState(), {
                limit: 8,
                roles: [1, 2],
            });
            expect(request.limit).toBe(8);
            expect(request.roles).toEqual([1, 2]);
        });
    });

    it("hydrates from a shared URL and clears history", () => {
        useDraftStore.getState().setPick("ally", 0, "266");
        useDraftStore.getState().hydrateFromSearch("ally=2-157&risk=low");
        const state = useDraftStore.getState();
        expect(state.board.ally[2]).toBe("157");
        expect(state.board.ally[0]).toBeNull();
        expect(state.riskLevel).toBe("low");
        expect(state.past).toHaveLength(0);
    });
});
