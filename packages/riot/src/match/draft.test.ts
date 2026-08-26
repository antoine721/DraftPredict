import {
    Role,
    defaultChampionData,
    emptyDataset,
    type Dataset,
} from "@draftpredict/core";
import { beforeEach, describe, expect, it } from "vitest";

import { makeMatch, makeSummary, resetFixtureCounter } from "../testing/fixtures.js";
import type { CurrentGameInfo } from "../types/spectator.js";
import { summarizeMatch } from "./summary.js";
import { buildDraftFromMatch, buildDraftFromSpectatorGame } from "./draft.js";

beforeEach(() => {
    resetFixtureCounter();
});

/** Champions 1..10, each with games only in the role that matches its index. */
function makeRoleDataset(): Dataset {
    const dataset = emptyDataset();
    for (let index = 0; index < 10; index += 1) {
        const key = String(index + 1);
        const champion = defaultChampionData(key);
        const role = (index % 5) as Role;
        champion.statsByRole[role].games = 1_000;
        champion.statsByRole[role].wins = 500;
        dataset.championData[key] = champion;
    }
    return dataset;
}

function makeLiveGame(): CurrentGameInfo {
    return {
        gameId: 1,
        gameType: "MATCHED_GAME",
        gameStartTime: 0,
        mapId: 11,
        gameLength: 300,
        platformId: "EUW1",
        gameMode: "CLASSIC",
        gameQueueConfigId: 420,
        bannedChampions: [
            { championId: 99, teamId: 100, pickTurn: 1 },
            { championId: 98, teamId: 200, pickTurn: 2 },
            { championId: -1, teamId: 200, pickTurn: 3 },
        ],
        participants: Array.from({ length: 10 }, (_, index) => ({
            puuid: `puuid-${index + 1}`,
            championId: index + 1,
            teamId: index < 5 ? 100 : 200,
            spell1Id: 4,
            spell2Id: 7,
        })),
    };
}

describe("buildDraftFromMatch", () => {
    it("rebuilds the champion select of a finished game", () => {
        const summary = summarizeMatch(makeMatch(), "puuid-8");
        const draft = buildDraftFromMatch(summary);
        // puuid-8 is on the red team, so it becomes `ally`.
        expect(draft.ally.get(Role.Middle)).toBe("108");
        expect(draft.opponent.get(Role.Middle)).toBe("103");
        expect(draft.ally.size).toBe(5);
        expect(draft.opponent.size).toBe(5);
    });

    it("round-trips a summary built by hand", () => {
        const summary = makeSummary({ role: Role.Top, championKey: "17" });
        const draft = buildDraftFromMatch(summary);
        expect(draft.ally.get(Role.Top)).toBe("17");
        expect(draft.opponent.get(Role.Top)).toBe("2");
    });
});

describe("buildDraftFromSpectatorGame", () => {
    it("returns null when the player is not in the game", () => {
        expect(buildDraftFromSpectatorGame(makeLiveGame(), "stranger")).toBeNull();
    });

    it("places champions in spectator order without a dataset", () => {
        const draft = buildDraftFromSpectatorGame(makeLiveGame(), "puuid-7")!;
        // puuid-7 is on team 200 -> ally.
        expect([...draft.ally.values()]).toEqual(["6", "7", "8", "9", "10"]);
        expect([...draft.opponent.values()]).toEqual(["1", "2", "3", "4", "5"]);
        expect(draft.bans.ally).toEqual(["98"]);
        expect(draft.bans.opponent).toEqual(["99"]);
    });

    it("predicts roles when a dataset is given", () => {
        const draft = buildDraftFromSpectatorGame(makeLiveGame(), "puuid-1", {
            dataset: makeRoleDataset(),
        })!;
        expect(draft.ally.get(Role.Top)).toBe("1");
        expect(draft.ally.get(Role.Support)).toBe("5");
        expect(draft.opponent.get(Role.Top)).toBe("6");
        expect(draft.opponent.get(Role.Support)).toBe("10");
    });
});
