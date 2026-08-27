import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Dataset, Role } from "@draftpredict/core";
import { createQueryClient, queryKeys } from "../../api";
import type {
    BuildEntry,
    BuildsPayload,
    ConfigResponse,
    DatasetResponse,
    StaticRunesResponse,
    StaticSummary,
} from "../../api";
import { formatCount, formatPercent } from "../../lib";
import { ROUTES } from "../../app/routes";
import ChampionsView from "./ChampionsView";

/**
 * The champion screen, rendered against the payloads the real server answers
 * with (shapes captured from a running `apps/server` on the offline fixture).
 *
 * Two properties are asserted everywhere, because they are the ones that
 * actually break: nothing needs Data Dragon to be readable, and no number is
 * ever printed without the sample it rests on.
 */

const AATROX = "266";
const DARIUS = "122";
const TOP: Role = 0;

const SUMMARY: StaticSummary = {
    version: "16.17.1",
    language: "en_US",
    source: "bundled",
    counts: { champions: 3, items: 248, runes: 62, summonerSpells: 9 },
    champions: [
        {
            key: AATROX,
            id: "Aatrox",
            name: "Aatrox",
            title: "the Darkin Blade",
            tags: ["Fighter"],
            icon: "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Aatrox.png",
        },
        {
            key: DARIUS,
            id: "Darius",
            name: "Darius",
            title: "the Hand of Noxus",
            tags: ["Fighter", "Tank"],
            icon: "https://ddragon.leagueoflegends.com/cdn/16.17.1/img/champion/Darius.png",
        },
        {
            key: "412",
            id: "Thresh",
            name: "Thresh",
            title: "the Chain Warden",
            tags: ["Support"],
            // No icon at all: the offline case the whole design system is built for.
            icon: "",
        },
    ],
};

function roleData(
    games: number,
    wins: number,
    extra: Partial<{
        matchup: Record<string, { championKey: string; wins: number; games: number }>;
    }> = {},
) {
    const empty = { 0: {}, 1: {}, 2: {}, 3: {}, 4: {} };
    return {
        games,
        wins,
        matchup: { ...empty, 0: extra.matchup ?? {} },
        synergy: empty,
        damageProfile: { magic: 0.2, physical: 0.68, true: 0.12 },
        statsByTime: [
            { games: 144, wins: 69 },
            { games: 343, wins: 163 },
            { games: 415, wins: 210 },
            { games: 343, wins: 161 },
            { games: 235, wins: 109 },
            { games: 126, wins: 58 },
            { games: 54, wins: 25 },
        ],
    };
}

function champion(
    key: string,
    id: string,
    name: string,
    top: ReturnType<typeof roleData>,
) {
    const blank = roleData(0, 0);
    return {
        id,
        key,
        name,
        i18n: {},
        statsByRole: { 0: top, 1: blank, 2: blank, 3: blank, 4: blank },
    };
}

function dataset(): Dataset {
    return {
        version: "5",
        date: "2026-08-26",
        championData: {
            [AATROX]: champion(AATROX, "Aatrox", "Aatrox", {
                ...roleData(1806, 950, {
                    matchup: {
                        [DARIUS]: { championKey: DARIUS, wins: 340, games: 700 },
                    },
                }),
            }),
            [DARIUS]: champion(DARIUS, "Darius", "Darius", {
                ...roleData(21_716, 10_500, {
                    matchup: {
                        [AATROX]: { championKey: AATROX, wins: 360, games: 700 },
                    },
                }),
            }),
            "412": champion("412", "Thresh", "Thresh", roleData(140, 60)),
        },
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    } as unknown as Dataset;
}

const DATASET_META = {
    rank: "PLATINUM_PLUS",
    region: "ALL",
    window: "patch",
    patch: null,
    provider: "bundled-fixture",
    source: "provider",
    version: "5",
    date: "2026-08-26",
    championCount: 3,
    loadedAt: 0,
    offline: true,
} as DatasetResponse["meta"];

function entry(
    id: number | string,
    rating: number,
    games: number,
    name: string | null,
    extra: Partial<BuildEntry> = {},
): BuildEntry {
    return {
        id,
        name,
        icon: null,
        rating,
        winrate: 0.5 + rating / 2000,
        winrateDelta: rating / 4000,
        wins: games / 2,
        games,
        matchups: [],
        ...extra,
    };
}

const BUILDS: BuildsPayload = {
    dataset: {
        rank: "PLATINUM_PLUS",
        region: "ALL",
        provider: "bundled-fixture",
        date: "2026-08-26",
        offline: true,
        patch: DATASET_META,
        full: DATASET_META,
    },
    champion: { key: AATROX, id: "Aatrox", name: "Aatrox", icon: null },
    role: TOP,
    config: { riskLevel: "medium", minGames: 1000, ignoreChampionWinrates: false },
    source: {
        provider: "bundled-fixture",
        description: "Deterministic offline build sample",
        offline: true,
        games: 24_000,
        wins: 11_595,
    },
    matchups: [],
    items: {
        boots: [
            entry(3009, 12, 3136, "Boots of Swiftness"),
            entry(3006, -21, 1784, "Berserker's Greaves"),
        ],
        startingSets: [
            entry("1086_2003", 2, 7694, "Doran's Bow + Health Potion", {
                components: [
                    { id: 1086, name: "Doran's Bow", icon: null },
                    { id: 2003, name: "Health Potion", icon: null },
                ],
            }),
        ],
        // Legitimately empty in the offline fixture.
        sets: [],
        byOrder: [
            [
                entry(3075, 6, 1422, "Thornmail"),
                entry(3139, 3, 5039, "Mercurial Scimitar"),
            ],
            [entry(3003, 5, 7664, "Archangel's Staff")],
            [entry(3146, 2, 5911, "Hextech Gunblade")],
        ],
    },
    runes: {
        primary: [
            entry(8439, 21, 2221, "Aftershock"),
            entry(8437, 4, 2100, "Grasp of the Undying"),
            entry(8446, 9, 1900, "Demolish"),
            entry(8463, 2, 1500, "Font of Life"),
        ],
        secondary: [
            entry(8224, 7, 1200, "Nullifying Orb"),
            entry(8234, 3, 1100, "Celerity"),
        ],
        shards: {
            offense: [
                entry(5008, 8, 7496, "Adaptive Force"),
                entry(5007, -13, 4023, "Ability Haste"),
            ],
            flex: [entry(5008, 5, 6000, "Adaptive Force")],
            defense: [entry(5001, 4, 5000, "Health Scaling")],
        },
    },
    summonerSpells: [
        entry("14_4", 15, 9126, "Ignite + Flash", {
            components: [
                { id: 14, name: "Ignite", icon: null },
                { id: 4, name: "Flash", icon: null },
            ],
        }),
        entry("12_4", 3, 3444, "Teleport + Flash", {
            components: [
                { id: 12, name: "Teleport", icon: null },
                { id: 4, name: "Flash", icon: null },
            ],
        }),
    ],
    skills: {
        // The fixture really does answer `icon: null` here.
        order: [entry("EQW", 16, 6709, "EQW"), entry("WEQ", 13, 1390, "WEQ")],
        levels: [
            [entry("W", 17, 9599, "W"), entry("Q", -2, 9060, "Q")],
            [entry("E", 9, 4153, "E"), entry("Q", 1, 3000, "Q")],
        ],
    },
};

const RUNES: StaticRunesResponse = {
    version: "16.17.1",
    paths: [
        {
            id: 8400,
            key: "Resolve",
            name: "Resolve",
            icon: "",
            slots: [
                [
                    {
                        id: 8437,
                        key: "Grasp",
                        name: "Grasp of the Undying",
                        shortDesc: "",
                        longDesc: "",
                        slot: 0,
                        index: 0,
                        icon: "",
                    },
                    {
                        id: 8439,
                        key: "Aftershock",
                        name: "Aftershock",
                        shortDesc: "",
                        longDesc: "",
                        slot: 0,
                        index: 1,
                        icon: "",
                    },
                ],
                [
                    {
                        id: 8446,
                        key: "Demolish",
                        name: "Demolish",
                        shortDesc: "",
                        longDesc: "",
                        slot: 1,
                        index: 0,
                        icon: "",
                    },
                    {
                        id: 8463,
                        key: "FontOfLife",
                        name: "Font of Life",
                        shortDesc: "",
                        longDesc: "",
                        slot: 1,
                        index: 1,
                        icon: "",
                    },
                ],
            ],
        },
        {
            id: 8200,
            key: "Sorcery",
            name: "Sorcery",
            icon: "",
            slots: [
                [
                    {
                        id: 8214,
                        key: "Aery",
                        name: "Summon Aery",
                        shortDesc: "",
                        longDesc: "",
                        slot: 0,
                        index: 0,
                        icon: "",
                    },
                ],
                [
                    {
                        id: 8224,
                        key: "NullifyingOrb",
                        name: "Nullifying Orb",
                        shortDesc: "",
                        longDesc: "",
                        slot: 1,
                        index: 0,
                        icon: "",
                    },
                ],
                [
                    {
                        id: 8234,
                        key: "Celerity",
                        name: "Celerity",
                        shortDesc: "",
                        longDesc: "",
                        slot: 2,
                        index: 0,
                        icon: "",
                    },
                ],
            ],
        },
    ],
    shardRows: [],
};

const CONFIG = {
    config: {
        platform: "euw1",
        rank: "PLATINUM_PLUS",
        region: "ALL",
        riskLevel: "medium",
        minGames: 1000,
        ignoreChampionWinrates: false,
        hasRiotApiKey: false,
    },
} as unknown as ConfigResponse;

function seed(
    client: QueryClient,
    options: { fullWindow?: boolean } = {},
): QueryClient {
    client.setQueryData(queryKeys.config, CONFIG);
    client.setQueryData(queryKeys.static.summary, SUMMARY);
    client.setQueryData(queryKeys.static.runes, RUNES);
    client.setQueryData(queryKeys.static.items, { version: "16.17.1", items: [] });
    client.setQueryData(queryKeys.static.champions, {
        version: "16.17.1",
        language: "en_US",
        source: "bundled",
        champions: [],
    });
    client.setQueryData(queryKeys.dataset.query({ include: "full" }), {
        meta: DATASET_META,
        providers: [],
        dataset: dataset(),
    } satisfies DatasetResponse);
    if (options.fullWindow) {
        client.setQueryData(
            queryKeys.dataset.query({ include: "full", window: "full" }),
            {
                meta: { ...DATASET_META, window: "full" },
                providers: [],
                dataset: dataset(),
            } satisfies DatasetResponse,
        );
    }
    client.setQueryData(
        queryKeys.builds.one(AATROX, { role: TOP, vs: undefined }),
        BUILDS,
    );
    client.setQueryData(
        queryKeys.builds.one(AATROX, { role: TOP, vs: `${DARIUS}:${TOP}` }),
        BUILDS,
    );
    return client;
}

function render(path: string, options: { fullWindow?: boolean } = {}): string {
    const client = seed(createQueryClient(), options);
    return renderToStaticMarkup(
        <QueryClientProvider client={client}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path={ROUTES.champions.path} element={<ChampionsView />} />
                    <Route
                        path={`${ROUTES.champions.path}/:championKey`}
                        element={<ChampionsView />}
                    />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe("champion index", () => {
    it("lists every champion with its role statistics", () => {
        const html = render(ROUTES.champions.path);
        expect(html).toContain("Aatrox");
        expect(html).toContain("Darius");
        expect(html).toContain("Thresh");
        // 950 / 1806 of Aatrox's top games.
        expect(html).toContain(formatPercent(950 / 1806));
    });

    it("does not present the offline fixture as live statistics", () => {
        // The label itself is the shell's job now — one badge, on every view
        // (see app/shell.test.tsx, "labels an offline dataset"). What this view
        // owes is never to assert the opposite.
        const html = render(ROUTES.champions.path);
        expect(html).not.toContain("statistiques réelles");
        expect(html).not.toContain("données live");
    });

    it("never invents a ban rate the dataset does not carry", () => {
        const html = render(`${ROUTES.champions.path}/${AATROX}?role=0`);
        expect(html).toContain("Bans");
        expect(html).toContain("n/d");
        expect(html).toContain("ne contient aucun compteur de bans");
    });

    it("renders champion tiles without a single image request", () => {
        const html = render(ROUTES.champions.path);
        // Thresh has no icon at all: initials must carry the tile.
        expect(html).toContain(">TH<");
    });
});

describe("champion detail", () => {
    const path = `${ROUTES.champions.path}/${AATROX}?role=0`;

    it("shows the champion identity and its role sample", () => {
        const html = render(path);
        expect(html).toContain("Aatrox");
        expect(html).toContain("the Darkin Blade");
        expect(html).toContain("Combattant");
        expect(html).toContain("Toplane");
        expect(html).toContain(formatCount(1806));
    });

    it("accepts the Data Dragon id as well as the numeric key", () => {
        expect(render(`${ROUTES.champions.path}/Aatrox`)).toContain("the Darkin Blade");
    });

    it("explains that the complete build had to be assembled", () => {
        const html = render(path);
        expect(html).toContain("Build complet");
        expect(html).toContain("Assemblé à partir du meilleur objet de chaque étape");
        expect(html).toContain("Thornmail");
        expect(html).toContain("Boots of Swiftness");
    });

    it("lays the runes out as a tree and marks the recommended ones", () => {
        const html = render(path);
        expect(html).toContain("Rune clé");
        expect(html).toContain("Aftershock");
        expect(html).toContain("Recommandé");
        expect(html).toContain("Voie secondaire");
    });

    it("renders skills as letter tiles, because the fixture has no icons", () => {
        const html = render(path);
        expect(html).toContain("Ordre de compétences");
        expect(html).toContain("Premiers niveaux");
        expect(html).toContain(">Q<");
        expect(html).toContain(">R<");
    });

    it("ranks summoner spell pairs", () => {
        const html = render(path);
        expect(html).toContain("Ignite + Flash");
        expect(html).toContain("Teleport + Flash");
    });

    it("keeps every sample size on screen", () => {
        const html = render(path);
        expect(html).toContain("Parties");
        expect(html).toContain(formatCount(9126));
    });

    it("offers a matchup-adjusted build and says when there is no data for it", () => {
        const html = render(`${ROUTES.champions.path}/${AATROX}?role=0&vs=${DARIUS}`);
        expect(html).toContain("Build adapté au duel");
        // The seeded payload carries no matchup rows, so the view must say so.
        expect(html).toContain("ne contient pas assez de parties");
    });

    it("renders the matchup tab from the 30-day window", () => {
        const html = render(`${ROUTES.champions.path}/${AATROX}?role=0&tab=matchups`, {
            fullWindow: true,
        });
        expect(html).toContain("Duels");
        expect(html).toContain("Darius");
        expect(html).toContain("Meilleures synergies");
    });

    it("asks for the heavy window only when the matchup tab is open", () => {
        const html = render(`${ROUTES.champions.path}/${AATROX}?role=0&tab=matchups`);
        expect(html).toContain("matrice complète des duels");
    });

    it("shows the tier estimate with the recipe attached", () => {
        const html = render(`${ROUTES.champions.path}/${AATROX}?role=0&tab=stats`);
        expect(html).toContain("Place dans la méta");
        expect(html).toContain("écarts-types");
        expect(html).toContain("Winrate par durée de partie");
    });

    it("compares two champions on the same role", () => {
        const html = render(
            `${ROUTES.champions.path}/${AATROX}?role=0&compare=${DARIUS}`,
        );
        expect(html).toContain("Comparaison");
        expect(html).toContain("Aatrox");
        expect(html).toContain("Darius");
        expect(html).toContain("Sélection dans le rôle");
    });

    it("explains an unknown champion instead of crashing", () => {
        const html = render(`${ROUTES.champions.path}/999999`);
        expect(html).toContain("Champion introuvable");
    });
});
