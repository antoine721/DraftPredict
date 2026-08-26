import { describe, expect, it } from "vitest";
import type { SerializedChampSelectState } from "../api/types";
import {
    boardFromChampSelect,
    boardIsEmpty,
    boardsEqual,
    cloneBoard,
    emptyBoard,
    nextOpenSlot,
    openRoles,
    pickedChampions,
    teamEntries,
    unavailableChampions,
} from "./draft-board";

describe("board basics", () => {
    it("starts empty", () => {
        const board = emptyBoard();
        expect(boardIsEmpty(board)).toBe(true);
        expect(teamEntries(board.ally)).toEqual([]);
        expect(openRoles(board.ally)).toEqual([0, 1, 2, 3, 4]);
    });

    it("serialises a team in role order", () => {
        const board = emptyBoard();
        board.ally[3] = "22";
        board.ally[0] = "266";
        expect(teamEntries(board.ally)).toEqual([
            [0, "266"],
            [3, "22"],
        ]);
    });

    it("clones deeply", () => {
        const board = emptyBoard();
        board.bans.ally.push("1");
        const copy = cloneBoard(board);
        copy.bans.ally.push("2");
        copy.ally[0] = "266";
        expect(board.bans.ally).toEqual(["1"]);
        expect(board.ally[0]).toBeNull();
    });

    it("lists picked and unavailable champions", () => {
        const board = emptyBoard();
        board.ally[0] = "266";
        board.opponent[2] = "157";
        board.bans.opponent = ["50"];
        expect([...pickedChampions(board)].sort()).toEqual(["157", "266"]);
        expect([...unavailableChampions(board)].sort()).toEqual(["157", "266", "50"]);
    });

    it("compares boards by value", () => {
        const a = emptyBoard();
        const b = emptyBoard();
        expect(boardsEqual(a, b)).toBe(true);
        b.ally[1] = "64";
        expect(boardsEqual(a, b)).toBe(false);
    });
});

describe("nextOpenSlot", () => {
    it("walks the ally team then the enemy team, wrapping", () => {
        const board = emptyBoard();
        board.ally[0] = "266";
        expect(nextOpenSlot(board, { team: "ally", role: 0 })).toEqual({
            team: "ally",
            role: 1,
        });
        for (const role of [1, 2, 3, 4] as const) board.ally[role] = String(role);
        expect(nextOpenSlot(board, { team: "ally", role: 4 })).toEqual({
            team: "opponent",
            role: 0,
        });
    });

    it("returns null when the board is full", () => {
        const board = emptyBoard();
        for (const role of [0, 1, 2, 3, 4] as const) {
            board.ally[role] = `a${role}`;
            board.opponent[role] = `e${role}`;
        }
        expect(nextOpenSlot(board, null)).toBeNull();
    });
});

describe("boardFromChampSelect", () => {
    it("merges hovers into empty slots but never over a lock-in", () => {
        const state = {
            ally: [[0, "266"]],
            opponent: [[0, "122"]],
            allyHovers: [
                [0, "999"],
                [2, "157"],
            ],
            opponentHovers: [[4, "50"]],
            bans: { ally: ["1"], opponent: ["2"] },
        } as unknown as SerializedChampSelectState;

        const board = boardFromChampSelect(state);
        expect(board.ally[0]).toBe("266");
        expect(board.ally[2]).toBe("157");
        expect(board.opponent[0]).toBe("122");
        expect(board.opponent[4]).toBe("50");
        expect(board.bans).toEqual({ ally: ["1"], opponent: ["2"] });
    });
});
