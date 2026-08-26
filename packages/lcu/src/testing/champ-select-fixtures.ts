import type { LcuChampSelectSession } from "../api/types.js";

/**
 * Hand-written champ-select sessions, shaped exactly like the ones the League
 * Client emits. Test-only: not exported from `src/index.ts`.
 */

/** Champion ids used by the fixtures, for readable assertions. */
export const CHAMPIONS = {
    aatrox: 266,
    leeSin: 64,
    ahri: 103,
    jinx: 222,
    thresh: 412,
    garen: 86,
    viego: 234,
    syndra: 134,
    caitlyn: 51,
    lulu: 117,
    // bans
    sett: 875,
    zed: 238,
    kayn: 141,
    yasuo: 157,
    pyke: 555,
    ekko: 245,
} as const;

/**
 * A 5v5 ranked solo/duo draft, mid-way through the first pick round.
 *
 * - the ally team has `assignedPosition` on every cell; the enemy team never
 *   does (Riot hides it), so the enemy roles have to be inferred;
 * - the first ban phase is over: six completed ban actions, while
 *   `bans.myTeamBans` still lags one behind — the mapper must merge both;
 * - Aatrox (ally top), Garen and Viego (enemy top/jungle) are locked;
 * - the local player (cell 2, mid) is hovering Ahri: their pick action is in
 *   progress and not completed;
 * - the enemy mid's upcoming action already carries their hovered champion,
 *   which is how enemy intents become visible before they lock.
 */
export function rankedDraftSession(): LcuChampSelectSession {
    return {
        actions: [
            [
                banAction(1, 0, CHAMPIONS.sett, true),
                banAction(2, 5, CHAMPIONS.yasuo, false),
                banAction(3, 1, CHAMPIONS.zed, true),
                banAction(4, 6, CHAMPIONS.pyke, false),
                banAction(5, 2, CHAMPIONS.kayn, true),
                banAction(6, 7, CHAMPIONS.ekko, false),
            ],
            [
                {
                    id: 7,
                    actorCellId: 0,
                    championId: CHAMPIONS.aatrox,
                    completed: true,
                    isAllyAction: true,
                    isInProgress: false,
                    pickTurn: 1,
                    type: "pick",
                },
            ],
            [
                {
                    id: 8,
                    actorCellId: 5,
                    championId: CHAMPIONS.garen,
                    completed: true,
                    isAllyAction: false,
                    isInProgress: false,
                    pickTurn: 2,
                    type: "pick",
                },
                {
                    id: 9,
                    actorCellId: 6,
                    championId: CHAMPIONS.viego,
                    completed: true,
                    isAllyAction: false,
                    isInProgress: false,
                    pickTurn: 3,
                    type: "pick",
                },
            ],
            [
                {
                    id: 10,
                    actorCellId: 1,
                    championId: CHAMPIONS.leeSin,
                    completed: true,
                    isAllyAction: true,
                    isInProgress: false,
                    pickTurn: 4,
                    type: "pick",
                },
                {
                    id: 11,
                    actorCellId: 2,
                    championId: CHAMPIONS.ahri,
                    completed: false,
                    isAllyAction: true,
                    isInProgress: true,
                    pickTurn: 5,
                    type: "pick",
                },
            ],
            [
                {
                    id: 12,
                    actorCellId: 7,
                    championId: CHAMPIONS.syndra,
                    completed: false,
                    isAllyAction: false,
                    isInProgress: false,
                    pickTurn: 6,
                    type: "pick",
                },
                {
                    id: 13,
                    actorCellId: 8,
                    championId: 0,
                    completed: false,
                    isAllyAction: false,
                    isInProgress: false,
                    pickTurn: 7,
                    type: "pick",
                },
            ],
        ],
        bans: {
            // One ban behind the actions on purpose: this is what the client
            // really does for a moment after the ban phase closes.
            myTeamBans: [CHAMPIONS.sett, CHAMPIONS.zed],
            theirTeamBans: [CHAMPIONS.yasuo, CHAMPIONS.pyke],
            numBans: 10,
        },
        benchChampionIds: [],
        benchEnabled: false,
        counter: 42,
        gameId: 0,
        hasSimultaneousBans: true,
        hasSimultaneousPicks: false,
        isCustomGame: false,
        isSpectating: false,
        localPlayerCellId: 2,
        myTeam: [
            allyPlayer(0, "top", CHAMPIONS.aatrox, 0),
            allyPlayer(1, "jungle", CHAMPIONS.leeSin, 0),
            allyPlayer(2, "middle", 0, CHAMPIONS.ahri),
            allyPlayer(3, "bottom", 0, 0),
            allyPlayer(4, "utility", 0, 0),
        ],
        theirTeam: [
            enemyPlayer(5, CHAMPIONS.garen),
            enemyPlayer(6, CHAMPIONS.viego),
            enemyPlayer(7, 0),
            enemyPlayer(8, 0),
            enemyPlayer(9, 0),
        ],
        rerollsRemaining: 0,
        timer: {
            adjustedTimeLeftInPhase: 27_000,
            totalTimeInPhase: 30_000,
            phase: "BAN_PICK",
            isInfinite: false,
            internalNowInEpochMs: 1_764_000_000_000,
        },
        trades: [],
    };
}

/**
 * A blind-pick session: every champion is locked, nobody has a position.
 *
 * This is the shape that forces role inference — `assignedPosition` is `""` on
 * all ten cells and the enemy ids only appear once they lock.
 */
export function blindPickSession(): LcuChampSelectSession {
    const allies = [
        CHAMPIONS.aatrox,
        CHAMPIONS.leeSin,
        CHAMPIONS.ahri,
        CHAMPIONS.jinx,
        CHAMPIONS.thresh,
    ];
    const enemies = [
        CHAMPIONS.garen,
        CHAMPIONS.viego,
        CHAMPIONS.syndra,
        CHAMPIONS.caitlyn,
        CHAMPIONS.lulu,
    ];

    return {
        actions: [
            allies.map((championId, index) => ({
                id: 100 + index,
                actorCellId: index,
                championId,
                completed: true,
                isAllyAction: true,
                isInProgress: false,
                pickTurn: 1,
                type: "pick" as const,
            })),
            enemies.map((championId, index) => ({
                id: 200 + index,
                actorCellId: 5 + index,
                championId,
                completed: true,
                isAllyAction: false,
                isInProgress: false,
                pickTurn: 1,
                type: "pick" as const,
            })),
        ],
        bans: { myTeamBans: [], theirTeamBans: [], numBans: 0 },
        benchChampionIds: [],
        benchEnabled: false,
        counter: 7,
        hasSimultaneousBans: false,
        hasSimultaneousPicks: true,
        isCustomGame: false,
        isSpectating: false,
        localPlayerCellId: 4,
        myTeam: allies.map((championId, index) => allyPlayer(index, "", championId, 0)),
        theirTeam: enemies.map((championId, index) =>
            enemyPlayer(5 + index, championId),
        ),
        timer: {
            adjustedTimeLeftInPhase: 5_000,
            totalTimeInPhase: 30_000,
            phase: "FINALIZATION",
            isInfinite: false,
        },
    };
}

function banAction(id: number, actorCellId: number, championId: number, ally: boolean) {
    return {
        id,
        actorCellId,
        championId,
        completed: true,
        isAllyAction: ally,
        isInProgress: false,
        pickTurn: 1,
        type: "ban" as const,
    };
}

function allyPlayer(
    cellId: number,
    assignedPosition: string,
    championId: number,
    championPickIntent: number,
) {
    return {
        cellId,
        assignedPosition,
        championId,
        championPickIntent,
        puuid: `puuid-ally-${cellId}`,
        summonerId: 1000 + cellId,
        gameName: `Ally${cellId}`,
        tagLine: "EUW",
        nameVisibilityType: "VISIBLE",
        spell1Id: 4,
        spell2Id: cellId === 1 ? 11 : 14,
        selectedSkinId: championId * 1000,
        team: 1,
        wardSkinId: -1,
    };
}

function enemyPlayer(cellId: number, championId: number) {
    return {
        cellId,
        // Riot never reveals the enemy team's assigned positions.
        assignedPosition: "",
        championId,
        championPickIntent: 0,
        // Nor their identities, in ranked queues.
        puuid: "",
        summonerId: 0,
        nameVisibilityType: "HIDDEN",
        obfuscatedPuuid: `obfuscated-${cellId}`,
        obfuscatedSummonerId: 9000 + cellId,
        spell1Id: 0,
        spell2Id: 0,
        selectedSkinId: 0,
        team: 2,
        wardSkinId: -1,
    };
}
