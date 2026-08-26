import { describe, expect, it } from "vitest";
import type { CurrentGameInfo } from "@draftpredict/riot";
import type {
    AnalyzePayload,
    LcuStatus,
    SerializedChampSelectState,
} from "../../api/types";
import {
    POLL_BASE_MS,
    POLL_MAX_MS,
    breakdownRows,
    champSelectRows,
    champSelectPhaseLabel,
    clientState,
    elapsedSeconds,
    gameflowPhaseLabel,
    intervalLabel,
    isLoadingScreen,
    liveBans,
    liveTeams,
    parseRiotId,
    pollIntervalMs,
    pollingSentence,
    queueLabel,
    smallestSample,
    turnInfo,
} from "./helpers";

/**
 * The reasoning of the live view, tested away from React.
 *
 * The payloads below are the shapes `apps/server` actually answers with (a
 * champ-select frame from `@draftpredict/lcu`, a spectator game from
 * spectator-v5, an analysis captured from a running server on the offline
 * fixture), trimmed to what these functions read.
 */

function status(overrides: Partial<LcuStatus> = {}): LcuStatus {
    return {
        enabled: true,
        running: true,
        connected: true,
        polling: false,
        phase: "None",
        inChampSelect: false,
        summoner: null,
        lastError: null,
        updatedAt: 1_787_754_256_212,
        ...overrides,
    };
}

describe("clientState", () => {
    it("never pretends the integration is on when it is off", () => {
        const state = clientState(status({ enabled: false, connected: false }));
        expect(state.kind).toBe("disabled");
        expect(state.live).toBe(false);
        expect(state.title).toContain("désactivée");
    });

    it("distinguishes a client that is being looked for from one that is absent", () => {
        expect(
            clientState(status({ connected: false, running: true })).description,
        ).toContain("cherche le client");
        expect(
            clientState(status({ connected: false, running: false })).description,
        ).toContain("Lancez League of Legends");
    });

    it("reports champion select and in-game separately", () => {
        expect(
            clientState(status({ inChampSelect: true, phase: "ChampSelect" })).kind,
        ).toBe("champselect");
        expect(clientState(status({ phase: "InProgress" })).kind).toBe("ingame");
    });

    it("says the polling fallback is slower without calling it a failure", () => {
        const state = clientState(status({ polling: true, phase: "Lobby" }));
        expect(state.kind).toBe("connected");
        expect(state.tone).toBe("info");
        expect(state.description).toContain("sondage");
    });

    it("admits it knows nothing before the first status", () => {
        expect(clientState(null).kind).toBe("unknown");
    });
});

describe("phase labels", () => {
    it("translates the phases the client reports", () => {
        expect(gameflowPhaseLabel("ChampSelect")).toBe("Sélection des champions");
        expect(gameflowPhaseLabel("InProgress")).toBe("Partie en cours");
        expect(champSelectPhaseLabel("BAN_PICK")).toBe("Bans & picks");
    });

    it("passes an unknown phase through instead of inventing one", () => {
        expect(gameflowPhaseLabel("SomethingNew")).toBe("SomethingNew");
        expect(champSelectPhaseLabel(null)).toBe("Sélection des champions");
    });
});

function champSelect(
    overrides: Partial<SerializedChampSelectState> = {},
): SerializedChampSelectState {
    return {
        phase: "BAN_PICK",
        timerMs: 27_000,
        localPlayer: {
            cellId: 2,
            puuid: "puuid-me",
            assignedRole: 2,
            championKey: "157",
            hoveredChampionKey: null,
            pickActionId: 7,
            banActionId: null,
        },
        ally: [
            [0, "266"],
            [1, "64"],
        ],
        opponent: [[0, "122"]],
        allyHovers: [[2, "157"]],
        opponentHovers: [],
        bans: { ally: ["1"], opponent: ["2"] },
        pickOrder: [0, 5, 1, 6],
        currentActorCellId: 2,
        isLocalPlayerTurn: true,
        benchChampionKeys: [],
        isCustom: false,
        isSpectating: false,
        allyPlayers: [],
        opponentPlayers: [],
        ...overrides,
    } as SerializedChampSelectState;
}

describe("champSelectRows", () => {
    it("always returns the five positions in order", () => {
        const rows = champSelectRows(champSelect(), "ally");
        expect(rows).toHaveLength(5);
        expect(rows.map((row) => row.role)).toEqual([0, 1, 2, 3, 4]);
    });

    it("falls back to the serialized maps and marks hovers as hovers", () => {
        const rows = champSelectRows(champSelect(), "ally");
        expect(rows[0]!.championKey).toBe("266");
        expect(rows[0]!.hovered).toBe(false);
        expect(rows[2]!.championKey).toBe("157");
        expect(rows[2]!.hovered).toBe(true);
        expect(rows[3]!.championKey).toBeNull();
    });

    it("prefers the per-cell detail, with the local player and the acting cell", () => {
        const rows = champSelectRows(
            champSelect({
                allyPlayers: [
                    {
                        cellId: 0,
                        puuid: null,
                        assignedRole: 0,
                        role: 0,
                        championKey: "266",
                        hoveredChampionKey: null,
                        championName: "Aatrox",
                        spellIds: { spell1: 4, spell2: 12 },
                        isLocalPlayer: false,
                    },
                    {
                        cellId: 2,
                        puuid: "puuid-me",
                        assignedRole: 2,
                        role: 2,
                        championKey: null,
                        hoveredChampionKey: "157",
                        championName: "Yasuo",
                        spellIds: { spell1: 4, spell2: 14 },
                        isLocalPlayer: true,
                    },
                ],
            }),
            "ally",
        );
        expect(rows[0]!.championName).toBe("Aatrox");
        expect(rows[2]!.isLocalPlayer).toBe(true);
        expect(rows[2]!.acting).toBe(true);
        expect(rows[2]!.hovered).toBe(true);
    });

    it("places a cell without an assigned position in a free slot and says so", () => {
        const rows = champSelectRows(
            champSelect({
                opponentPlayers: [
                    {
                        cellId: 5,
                        puuid: null,
                        assignedRole: null,
                        role: null,
                        championKey: "122",
                        hoveredChampionKey: null,
                        championName: null,
                        spellIds: { spell1: null, spell2: null },
                        isLocalPlayer: false,
                    },
                ],
            }),
            "opponent",
        );
        expect(rows[0]!.championKey).toBe("122");
        expect(rows[0]!.assigned).toBe(false);
    });

    it("returns five empty rows when there is no champion select at all", () => {
        const rows = champSelectRows(null, "ally");
        expect(rows.every((row) => row.championKey === null)).toBe(true);
    });
});

describe("turnInfo", () => {
    it("puts the local player first", () => {
        expect(turnInfo(champSelect())?.label).toBe("À vous de jouer");
    });

    it("names the position of the ally who is acting", () => {
        const info = turnInfo(
            champSelect({
                isLocalPlayerTurn: false,
                currentActorCellId: 1,
                allyPlayers: [
                    {
                        cellId: 1,
                        puuid: null,
                        assignedRole: 1,
                        role: 1,
                        championKey: null,
                        hoveredChampionKey: null,
                        championName: null,
                        spellIds: { spell1: null, spell2: null },
                        isLocalPlayer: false,
                    },
                ],
            }),
        );
        expect(info?.side).toBe("ally");
        expect(info?.label).toContain("Jungle");
    });

    it("says nothing rather than guessing between two actions", () => {
        expect(
            turnInfo(
                champSelect({ isLocalPlayerTurn: false, currentActorCellId: null }),
            ),
        ).toBeNull();
    });
});

// ------------------------------------------------------------- live game ----

const GAME: CurrentGameInfo = {
    gameId: 7_412_345_678,
    gameType: "MATCHED_GAME",
    gameStartTime: 1_787_754_000_000,
    mapId: 11,
    gameLength: 640,
    platformId: "EUW1",
    gameMode: "CLASSIC",
    gameQueueConfigId: 420,
    bannedChampions: [
        { championId: 55, teamId: 100, pickTurn: 1 },
        { championId: -1, teamId: 200, pickTurn: 2 },
        { championId: 84, teamId: 200, pickTurn: 3 },
    ],
    participants: [
        {
            puuid: "puuid-me",
            championId: 266,
            teamId: 100,
            spell1Id: 4,
            spell2Id: 12,
            riotId: "Moi#EUW",
        },
        { puuid: "p2", championId: 64, teamId: 100, spell1Id: 11, spell2Id: 4 },
        {
            puuid: "p6",
            championId: 122,
            teamId: 200,
            spell1Id: 4,
            spell2Id: 14,
            bot: true,
        },
    ],
};

const ANALYSIS = {
    result: { winrate: 0.5312 },
    breakdown: {
        allyChampions: {
            totalRating: -13.74,
            entries: [
                {
                    champions: [
                        {
                            key: "266",
                            id: "Aatrox",
                            name: "Aatrox",
                            icon: null,
                            role: 0,
                        },
                    ],
                    rating: -21.93,
                    winrateDelta: -0.0315,
                    wins: 846,
                    games: 1806,
                },
            ],
        },
        enemyChampions: {
            totalRating: 5.28,
            entries: [
                {
                    champions: [
                        {
                            key: "122",
                            id: "Darius",
                            name: "Darius",
                            icon: null,
                            role: 0,
                        },
                    ],
                    rating: 1.63,
                    winrateDelta: 0.0023,
                    wins: 10_909,
                    games: 21_716,
                },
            ],
        },
        allyDuos: { totalRating: 21.85, entries: [] },
        enemyDuos: { totalRating: 24.83, entries: [] },
        matchups: {
            totalRating: 19.85,
            entries: [
                {
                    champions: [
                        {
                            key: "266",
                            id: "Aatrox",
                            name: "Aatrox",
                            icon: null,
                            role: 0,
                        },
                        {
                            key: "122",
                            id: "Darius",
                            name: "Darius",
                            icon: null,
                            role: 0,
                        },
                    ],
                    rating: -1.1,
                    winrateDelta: -0.00158,
                    wins: 405.6,
                    games: 817,
                },
                {
                    // Cross-role pair: measured by the engine, but not a lane duel.
                    champions: [
                        {
                            key: "266",
                            id: "Aatrox",
                            name: "Aatrox",
                            icon: null,
                            role: 0,
                        },
                        { key: "60", id: "Elise", name: "Elise", icon: null, role: 1 },
                    ],
                    rating: -1.9,
                    winrateDelta: -0.0027,
                    wins: 270,
                    games: 549,
                },
            ],
        },
    },
} as unknown as AnalyzePayload;

const DRAFT = {
    ally: [
        [0, "266"],
        [1, "64"],
    ],
    opponent: [[0, "122"]],
    bans: { ally: [], opponent: [] },
} as unknown as Parameters<typeof liveTeams>[1];

describe("liveTeams", () => {
    it("puts the watched account's team on the ally side, whatever its colour", () => {
        const teams = liveTeams(GAME, DRAFT, "puuid-me", ANALYSIS);
        expect(teams.allyTeamId).toBe(100);
        expect(teams.ally.map((row) => row.championKey)).toEqual(["266", "64"]);
        expect(teams.opponent.map((row) => row.championKey)).toEqual(["122"]);
        expect(teams.ally[0]!.isTarget).toBe(true);
    });

    it("takes the positions from the inferred draft and keeps role order", () => {
        const teams = liveTeams(GAME, DRAFT, "puuid-me", ANALYSIS);
        expect(teams.ally.map((row) => row.role)).toEqual([0, 1]);
    });

    it("leaves the position null when the draft does not carry the champion", () => {
        const teams = liveTeams(
            GAME,
            { ...DRAFT, ally: [[0, "266"]] } as typeof DRAFT,
            "puuid-me",
            ANALYSIS,
        );
        expect(teams.ally.find((row) => row.championKey === "64")!.role).toBeNull();
    });

    it("keeps what Riot gives and does not invent the rest", () => {
        const teams = liveTeams(GAME, DRAFT, "puuid-me", ANALYSIS);
        expect(teams.ally[0]!.riotId).toBe("Moi#EUW");
        expect(teams.ally[1]!.riotId).toBeNull();
        expect(teams.ally[0]!.spellIds).toEqual([4, 12]);
        expect(teams.opponent[0]!.bot).toBe(true);
    });

    it("negates the enemy champion contribution so green always favours the watched team", () => {
        const teams = liveTeams(GAME, DRAFT, "puuid-me", ANALYSIS);
        expect(teams.ally[0]!.contribution).toEqual({
            winrateDelta: -0.0315,
            wins: 846,
            games: 1806,
        });
        expect(teams.opponent[0]!.contribution!.winrateDelta).toBeCloseTo(-0.0023, 6);
    });

    it("attaches the lane duel only, not every measured pair", () => {
        const teams = liveTeams(GAME, DRAFT, "puuid-me", ANALYSIS);
        const duel = teams.ally[0]!.matchup!;
        expect(duel.opponentKey).toBe("122");
        expect(duel.games).toBe(817);
        // The same fact, with the same sign, on the opposing row.
        expect(teams.opponent[0]!.matchup!.winrateDelta).toBe(duel.winrateDelta);
        expect(teams.ally[1]!.matchup).toBeNull();
    });

    it("survives an unknown puuid and an analysis that never arrived", () => {
        const teams = liveTeams(GAME, DRAFT, null, null);
        expect(teams.ally).toHaveLength(2);
        expect(teams.ally[0]!.isTarget).toBe(false);
        expect(teams.ally[0]!.contribution).toBeNull();
    });
});

describe("liveBans", () => {
    it("splits the bans by side, in pick order, dropping the empty ones", () => {
        expect(liveBans(GAME, 100)).toEqual({ ally: ["55"], opponent: ["84"] });
        expect(liveBans(GAME, 200)).toEqual({ ally: ["84"], opponent: ["55"] });
    });

    it("has nothing to say about a game without bans", () => {
        expect(liveBans(null, 100)).toEqual({ ally: [], opponent: [] });
    });
});

describe("elapsedSeconds", () => {
    const start = 1_787_754_000_000;

    it("counts from the game start when Riot gives one", () => {
        expect(elapsedSeconds(GAME, start, start + 700_000)).toBe(700);
    });

    it("keeps counting between two polls when there is no start time", () => {
        const loading = { gameStartTime: 0, gameLength: 30 };
        expect(elapsedSeconds(loading, start, start + 10_000)).toBe(40);
    });

    it("never goes negative and detects the loading screen", () => {
        expect(elapsedSeconds({ gameStartTime: 0, gameLength: -5 }, start, start)).toBe(
            0,
        );
        expect(isLoadingScreen({ gameStartTime: 0, gameLength: 0 })).toBe(true);
        expect(isLoadingScreen(GAME)).toBe(false);
    });
});

describe("queueLabel", () => {
    it("names the queues a DraftPredict user plays", () => {
        expect(queueLabel(420)).toBe("Classée solo/duo");
        expect(queueLabel(450)).toBe("ARAM");
    });

    it("falls back to the game mode rather than to a number", () => {
        expect(queueLabel(9999, "CHERRY")).toBe("CHERRY");
        expect(queueLabel(9999)).toBe("File 9999");
        expect(queueLabel(null)).toBe("Partie");
    });
});

// -------------------------------------------------------------- breakdown ---

describe("breakdownRows", () => {
    const rows = breakdownRows(ANALYSIS);

    it("expresses every group from the watched team's point of view", () => {
        expect(rows.map((row) => row.id)).toEqual([
            "ally-champions",
            "enemy-champions",
            "duos",
            "matchups",
        ]);
        // The enemy total is positive for them, so it must be negative for us.
        expect(rows[1]!.rating).toBeCloseTo(-5.28, 6);
        expect(rows[1]!.effect).toBeLessThan(0);
        // 21.85 ally duos against 24.83 enemy duos: a net loss.
        expect(rows[2]!.rating).toBeCloseTo(-2.98, 6);
    });

    it("carries the sample each group rests on", () => {
        expect(rows[0]!.entries).toBe(1);
        expect(rows[0]!.minGames).toBe(1806);
        expect(rows[2]!.minGames).toBe(0);
    });

    it("has nothing to show without an analysis", () => {
        expect(breakdownRows(null)).toEqual([]);
    });
});

describe("smallestSample", () => {
    it("finds the smallest measured sample of the whole analysis", () => {
        const sample = smallestSample(ANALYSIS);
        expect(sample).not.toBeNull();
        expect(sample!.games).toBe(549);
        expect(sample!.label).toBe("Aatrox vs Elise");
    });

    it("returns null instead of pretending, when nothing was measured", () => {
        expect(smallestSample(null)).toBeNull();
    });
});

// ---------------------------------------------------------------- polling ---

describe("pollIntervalMs", () => {
    it("starts fast and doubles while nothing happens", () => {
        expect(pollIntervalMs(0)).toBe(POLL_BASE_MS);
        expect(pollIntervalMs(1)).toBe(30_000);
        expect(pollIntervalMs(2)).toBe(60_000);
    });

    it("is bounded, whatever happens", () => {
        expect(pollIntervalMs(3)).toBe(POLL_MAX_MS);
        expect(pollIntervalMs(50)).toBe(POLL_MAX_MS);
        expect(pollIntervalMs(Number.NaN)).toBe(POLL_BASE_MS);
        expect(pollIntervalMs(-4)).toBe(POLL_BASE_MS);
    });

    it("reads as a duration a human understands", () => {
        expect(intervalLabel(15_000)).toContain("15");
        expect(intervalLabel(120_000)).toContain("min");
    });
});

describe("pollingSentence", () => {
    it("says why nothing is being watched", () => {
        expect(
            pollingSentence({ active: false, paused: false, intervalMs: 15_000 }),
        ).toContain("Aucune surveillance");
    });

    it("says the pause is deliberate", () => {
        expect(
            pollingSentence({ active: true, paused: true, intervalMs: 15_000 }),
        ).toContain("arrière-plan");
    });

    it("gives the actual interval when it is running", () => {
        expect(
            pollingSentence({ active: true, paused: false, intervalMs: 30_000 }),
        ).toContain("30");
    });
});

describe("parseRiotId", () => {
    it("accepts a real Riot ID and keeps the halves apart", () => {
        expect(parseRiotId("  Moi#EUW  ")).toEqual({ gameName: "Moi", tagLine: "EUW" });
        expect(parseRiotId("Nom#avec#TAG")).toEqual({
            gameName: "Nom#avec",
            tagLine: "TAG",
        });
    });

    it("rejects everything else", () => {
        expect(parseRiotId("Moi")).toBeNull();
        expect(parseRiotId("#EUW")).toBeNull();
        expect(parseRiotId("Moi#")).toBeNull();
        expect(parseRiotId(null)).toBeNull();
    });
});
