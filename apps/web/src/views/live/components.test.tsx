import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import type { CurrentGameInfo } from "@draftpredict/riot";
import type {
    AnalyzePayload,
    ChampionSummary,
    LcuStatus,
    LiveGameResponse,
    SerializedChampSelectState,
    SuggestionsPayload,
    SummonerSpellDetail,
} from "../../api/types";
import { BanStrip } from "./BanStrip";
import { ChampSelectMirror } from "./ChampSelectMirror";
import { ChampSelectSide } from "./ChampSelectSide";
import { ClientStatusCard } from "./ClientStatusCard";
import { IdlePanel } from "./IdlePanel";
import { LiveGamePanel } from "./LiveGamePanel";
import { LiveStatusBar } from "./LiveStatusBar";
import { LiveTeamPanel } from "./LiveTeamPanel";
import { PickAdvice } from "./PickAdvice";
import { SpectatePanel } from "./SpectatePanel";
import { WinProbability } from "./WinProbability";
import { champSelectRows, liveTeams } from "./helpers";

/**
 * The live components, rendered to HTML.
 *
 * There is no DOM here, so these are server renders — enough for the three
 * things that must never regress: every champion is readable **without a single
 * image** (each fixture has `icon: null`, exactly what a blocked Data Dragon
 * looks like), every number carries its sample, and every state says what it
 * is instead of showing a spinner.
 */

function render(node: ReactNode): string {
    return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

const CHAMPIONS: ChampionSummary[] = [
    {
        key: "266",
        id: "Aatrox",
        name: "Aatrox",
        title: "l'Épée des Darkin",
        tags: ["Fighter"],
        icon: null as unknown as string,
    },
    {
        key: "122",
        id: "Darius",
        name: "Darius",
        title: "la Main de Noxus",
        tags: ["Fighter"],
        icon: null as unknown as string,
    },
    {
        key: "64",
        id: "LeeSin",
        name: "Lee Sin",
        title: "le Moine aveugle",
        tags: ["Fighter"],
        icon: null as unknown as string,
    },
];

const BY_KEY = new Map(CHAMPIONS.map((champion) => [champion.key, champion]));

const SPELLS = new Map<number, SummonerSpellDetail>([
    [
        4,
        {
            key: 4,
            id: "SummonerFlash",
            name: "Saut éclair",
            description: "",
            cooldown: 300,
            summonerLevel: 7,
            modes: [],
            icon: "",
        },
    ],
]);

const STATUS: LcuStatus = {
    enabled: true,
    running: true,
    connected: true,
    polling: false,
    phase: "ChampSelect",
    inChampSelect: true,
    summoner: {
        puuid: "puuid-me",
        gameName: "Moi",
        tagLine: "EUW",
        displayName: "Moi",
        summonerLevel: 340,
        profileIconId: 5123,
    },
    lastError: null,
    updatedAt: Date.now(),
};

const STATE: SerializedChampSelectState = {
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
} as unknown as SerializedChampSelectState;

const ANALYSIS = {
    dataset: {
        rank: "PLATINUM_PLUS",
        region: "ALL",
        provider: "bundled-fixture",
        date: "2026-08-26",
        offline: true,
    },
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
                    rating: 5.28,
                    winrateDelta: 0.0076,
                    wins: 10_909,
                    games: 21_716,
                },
            ],
        },
        allyDuos: { totalRating: 0, entries: [] },
        enemyDuos: { totalRating: 0, entries: [] },
        matchups: {
            totalRating: -1.1,
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
            ],
        },
    },
} as unknown as AnalyzePayload;

const SUGGESTIONS = {
    baseline: { totalRating: 0, winrate: 0.5 },
    roles: [
        {
            role: 2,
            open: true,
            suggestions: [
                {
                    key: "64",
                    id: "LeeSin",
                    name: "Lee Sin",
                    icon: null,
                    role: 2,
                    rating: 12,
                    winrate: 0.5312,
                    winrateDelta: 0.0312,
                    games: 18_179,
                },
            ],
        },
    ],
    best: [],
} as unknown as SuggestionsPayload;

const GAME: CurrentGameInfo = {
    gameId: 7_412_345_678,
    gameType: "MATCHED_GAME",
    gameStartTime: 1_787_754_000_000,
    mapId: 11,
    gameLength: 640,
    platformId: "EUW1",
    gameMode: "CLASSIC",
    gameQueueConfigId: 420,
    bannedChampions: [{ championId: 64, teamId: 200, pickTurn: 1 }],
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
    dataset: ANALYSIS.dataset,
    analysis: ANALYSIS,
};

// ------------------------------------------------------------------ tests ---

describe("ChampSelectSide", () => {
    const rows = champSelectRows(STATE, "ally");

    it("shows the five positions with no image at all", () => {
        const html = render(
            <ChampSelectSide
                side="ally"
                title="Votre équipe"
                rows={rows}
                byKey={BY_KEY}
            />,
        );
        expect(html).toContain("Votre équipe");
        expect(html).toContain("Aatrox");
        // Initials carry the tile when Data Dragon is unreachable.
        expect(html).toContain(">AA<");
        expect(html).not.toContain("<img");
        expect(html).toContain("Toplane");
    });

    it("marks a hover as a hover and an empty slot as empty", () => {
        const html = render(
            <ChampSelectSide
                side="ally"
                title="Votre équipe"
                rows={rows}
                byKey={BY_KEY}
            />,
        );
        expect(html).toContain("Survol");
        expect(html).toContain("En attente");
    });
});

describe("BanStrip", () => {
    it("draws the used and the remaining ban slots", () => {
        const html = render(
            <BanStrip side="ally" label="Bans" championKeys={["122"]} byKey={BY_KEY} />,
        );
        expect(html).toContain("Darius");
        expect(html).toContain('aria-label="Ban non utilisé"');
    });

    it("says so when a side communicated no ban", () => {
        const html = render(
            <BanStrip
                side="opponent"
                label="Bans"
                championKeys={[]}
                byKey={BY_KEY}
                slots={0}
            />,
        );
        expect(html).toContain("Aucun ban communiqué");
    });
});

describe("WinProbability", () => {
    it("shows the probability, the 50 % reference and the smallest sample", () => {
        const html = render(<WinProbability analysis={ANALYSIS} />);
        expect(html).toContain("53,1");
        expect(html).toContain('role="meter"');
        expect(html).toContain("817");
        expect(html).toContain("Duels de voie");
    });

    it("does not pretend to know anything without an analysis", () => {
        const html = render(<WinProbability analysis={null} />);
        expect(html).toContain("Aucune analyse disponible");
    });
});

describe("PickAdvice", () => {
    it("ranks the open role and shows the sample behind each suggestion", () => {
        const html = render(<PickAdvice suggestions={SUGGESTIONS} role={2} />);
        expect(html).toContain("Lee Sin");
        expect(html).toContain("Midlane");
        expect(html).toContain("+3,1");
        expect(html).toContain("18");
    });

    it("renders nothing rather than an empty box", () => {
        expect(render(<PickAdvice suggestions={null} role={2} />)).toBe("");
    });
});

describe("ChampSelectMirror", () => {
    const html = render(
        <ChampSelectMirror
            state={STATE}
            analysis={ANALYSIS}
            suggestions={SUGGESTIONS}
            remainingMs={27_000}
            byKey={BY_KEY}
            fromSocket
        />,
    );

    it("mirrors both teams, the bans, the timer and the turn", () => {
        expect(html).toContain("Votre équipe");
        expect(html).toContain("Équipe adverse");
        expect(html).toContain("0:27");
        expect(html).toContain("À vous de jouer");
        expect(html).toContain("Flux temps réel");
    });

    it("hands the full board over to the draft view instead of duplicating it", () => {
        expect(html).toContain("Ouvrir le tableau de draft");
        expect(html).toContain('href="/draft"');
    });
});

describe("LiveTeamPanel and LivePlayerRow", () => {
    const teams = liveTeams(GAME, LIVE.draft, "puuid-me", ANALYSIS);

    it("names the champions, their position and their summoner spells", () => {
        const html = render(
            <LiveTeamPanel
                side="ally"
                title="Équipe suivie"
                sideLabel="bleu"
                rows={teams.ally}
                bans={["64"]}
                byKey={BY_KEY}
                spellsById={SPELLS}
            />,
        );
        expect(html).toContain("Aatrox");
        expect(html).toContain("Moi#EUW");
        expect(html).toContain("Toplane");
        expect(html).toContain("Saut éclair");
        expect(html).toContain("Ce compte");
    });

    it("says a Riot ID is missing rather than inventing one", () => {
        const html = render(
            <LiveTeamPanel
                side="opponent"
                title="Équipe adverse"
                sideLabel="rouge"
                rows={teams.opponent}
                bans={[]}
                byKey={BY_KEY}
                spellsById={SPELLS}
            />,
        );
        expect(html).toContain("Riot ID non communiqué");
        expect(html).toContain("Darius");
    });
});

describe("LiveGamePanel", () => {
    const html = render(
        <LiveGamePanel
            payload={LIVE}
            fetchedAt={1_787_754_640_000}
            now={1_787_754_640_000}
            byKey={BY_KEY}
            spellsById={SPELLS}
            label="Moi#EUW"
            ranks={{
                solo: {
                    queueType: "RANKED_SOLO_5x5",
                    tier: "EMERALD",
                    rank: "II",
                    leaguePoints: 46,
                    wins: 132,
                    losses: 118,
                },
            }}
            isFetching={false}
            onRefresh={() => {}}
        />,
    );

    it("shows the queue, the elapsed time, the side and the rank", () => {
        expect(html).toContain("Classée solo/duo");
        expect(html).toContain("10:40");
        expect(html).toContain("Émeraude II");
        expect(html).toContain("Bleu");
    });

    it("says the prediction only knows the draft", () => {
        expect(html).toContain("53,1");
        expect(html).toContain("ni de l&#x27;or");
    });

    it("is explicit about what the per-player numbers are", () => {
        expect(html).toContain("pas ceux de la personne qui le joue");
    });
});

describe("ClientStatusCard", () => {
    it("reports every flag rather than a single green dot", () => {
        const html = render(<ClientStatusCard status={STATUS} />);
        expect(html).toContain("Sélection des champions en cours");
        expect(html).toContain("Intégration");
        expect(html).toContain("Moi#EUW");
    });

    it("explains a disabled integration and links to the settings", () => {
        const html = render(
            <ClientStatusCard
                status={{ ...STATUS, enabled: false, connected: false }}
            />,
        );
        expect(html).toContain("Intégration au client désactivée");
        expect(html).toContain('href="/parametres"');
    });

    it("surfaces the client's last error", () => {
        const html = render(
            <ClientStatusCard status={{ ...STATUS, lastError: "ECONNREFUSED" }} />,
        );
        expect(html).toContain("ECONNREFUSED");
    });
});

describe("IdlePanel", () => {
    const html = render(
        <IdlePanel
            status={{
                ...STATUS,
                connected: false,
                inChampSelect: false,
                phase: "None",
            }}
            polling={{ active: true, paused: false, intervalMs: 30_000 }}
            watching="Moi#EUW"
            isFetching={false}
            onRefresh={() => {}}
        />,
    );

    it("explains what will happen instead of showing a spinner", () => {
        expect(html).toContain("Aucune partie en cours");
        expect(html).toContain("Dès la sélection des champions");
        expect(html).toContain("Une fois la partie lancée");
    });

    it("is honest about the client and about the polling", () => {
        expect(html).toContain("Client League non détecté");
        expect(html).toContain("Vérification automatique toutes les 30");
        expect(html).toContain("Vérifier maintenant");
    });

    it("says the pause is deliberate when the tab is hidden", () => {
        const paused = render(
            <IdlePanel
                status={STATUS}
                polling={{ active: true, paused: true, intervalMs: 15_000 }}
                watching={null}
                isFetching={false}
                onRefresh={() => {}}
            />,
        );
        expect(paused).toContain("En pause");
        expect(paused).toContain("arrière-plan");
    });
});

describe("LiveStatusBar", () => {
    it("always answers 'is it working right now'", () => {
        const html = render(
            <LiveStatusBar
                status={STATUS}
                target={{
                    puuid: "puuid-me",
                    label: "Moi#EUW",
                    source: "lcu",
                    platform: "euw1",
                }}
                polling={{ active: true, paused: false, intervalMs: 15_000 }}
                isFetching={false}
                onRefresh={() => {}}
                mirroring
            />,
        );
        expect(html).toContain("Sélection des champions en cours");
        expect(html).toContain("Moi#EUW");
        expect(html).toContain("client League");
    });

    it("says plainly when nothing is being watched", () => {
        const html = render(
            <LiveStatusBar
                status={null}
                target={null}
                polling={{ active: false, paused: false, intervalMs: 15_000 }}
                isFetching={false}
                onRefresh={() => {}}
                mirroring={false}
            />,
        );
        expect(html).toContain("Aucun compte suivi");
        expect(html).toContain("État du client inconnu");
    });
});

describe("SpectatePanel", () => {
    const empty = {
        lookup: { data: null, error: null, isLoading: false },
        live: { data: null, error: null, isLoading: false, updatedAt: null },
    };

    it("turns the 428 into an onboarding card, never an error", () => {
        const html = render(
            <SpectatePanel
                value=""
                onValueChange={() => {}}
                onSubmit={() => {}}
                onClear={() => {}}
                query={null}
                {...empty}
                hasRiotApiKey={false}
                platform="euw1"
            />,
        );
        expect(html).toContain("Connectez votre compte Riot");
        expect(html).toContain("Ajouter ma clé d&#x27;API Riot");
        expect(html).not.toContain("Une erreur est survenue");
    });

    it("offers a labelled Riot ID field once a key is configured", () => {
        const html = render(
            <SpectatePanel
                value=""
                onValueChange={() => {}}
                onSubmit={() => {}}
                onClear={() => {}}
                query={null}
                {...empty}
                hasRiotApiKey
                platform="euw1"
            />,
        );
        expect(html).toContain('aria-label="Riot ID du joueur à observer"');
        expect(html).toContain("Nom#TAG");
        expect(html).toContain("EUW1");
    });

    it("rejects a malformed Riot ID before sending anything", () => {
        const html = render(
            <SpectatePanel
                value="Moi"
                onValueChange={() => {}}
                onSubmit={() => {}}
                onClear={() => {}}
                query={null}
                {...empty}
                hasRiotApiKey
                platform="euw1"
            />,
        );
        expect(html).toContain("Format attendu");
        expect(html).toContain("disabled");
    });

    it("tells an unknown account apart from an account that is simply not playing", () => {
        const notFound = render(
            <SpectatePanel
                value="Inconnu#EUW"
                onValueChange={() => {}}
                onSubmit={() => {}}
                onClear={() => {}}
                query="Inconnu#EUW"
                lookup={{
                    data: null,
                    error: {
                        isNotFound: true,
                        isNetwork: false,
                        code: "NOT_FOUND",
                    } as never,
                    isLoading: false,
                }}
                live={empty.live}
                hasRiotApiKey
                platform="euw1"
            />,
        );
        expect(notFound).toContain("Aucun compte ne s&#x27;appelle Inconnu#EUW");

        const idle = render(
            <SpectatePanel
                value="Moi#EUW"
                onValueChange={() => {}}
                onSubmit={() => {}}
                onClear={() => {}}
                query="Moi#EUW"
                lookup={{
                    data: {
                        puuid: "puuid-me",
                        gameName: "Moi",
                        tagLine: "EUW",
                        platform: "euw1",
                    },
                    error: null,
                    isLoading: false,
                }}
                live={{
                    data: { ...LIVE, inGame: false, game: null, analysis: null },
                    error: null,
                    isLoading: false,
                    updatedAt: Date.now(),
                }}
                hasRiotApiKey
                platform="euw1"
            />,
        );
        expect(idle).toContain("Moi#EUW n&#x27;est pas en partie");
    });
});
