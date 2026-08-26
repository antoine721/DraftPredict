import { describe, expect, it } from "vitest";
import {
    decodeDraftParams,
    encodeDraftParams,
    encodeDraftSearch,
    hasDraftParams,
} from "./draft-url";
import { emptyBoard, type DraftBoard } from "./draft-board";

function board(): DraftBoard {
    const value = emptyBoard();
    value.ally[0] = "266";
    value.ally[1] = "64";
    value.opponent[0] = "122";
    value.bans.ally = ["1", "2"];
    value.bans.opponent = ["3"];
    return value;
}

describe("encodeDraftParams", () => {
    it("encodes both teams, bans and the analysis config", () => {
        expect(
            encodeDraftParams({
                board: board(),
                riskLevel: "high",
                rank: "DIAMOND_PLUS",
                region: "EUW",
                minGames: 250,
                ignoreChampionWinrates: true,
            }),
        ).toEqual({
            ally: "0-266.1-64",
            enemy: "0-122",
            banA: "1.2",
            banE: "3",
            risk: "high",
            rank: "DIAMOND_PLUS",
            region: "EUW",
            minGames: "250",
            icw: "1",
        });
    });

    it("omits everything empty", () => {
        expect(encodeDraftParams({ board: emptyBoard() })).toEqual({});
        expect(encodeDraftSearch({ board: emptyBoard() })).toBe("");
    });
});

describe("decodeDraftParams", () => {
    it("round-trips an encoded draft", () => {
        const original = {
            board: board(),
            riskLevel: "very-high" as const,
            rank: "MASTER" as const,
            region: "KR" as const,
            minGames: 500,
            ignoreChampionWinrates: false,
        };
        const decoded = decodeDraftParams(
            new URLSearchParams(encodeDraftParams(original)),
        );
        expect(decoded.board).toEqual(original.board);
        expect(decoded.riskLevel).toBe("very-high");
        expect(decoded.rank).toBe("MASTER");
        expect(decoded.region).toBe("KR");
        expect(decoded.minGames).toBe(500);
        expect(decoded.ignoreChampionWinrates).toBe(false);
    });

    it("accepts the lenient risk-level spellings the API accepts", () => {
        expect(decodeDraftParams("risk=veryHigh").riskLevel).toBe("very-high");
        expect(decodeDraftParams("risk=VERY_LOW").riskLevel).toBe("very-low");
        expect(decodeDraftParams("risk=nope").riskLevel).toBeNull();
    });

    it("drops garbage instead of failing", () => {
        const decoded = decodeDraftParams(
            "ally=9-266.0-abc.2-157&enemy=&banA=x.4&rank=NOPE&region=??&minGames=-3",
        );
        expect(decoded.board.ally[2]).toBe("157");
        expect(decoded.board.ally[0]).toBeNull();
        expect(decoded.board.bans.ally).toEqual(["4"]);
        expect(decoded.rank).toBeNull();
        expect(decoded.region).toBeNull();
        expect(decoded.minGames).toBeNull();
    });

    it("returns an empty draft for an empty query", () => {
        const decoded = decodeDraftParams("");
        expect(decoded.board).toEqual(emptyBoard());
        expect(decoded.riskLevel).toBeNull();
    });

    it("detects whether a query carries a draft at all", () => {
        expect(hasDraftParams("ally=0-266")).toBe(true);
        expect(hasDraftParams("tab=items")).toBe(false);
    });
});
