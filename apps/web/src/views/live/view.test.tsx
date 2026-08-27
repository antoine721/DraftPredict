import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { CurrentGameInfo } from "@draftpredict/riot";
import { LiveSocketProvider } from "../../api/live";
import { createQueryClient } from "../../api/queries";
import { queryKeys } from "../../api/keys";
import type {
    AnalyzePayload,
    ConfigResponse,
    LcuChampSelectResponse,
    LcuStatus,
    LiveGameResponse,
    StaticSummary,
} from "../../api/types";
import { ROUTES } from "../../app/routes";
import { formatCount } from "../../lib/format";
import { queryKeys, type AccountMeResponse } from "../../api";
import LiveView from "./LiveView";

/**
 * The whole view, mounted against the payloads a running `apps/server`
 * answers with.
 *
 * The states asserted below are the ones a real user hits, in the order they
 * hit them: nothing answered yet, no API key, a client that is connected but
 * idle, champion select, and a game in progress. None of them may render a
 * spinner with no explanation, and none of them may need Data Dragon.
 */

const SUMMARY: StaticSummary = {
    version: "16.17.1",
    language: "en_US",
    source: "bundled",
    counts: { champions: 3, items: 0, runes: 0, summonerSpells: 0 },
    champions: [
        {
            key: "266",
            id: "Aatrox",
            name: "Aatrox",
            title: "the Darkin Blade",
            tags: ["Fighter"],
            icon: "",
        },
        {
            key: "122",
            id: "Darius",
            name: "Darius",
            title: "the Hand of Noxus",
            tags: ["Fighter"],
            icon: "",
        },
        {
            key: "64",
            id: "LeeSin",
            name: "Lee Sin",
            title: "the Blind Monk",
            tags: ["Fighter"],
            icon: "",
        },
    ],
};

function config(hasRiotApiKey: boolean): ConfigResponse {
    return {
        config: {
            platform: "euw1",
            rank: "PLATINUM_PLUS",
            region: "ALL",
            riskLevel: "medium",
            minGames: 1000,
            ignoreChampionWinrates: false,
            lcuEnabled: true,
            allowRemoteDataset: true,
            datasetLocalRoot: null,
            language: "en_US",
            theme: "dark",
            hasRiotApiKey,
            riotApiKeyPreview: hasRiotApiKey ? "RGAPI-****4444" : null,
            riotApiKeySource: hasRiotApiKey ? "file" : null,
            configPath: "/home/moi/.draftpredict/config.json",
        },
        dataset: { providers: [], last: null },
        staticData: { version: "16.17.1", source: "bundled", language: "en_US" },
    } as unknown as ConfigResponse;
}

function status(overrides: Partial<LcuStatus> = {}): LcuStatus {
    return {
        enabled: true,
        running: true,
        connected: true,
        polling: false,
        phase: "Lobby",
        inChampSelect: false,
        summoner: {
            puuid: "puuid-me",
            gameName: "Moi",
            tagLine: "EUW",
            displayName: "Moi",
            summonerLevel: 340,
            profileIconId: 5123,
        },
        lastError: null,
        updatedAt: 1_787_754_256_212,
        ...overrides,
    };
}

const ME: AccountMeResponse = {
    puuid: "puuid-me",
    gameName: "Moi",
    tagLine: "EUW",
    displayName: "Moi",
    summonerLevel: 340,
    profileIconId: 5123,
    platform: "euw1",
    source: "lcu",
};

const DATASET = {
    rank: "PLATINUM_PLUS",
    region: "ALL",
    provider: "bundled-fixture",
    date: "2026-08-26",
    offline: true,
    patch: {},
    full: {},
} as unknown as AnalyzePayload["dataset"];

const ANALYSIS = {
    dataset: DATASET,
    result: { winrate: 0.5312 },
    breakdown: {
        allyChampions: {
            totalRating: 12.5,
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
                    rating: 12.5,
                    winrateDelta: 0.018,
                    wins: 846,
                    games: 1806,
                },
            ],
        },
        enemyChampions: { totalRating: 0, entries: [] },
        allyDuos: { totalRating: 0, entries: [] },
        enemyDuos: { totalRating: 0, entries: [] },
        matchups: { totalRating: 0, entries: [] },
    },
} as unknown as AnalyzePayload;

const CHAMP_SELECT: LcuChampSelectResponse = {
    inChampSelect: true,
    status: status({ phase: "ChampSelect", inChampSelect: true }),
    state: {
        phase: "BAN_PICK",
        timerMs: 27_000,
        localPlayer: {
            cellId: 2,
            puuid: "puuid-me",
            assignedRole: 2,
            championKey: null,
            hoveredChampionKey: null,
            pickActionId: 7,
            banActionId: null,
        },
        ally: [[0, "266"]],
        opponent: [[0, "122"]],
        allyHovers: [[1, "64"]],
        opponentHovers: [],
        bans: { ally: ["122"], opponent: [] },
        pickOrder: [0, 5],
        currentActorCellId: 2,
        isLocalPlayerTurn: true,
        benchChampionKeys: [],
        isCustom: false,
        isSpectating: false,
        allyPlayers: [],
        opponentPlayers: [],
    },
    analysis: ANALYSIS,
    suggestions: null,
    // Fresh: the countdown is relative to the moment the frame was received.
    updatedAt: Date.now(),
} as unknown as LcuChampSelectResponse;

const GAME: CurrentGameInfo = {
    gameId: 7_412_345_678,
    gameType: "MATCHED_GAME",
    gameStartTime: Date.now() - 600_000,
    mapId: 11,
    gameLength: 600,
    platformId: "EUW1",
    gameMode: "CLASSIC",
    gameQueueConfigId: 420,
    bannedChampions: [],
    participants: [
        {
            puuid: "puuid-me",
            championId: 266,
            teamId: 100,
            spell1Id: 4,
            spell2Id: 12,
            riotId: "Moi#EUW",
        },
        { puuid: "p6", championId: 122, teamId: 200, spell1Id: 4, spell2Id: 14 },
    ],
};

const LIVE: LiveGameResponse = {
    puuid: "puuid-me",
    platform: "euw1",
    inGame: true,
    game: GAME,
    draft: {
        ally: [[0, "266"]],
        opponent: [[0, "122"]],
        bans: { ally: [], opponent: [] },
    } as unknown as LiveGameResponse["draft"],
    dataset: DATASET,
    analysis: ANALYSIS,
};

type Seed = {
    hasRiotApiKey?: boolean;
    status?: LcuStatus;
    champSelect?: LcuChampSelectResponse;
    me?: AccountMeResponse;
    live?: LiveGameResponse;
};

function render(seed: Seed = {}): string {
    const client: QueryClient = createQueryClient();
    client.setQueryData(queryKeys.static.summary, SUMMARY);
    if (seed.hasRiotApiKey !== undefined) {
        client.setQueryData(queryKeys.config, config(seed.hasRiotApiKey));
    }
    if (seed.status) client.setQueryData(queryKeys.lcu.status, seed.status);
    if (seed.champSelect) {
        client.setQueryData(queryKeys.lcu.champSelect, seed.champSelect);
    }
    if (seed.me) client.setQueryData(queryKeys.account.me, seed.me);
    if (seed.live) {
        client.setQueryData(
            queryKeys.account.live(seed.live.puuid, seed.live.platform),
            seed.live,
        );
    }

    return renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter initialEntries={[ROUTES.live.path]}>
                    <Routes>
                        <Route path={ROUTES.live.path} element={<LiveView />} />
                    </Routes>
                </MemoryRouter>
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

describe("LiveView — cold start", () => {
    const html = render();

    it("says what it does not know yet instead of spinning", () => {
        expect(html).toContain("État du client inconnu");
        expect(html).toContain("Aucun compte suivi");
        expect(html).toContain("Aucune partie en cours");
    });

    it("explains what will appear when a game starts", () => {
        expect(html).toContain("Dès la sélection des champions");
        expect(html).toContain("Une fois la partie lancée");
        expect(html).toContain("Vérifier maintenant");
    });

    it("offers the spectate flow and a way back to the draft board", () => {
        expect(html).toContain("Observer un joueur");
        expect(html).toContain('href="/draft"');
    });
});

describe("LiveView — no Riot API key", () => {
    const html = render({ hasRiotApiKey: false, status: status() });

    it("turns the 428 into a call to action, never an error", () => {
        expect(html).toContain("Connectez votre compte Riot");
        expect(html).toContain('href="/parametres"');
        expect(html).not.toContain("Une erreur est survenue");
    });

    it("still says the champion-select mirror needs no key", () => {
        expect(html).toContain("sans clé");
    });

    it("reports the connected client honestly", () => {
        expect(html).toContain("Client connecté");
        expect(html).toContain("Dans le salon");
    });
});

describe("LiveView — champion select", () => {
    const html = render({
        hasRiotApiKey: true,
        status: status({ phase: "ChampSelect", inChampSelect: true }),
        champSelect: CHAMP_SELECT,
        me: ME,
    });

    it("mirrors the client without duplicating the draft board", () => {
        expect(html).toContain("Sélection des champions");
        expect(html).toContain("Aatrox");
        expect(html).toContain("Darius");
        expect(html).toContain("0:27");
        expect(html).toContain("Ouvrir le tableau de draft");
    });

    it("shows the analysis the server pushed alongside it", () => {
        expect(html).toContain("Probabilité de victoire");
        expect(html).toContain("53,1");
    });

    it("does not present the offline fixture as live statistics", () => {
        // The label itself is the shell's job now — one badge, on every view
        // (see app/shell.test.tsx, "labels an offline dataset"). What this view
        // owes is never to assert the opposite.
        expect(html).not.toContain("statistiques réelles");
        expect(html).not.toContain("données live");
    });

    it("names the account it follows and where it came from", () => {
        expect(html).toContain("Moi#EUW");
        expect(html).toContain("client League");
    });
});

describe("LiveView — game in progress", () => {
    const html = render({
        hasRiotApiKey: true,
        status: status({ phase: "InProgress" }),
        me: ME,
        live: LIVE,
    });

    it("shows both teams and the elapsed time", () => {
        expect(html).toContain("Partie en cours");
        expect(html).toContain("Équipe suivie");
        expect(html).toContain("Équipe adverse");
        expect(html).toContain("Classée solo/duo");
        expect(html).toContain("Temps écoulé");
    });

    it("shows the prediction with its smallest sample", () => {
        expect(html).toContain("53,1");
        expect(html).toContain(formatCount(1806));
    });

    it("does not fall back to the idle screen while a game is running", () => {
        expect(html).not.toContain("Aucune partie en cours");
    });
});
