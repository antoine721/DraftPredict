import { Role } from "@draftpredict/core";
import { loadStaticData } from "@draftpredict/data";
import { describe, expect, it } from "vitest";
import type { LcuChampSelectSession } from "../api/types.js";
import {
    CHAMPIONS,
    blindPickSession,
    rankedDraftSession,
} from "../testing/champ-select-fixtures.js";
import { makeRoleDataset } from "../testing/dataset.js";
import { championKeyOf, mapChampSelectSession } from "./map.js";

/** Enough of a metagame for role inference: every fixture champion, one role. */
const DATASET = makeRoleDataset({
    "266": { [Role.Top]: 9_000, [Role.Middle]: 200 },
    "64": { [Role.Jungle]: 9_000, [Role.Top]: 400 },
    "103": { [Role.Middle]: 9_000, [Role.Support]: 100 },
    "222": { [Role.Bottom]: 9_000, [Role.Middle]: 50 },
    "412": { [Role.Support]: 9_000, [Role.Top]: 50 },
    "86": { [Role.Top]: 9_000, [Role.Middle]: 200 },
    "234": { [Role.Jungle]: 9_000, [Role.Top]: 300 },
    "134": { [Role.Middle]: 9_000, [Role.Bottom]: 100 },
    "51": { [Role.Bottom]: 9_000, [Role.Middle]: 50 },
    "117": { [Role.Support]: 9_000, [Role.Middle]: 100 },
});

const key = (championId: number) => String(championId);

describe("championKeyOf", () => {
    it.each([0, -1, undefined, null, Number.NaN])(
        "never lets %s reach the engine",
        (championId) => {
            expect(championKeyOf(championId)).toBeNull();
        },
    );

    it("stringifies a real champion id", () => {
        expect(championKeyOf(103)).toBe("103");
    });
});

describe("mapChampSelectSession — ranked draft", () => {
    const state = mapChampSelectSession(rankedDraftSession(), { dataset: DATASET });

    it("reads the phase and timer", () => {
        expect(state.phase).toBe("BAN_PICK");
        expect(state.timerMs).toBe(27_000);
        expect(state.isCustom).toBe(false);
        expect(state.isSpectating).toBe(false);
        expect(state.benchChampionKeys).toEqual([]);
    });

    it("maps the locked ally picks onto their assigned roles", () => {
        expect([...state.ally.entries()]).toEqual([
            [Role.Top, key(CHAMPIONS.aatrox)],
            [Role.Jungle, key(CHAMPIONS.leeSin)],
        ]);
    });

    it("keeps the local player's hover out of the locked picks", () => {
        expect(state.ally.has(Role.Middle)).toBe(false);
        expect(state.allyHovers.get(Role.Middle)).toBe(key(CHAMPIONS.ahri));
    });

    it("infers the enemy roles, which Riot never sends", () => {
        expect([...state.opponent.entries()]).toEqual([
            [Role.Top, key(CHAMPIONS.garen)],
            [Role.Jungle, key(CHAMPIONS.viego)],
        ]);
        expect(state.opponentHovers.get(Role.Middle)).toBe(key(CHAMPIONS.syndra));
    });

    it("never lets an unpicked enemy cell leak a zero champion id", () => {
        const everyKey = [
            ...state.ally.values(),
            ...state.opponent.values(),
            ...state.allyHovers.values(),
            ...state.opponentHovers.values(),
            ...state.bans.ally,
            ...state.bans.opponent,
        ];
        expect(everyKey).not.toContain("0");
        expect(everyKey).not.toContain("-1");
        expect(state.opponent.size + state.opponentHovers.size).toBe(3);
    });

    it("merges session bans with the completed ban actions", () => {
        // `bans.myTeamBans` is one behind; Kayn only exists as an action.
        expect(state.bans.ally).toEqual([
            key(CHAMPIONS.sett),
            key(CHAMPIONS.zed),
            key(CHAMPIONS.kayn),
        ]);
        expect(state.bans.opponent).toEqual([
            key(CHAMPIONS.yasuo),
            key(CHAMPIONS.pyke),
            key(CHAMPIONS.ekko),
        ]);
    });

    it("describes the local player and whose turn it is", () => {
        expect(state.localPlayer).toEqual({
            cellId: 2,
            puuid: "puuid-ally-2",
            assignedRole: Role.Middle,
            championKey: null,
            hoveredChampionKey: key(CHAMPIONS.ahri),
            pickActionId: 11,
            banActionId: null,
        });
        expect(state.isLocalPlayerTurn).toBe(true);
        expect(state.currentActorCellId).toBe(2);
    });

    it("reads the pick order from the actions", () => {
        expect(state.pickOrder).toEqual([0, 5, 6, 1, 2, 7, 8]);
    });

    it("exposes per-cell detail for both teams", () => {
        expect(state.allyPlayers).toHaveLength(5);
        expect(state.opponentPlayers).toHaveLength(5);
        expect(state.allyPlayers[2]).toMatchObject({
            cellId: 2,
            isLocalPlayer: true,
            role: Role.Middle,
            championKey: null,
            hoveredChampionKey: key(CHAMPIONS.ahri),
            spellIds: { spell1: 4, spell2: 14 },
        });
        // Riot hides enemy identities in ranked: no empty-string puuids escape.
        expect(state.opponentPlayers.every((player) => player.puuid === null)).toBe(
            true,
        );
        expect(state.opponentPlayers[0]).toMatchObject({
            assignedRole: null,
            role: Role.Top,
            championKey: key(CHAMPIONS.garen),
        });
    });

    it("falls back to slot order when no dataset is available", () => {
        const noDataset = mapChampSelectSession(rankedDraftSession());

        // Ally roles are still exact: Riot assigned them.
        expect(noDataset.ally.get(Role.Top)).toBe(key(CHAMPIONS.aatrox));
        // Enemy roles degrade to cell order instead of disappearing.
        expect(noDataset.opponent.get(Role.Top)).toBe(key(CHAMPIONS.garen));
        expect(noDataset.opponent.get(Role.Jungle)).toBe(key(CHAMPIONS.viego));
        expect(noDataset.opponentHovers.get(Role.Middle)).toBe(key(CHAMPIONS.syndra));
    });
});

describe("mapChampSelectSession — blind pick without assigned positions", () => {
    const state = mapChampSelectSession(blindPickSession(), { dataset: DATASET });

    it("infers every role on both teams", () => {
        expect([...state.ally.entries()]).toEqual([
            [Role.Top, key(CHAMPIONS.aatrox)],
            [Role.Jungle, key(CHAMPIONS.leeSin)],
            [Role.Middle, key(CHAMPIONS.ahri)],
            [Role.Bottom, key(CHAMPIONS.jinx)],
            [Role.Support, key(CHAMPIONS.thresh)],
        ]);
        expect([...state.opponent.entries()]).toEqual([
            [Role.Top, key(CHAMPIONS.garen)],
            [Role.Jungle, key(CHAMPIONS.viego)],
            [Role.Middle, key(CHAMPIONS.syndra)],
            [Role.Bottom, key(CHAMPIONS.caitlyn)],
            [Role.Support, key(CHAMPIONS.lulu)],
        ]);
    });

    it("has nothing hovered once everyone is locked", () => {
        expect(state.allyHovers.size).toBe(0);
        expect(state.opponentHovers.size).toBe(0);
        expect(state.isLocalPlayerTurn).toBe(false);
        expect(state.currentActorCellId).toBeNull();
    });

    it("still finds the local player", () => {
        expect(state.localPlayer.cellId).toBe(4);
        expect(state.localPlayer.championKey).toBe(key(CHAMPIONS.thresh));
        expect(state.localPlayer.assignedRole).toBeNull();
    });

    it("assigns roles by slot order when inference is switched off", () => {
        const slotOrder = mapChampSelectSession(blindPickSession(), {
            dataset: DATASET,
            inferRoles: false,
        });
        expect([...slotOrder.ally.values()]).toEqual([
            key(CHAMPIONS.aatrox),
            key(CHAMPIONS.leeSin),
            key(CHAMPIONS.ahri),
            key(CHAMPIONS.jinx),
            key(CHAMPIONS.thresh),
        ]);
        expect(slotOrder.ally.get(Role.Top)).toBe(key(CHAMPIONS.aatrox));
    });
});

describe("mapChampSelectSession — edge cases", () => {
    it("maps an empty session without throwing", () => {
        const state = mapChampSelectSession({});
        expect(state.ally.size).toBe(0);
        expect(state.opponent.size).toBe(0);
        expect(state.phase).toBe("");
        expect(state.timerMs).toBe(0);
        expect(state.localPlayer.cellId).toBe(-1);
        expect(state.pickOrder).toEqual([]);
    });

    it("treats a session without pick actions as already locked in", () => {
        // ARAM and some customs hand out champions with no actions at all.
        const session: LcuChampSelectSession = {
            localPlayerCellId: 0,
            benchEnabled: true,
            benchChampionIds: [CHAMPIONS.jinx, 0, CHAMPIONS.lulu],
            myTeam: [
                { cellId: 0, championId: CHAMPIONS.ahri, assignedPosition: "" },
                { cellId: 1, championId: CHAMPIONS.thresh, assignedPosition: "" },
            ],
            theirTeam: [],
            timer: { phase: "BAN_PICK", adjustedTimeLeftInPhase: 1_000 },
        };

        const state = mapChampSelectSession(session, { dataset: DATASET });

        expect([...state.ally.values()]).toEqual([
            key(CHAMPIONS.ahri),
            key(CHAMPIONS.thresh),
        ]);
        expect(state.allyHovers.size).toBe(0);
        expect(state.benchChampionKeys).toEqual([
            key(CHAMPIONS.jinx),
            key(CHAMPIONS.lulu),
        ]);
    });

    it("reads the older benchChampions shape", () => {
        const state = mapChampSelectSession({
            benchChampions: [{ championId: CHAMPIONS.jinx }, { championId: 0 }],
        });
        expect(state.benchChampionKeys).toEqual([key(CHAMPIONS.jinx)]);
    });

    it("prefers the pick intent over a stale champion id", () => {
        const session: LcuChampSelectSession = {
            localPlayerCellId: 0,
            actions: [
                [
                    {
                        id: 1,
                        actorCellId: 0,
                        championId: 0,
                        completed: false,
                        isAllyAction: true,
                        isInProgress: true,
                        type: "pick",
                    },
                ],
            ],
            myTeam: [
                {
                    cellId: 0,
                    championId: 0,
                    championPickIntent: CHAMPIONS.ahri,
                    assignedPosition: "middle",
                },
            ],
        };

        const state = mapChampSelectSession(session, { dataset: DATASET });
        expect(state.allyHovers.get(Role.Middle)).toBe(key(CHAMPIONS.ahri));
        expect(state.ally.size).toBe(0);
        expect(state.localPlayer.pickActionId).toBe(1);
    });

    it("drops a -1 champion id everywhere", () => {
        const state = mapChampSelectSession({
            localPlayerCellId: 0,
            bans: { myTeamBans: [-1, 0], theirTeamBans: [-1] },
            myTeam: [
                {
                    cellId: 0,
                    championId: -1,
                    championPickIntent: -1,
                    assignedPosition: "top",
                },
            ],
            theirTeam: [{ cellId: 5, championId: -1, assignedPosition: "" }],
        });

        expect(state.ally.size).toBe(0);
        expect(state.allyHovers.size).toBe(0);
        expect(state.opponent.size).toBe(0);
        expect(state.bans).toEqual({ ally: [], opponent: [] });
    });

    it("de-duplicates bans that appear in both places", () => {
        const state = mapChampSelectSession({
            bans: { myTeamBans: [CHAMPIONS.zed, CHAMPIONS.zed] },
            actions: [
                [
                    {
                        id: 1,
                        actorCellId: 0,
                        championId: CHAMPIONS.zed,
                        completed: true,
                        isAllyAction: true,
                        isInProgress: false,
                        type: "ban",
                    },
                ],
            ],
        });

        expect(state.bans.ally).toEqual([key(CHAMPIONS.zed)]);
    });

    it("ignores an incomplete ban action", () => {
        const state = mapChampSelectSession({
            actions: [
                [
                    {
                        id: 1,
                        actorCellId: 0,
                        championId: CHAMPIONS.zed,
                        completed: false,
                        isAllyAction: true,
                        isInProgress: true,
                        type: "ban",
                    },
                ],
            ],
        });

        expect(state.bans.ally).toEqual([]);
        expect(state.currentActorCellId).toBe(0);
    });

    it("finds the local player by puuid when the cell id is missing", () => {
        const session = rankedDraftSession();
        session.localPlayerCellId = -1;
        session.isSpectating = true;

        const state = mapChampSelectSession(session, {
            dataset: DATASET,
            localPuuid: "puuid-ally-3",
        });

        expect(state.isSpectating).toBe(true);
        expect(state.localPlayer.cellId).toBe(3);
        expect(state.localPlayer.assignedRole).toBe(Role.Bottom);
        expect(state.isLocalPlayerTurn).toBe(false);
        // With no local turn, the acting cell is still reported.
        expect(state.currentActorCellId).toBe(2);
    });

    it("survives a malformed actions array", () => {
        const state = mapChampSelectSession({
            // The client has been seen sending nulls here mid-transition.
            actions: [null, [null]] as unknown as LcuChampSelectSession["actions"],
            myTeam: [
                { cellId: 0, championId: CHAMPIONS.ahri, assignedPosition: "middle" },
            ],
        });

        expect(state.ally.get(Role.Middle)).toBe(key(CHAMPIONS.ahri));
    });
});

describe("mapChampSelectSession — static data", () => {
    it("fills in champion names when a snapshot is provided", () => {
        const staticData = loadStaticData();
        const state = mapChampSelectSession(rankedDraftSession(), {
            dataset: DATASET,
            staticData,
        });

        expect(state.allyPlayers[0]?.championName).toBe("Aatrox");
        // The hovered champion names the cell too, so a UI can label it.
        expect(state.allyPlayers[2]?.championName).toBe("Ahri");
        expect(state.opponentPlayers[0]?.championName).toBe("Garen");
        expect(state.opponentPlayers[4]?.championName).toBeNull();
    });

    it("leaves names null without a snapshot", () => {
        const state = mapChampSelectSession(rankedDraftSession(), { dataset: DATASET });
        expect(state.allyPlayers[0]?.championName).toBeNull();
    });
});
