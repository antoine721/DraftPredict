import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
    BansPayload,
    ChampionSummary,
    DraftBreakdown,
    LcuStatus,
    SerializedChampSelectState,
    SuggestionsPayload,
} from "../../api/types";
import { BanRow } from "./BanRow";
import { BanSuggestionList } from "./BanSuggestionList";
import { ChampionPicker } from "./ChampionPicker";
import { ContributionBreakdown } from "./ContributionBreakdown";
import { DamageDistribution } from "./DamageDistribution";
import { LiveBadge } from "./LiveBadge";
import { MetaTierList } from "./MetaTierList";
import { RoleSlot } from "./RoleSlot";
import { SuggestionList } from "./SuggestionList";
import { WhyPanel } from "./WhyPanel";
import { WinProbabilityGauge } from "./WinProbabilityGauge";

/**
 * The draft components, rendered to HTML.
 *
 * There is no DOM in this environment, so these are server renders — enough to
 * assert the three things that must never regress: the numbers are French and
 * readable, every control is announced, and **nothing depends on Data Dragon**
 * (every champion below has `icon: null`, exactly as a blocked CDN looks).
 */

const AATROX: ChampionSummary = {
    key: "266",
    id: "Aatrox",
    name: "Aatrox",
    title: "l'Épée des Darkin",
    tags: ["Fighter"],
    icon: null as unknown as string,
};

const noop = () => {};

describe("RoleSlot", () => {
    it("invites a pick when it is empty", () => {
        const html = renderToStaticMarkup(
            <RoleSlot
                team="ally"
                role={0}
                champion={null}
                championKey={null}
                sample={null}
                selected={false}
                ghost={null}
                onSelect={noop}
                onClear={noop}
                onSwapRole={noop}
            />,
        );
        expect(html).toContain("Choisir un champion");
        expect(html).toContain('aria-label="Choisir un champion en Toplane"');
        expect(html).toContain("Emplacement libre");
    });

    it("shows the champion, its winrate and its sample without any image", () => {
        const html = renderToStaticMarkup(
            <RoleSlot
                team="ally"
                role={0}
                champion={AATROX}
                championKey="266"
                sample={{ winrate: 0.4684, games: 1806 }}
                selected
                ghost={null}
                onSelect={noop}
                onClear={noop}
                onSwapRole={noop}
            />,
        );
        expect(html).toContain("Aatrox");
        expect(html).toContain("46,8");
        expect(html).toContain("1,8");
        expect(html).toContain(">AA<");
        expect(html).not.toContain("<img");
        expect(html).toContain('aria-pressed="true"');
        expect(html).toContain("Retirer Aatrox");
    });

    it("marks a League Client hover as not committed", () => {
        const html = renderToStaticMarkup(
            <RoleSlot
                team="opponent"
                role={4}
                champion={AATROX}
                championKey="266"
                sample={null}
                selected={false}
                ghost="hover"
                onSelect={noop}
                onClear={noop}
                onSwapRole={noop}
            />,
        );
        expect(html).toContain("Survol client");
    });
});

describe("BanRow", () => {
    it("renders five slots and names each action", () => {
        const html = renderToStaticMarkup(
            <BanRow
                team="ally"
                bans={["266"]}
                byKey={new Map([["266", AATROX]])}
                onAdd={noop}
                onRemove={noop}
            />,
        );
        expect(html.match(/<button/g)).toHaveLength(5);
        expect(html).toContain("Retirer le ban Aatrox");
        expect(html).toContain("Ajouter un ban pour votre équipe");
    });
});

describe("WinProbabilityGauge", () => {
    it("announces the probability as a meter and prints it in French", () => {
        const html = renderToStaticMarkup(
            <WinProbabilityGauge
                winrate={0.4511}
                totalRating={-34.07}
                sample={{ games: 817, label: "Aatrox (Top) vs Darius (Top)" }}
            />,
        );
        expect(html).toContain('role="meter"');
        expect(html).toContain('aria-valuenow="45.1"');
        expect(html).toContain("45,1");
        expect(html).toContain("-34,1 pts");
        expect(html).toContain("échantillon min. 817");
    });

    it("shows what a previewed champion would change", () => {
        const html = renderToStaticMarkup(
            <WinProbabilityGauge
                winrate={0.46}
                preview={{ winrate: 0.512, label: "Samira" }}
                totalRating={-10}
            />,
        );
        expect(html).toContain("Samira");
        expect(html).toContain("51,2");
        expect(html).toContain("+5,2");
    });
});

const BREAKDOWN: DraftBreakdown = {
    allyChampions: {
        totalRating: -21.9,
        entries: [
            {
                champions: [
                    { key: "266", id: "Aatrox", name: "Aatrox", icon: null, role: 0 },
                ],
                rating: -21.9,
                winrateDelta: -0.0315,
                wins: 846,
                games: 1806,
            },
        ],
    },
    enemyChampions: {
        totalRating: 12,
        entries: [
            {
                champions: [
                    { key: "122", id: "Darius", name: "Darius", icon: null, role: 0 },
                ],
                rating: 12,
                winrateDelta: 0.017,
                wins: 600,
                games: 1000,
            },
        ],
    },
    allyDuos: { totalRating: 0, entries: [] },
    enemyDuos: { totalRating: 0, entries: [] },
    matchups: {
        totalRating: -2,
        entries: [
            {
                champions: [
                    { key: "266", id: "Aatrox", name: "Aatrox", icon: null, role: 0 },
                    { key: "122", id: "Darius", name: "Darius", icon: null, role: 0 },
                ],
                rating: -2,
                winrateDelta: -0.0016,
                wins: 405.6,
                games: 817,
            },
        ],
    },
};

describe("ContributionBreakdown", () => {
    it("groups the contributions and totals each group for the ally side", () => {
        const html = renderToStaticMarkup(
            <ContributionBreakdown breakdown={BREAKDOWN} />,
        );
        expect(html).toContain("Force des champions");
        expect(html).toContain("Synergies");
        expect(html).toContain("Affrontements");
        // ally (-21,9) minus enemy (+12) = -33,9 points.
        expect(html).toContain("-33,9 pts");
        expect(html).toContain("Aatrox (Top) vs Darius (Top)");
    });

    it("invites a pick when there is nothing to decompose", () => {
        const html = renderToStaticMarkup(
            <ContributionBreakdown breakdown={undefined} />,
        );
        expect(html).toContain("Rien à décomposer");
    });
});

describe("WhyPanel", () => {
    it("separates what helps from what hurts", () => {
        const html = renderToStaticMarkup(<WhyPanel breakdown={BREAKDOWN} />);
        expect(html).toContain("Ce qui vous aide");
        expect(html).toContain("Ce qui vous pénalise");
        expect(html).toContain("Aatrox (Top)");
        expect(html).toContain("-3,1");
    });
});

describe("DamageDistribution", () => {
    it("describes both teams as shares", () => {
        const html = renderToStaticMarkup(
            <DamageDistribution
                ally={{ magic: 0.456, physical: 1.352, true: 0.192, total: 2 }}
                opponent={{ magic: 1.9, physical: 0.1, true: 0, total: 2 }}
            />,
        );
        expect(html).toContain("Votre équipe : Magiques 23");
        expect(html).toContain("Équipe adverse");
        expect(html).toContain("magiques");
    });

    it("says so when there is nothing to show", () => {
        const html = renderToStaticMarkup(
            <DamageDistribution ally={undefined} opponent={undefined} />,
        );
        expect(html).toContain("Aucun profil de dégâts");
    });
});

const SUGGESTIONS: SuggestionsPayload = {
    dataset: {} as SuggestionsPayload["dataset"],
    config: { riskLevel: "medium", minGames: 1000, ignoreChampionWinrates: false },
    state: { ally: [], opponent: [], bans: { ally: [], opponent: [] } },
    baseline: { totalRating: -21.9, winrate: 0.4645 },
    roles: [
        {
            role: 1,
            open: true,
            suggestions: [
                {
                    key: "360",
                    id: "Samira",
                    name: "Samira",
                    icon: null,
                    role: 1,
                    rating: 8.4,
                    winrate: 0.512,
                    winrateDelta: 0.0475,
                    games: 8612,
                },
            ],
        },
        { role: 2, open: false, suggestions: [] },
    ],
    best: [],
};

describe("SuggestionList", () => {
    it("shows the resulting probability, the delta and a reason", () => {
        const html = renderToStaticMarkup(
            <SuggestionList
                payload={SUGGESTIONS}
                isLoading={false}
                error={null}
                limit={10}
                onPreview={noop}
                onPick={noop}
            />,
        );
        expect(html).toContain("Samira");
        expect(html).toContain("51,2");
        expect(html).toContain("+4,8");
        expect(html).toContain("Meilleur choix en Jungle");
        expect(html).toContain("Choisir Samira en Jungle");
        // A closed role is not advertised.
        expect(html).not.toContain("Midlane");
    });

    it("puts the role you are about to pick first and labels it", () => {
        const payload: SuggestionsPayload = {
            ...SUGGESTIONS,
            roles: [
                SUGGESTIONS.roles[0]!,
                {
                    role: 3,
                    open: true,
                    suggestions: [
                        {
                            key: "22",
                            id: "Ashe",
                            name: "Ashe",
                            icon: null,
                            role: 3,
                            rating: 12,
                            winrate: 0.53,
                            winrateDelta: 0.03,
                            games: 183750,
                        },
                    ],
                },
            ],
        };
        const html = renderToStaticMarkup(
            <SuggestionList
                payload={payload}
                isLoading={false}
                error={null}
                limit={10}
                priorityRole={3}
                onPreview={noop}
                onPick={noop}
            />,
        );
        expect(html).toContain("Votre rôle");
        expect(html.indexOf("Botlane")).toBeLessThan(html.indexOf("Jungle"));
    });

    it("says when there is no open role left", () => {
        const html = renderToStaticMarkup(
            <SuggestionList
                payload={{ ...SUGGESTIONS, roles: [] }}
                isLoading={false}
                error={null}
                limit={10}
                onPreview={noop}
                onPick={noop}
            />,
        );
        expect(html).toContain("Votre équipe est complète");
    });
});

const BANS: BansPayload = {
    dataset: {} as BansPayload["dataset"],
    config: { riskLevel: "medium", minGames: 1000, ignoreChampionWinrates: false },
    state: { ally: [], opponent: [], bans: { ally: [], opponent: [] } },
    baseline: { totalRating: 0, winrate: 0.4685 },
    bans: [
        {
            key: "50",
            id: "Swain",
            name: "Swain",
            icon: null,
            role: 4,
            rating: 28.9,
            winrate: 0.4274,
            winrateLoss: 0.0411,
            games: 14451,
        },
    ],
};

describe("BanSuggestionList", () => {
    it("ranks threats and says what each one costs", () => {
        const html = renderToStaticMarkup(
            <BanSuggestionList
                payload={BANS}
                isLoading={false}
                error={null}
                limit={20}
                full={false}
                onBan={noop}
            />,
        );
        expect(html).toContain("Swain");
        expect(html).toContain("Bannir Swain");
        expect(html).toContain("4,1");
        expect(html).toContain("14");
    });

    it("explains why the rows are inert once five bans are placed", () => {
        const html = renderToStaticMarkup(
            <BanSuggestionList
                payload={BANS}
                isLoading={false}
                error={null}
                limit={20}
                full
                onBan={noop}
            />,
        );
        expect(html).toContain("cinq bans sont posés");
        expect(html).toContain("disabled");
    });
});

describe("MetaTierList", () => {
    it("ranks the meta per role with its tier", () => {
        const html = renderToStaticMarkup(
            <MetaTierList payload={SUGGESTIONS} isLoading={false} onPick={noop} />,
        );
        expect(html).toContain("Jungle");
        expect(html).toContain("Samira");
        expect(html).toContain("Placer Samira en Jungle");
        expect(html).toContain("Palier B");
    });
});

const STATUS: LcuStatus = {
    enabled: true,
    running: true,
    connected: true,
    polling: false,
    phase: "ChampSelect",
    inChampSelect: true,
    summoner: null,
    lastError: null,
    updatedAt: 0,
};

const CHAMP_SELECT = {
    phase: "BAN_PICK",
    timerMs: 27_000,
    localPlayer: {
        cellId: 2,
        puuid: null,
        assignedRole: 2,
        championKey: null,
        hoveredChampionKey: null,
        pickActionId: 7,
        banActionId: null,
    },
    ally: [],
    opponent: [],
    allyHovers: [],
    opponentHovers: [],
    bans: { ally: [], opponent: [] },
    pickOrder: [],
    currentActorCellId: 2,
    isLocalPlayerTurn: true,
    benchChampionKeys: [],
    isCustom: false,
    isSpectating: false,
    allyPlayers: [],
    opponentPlayers: [],
} as unknown as SerializedChampSelectState;

describe("LiveBadge", () => {
    it("says the board mirrors the client, and whose turn it is", () => {
        const html = renderToStaticMarkup(
            <LiveBadge
                status={STATUS}
                active
                state={CHAMP_SELECT}
                remainingMs={27_000}
                followClient
                onFollowChange={noop}
            />,
        );
        expect(html).toContain("Synchronisé avec le client");
        expect(html).toContain("Bans &amp; picks");
        expect(html).toContain("0:27");
        expect(html).toContain("À vous de jouer");
        expect(html).toContain('role="switch"');
        expect(html).toContain('aria-checked="true"');
    });

    it("offers to resume the sync after a manual edit", () => {
        const html = renderToStaticMarkup(
            <LiveBadge
                status={STATUS}
                active
                state={CHAMP_SELECT}
                remainingMs={5_000}
                followClient={false}
                onFollowChange={noop}
            />,
        );
        expect(html).toContain("Édition manuelle");
        expect(html).toContain("Reprendre le suivi");
    });

    it("stays useful with no client at all", () => {
        const html = renderToStaticMarkup(
            <LiveBadge
                status={null}
                active={false}
                state={null}
                remainingMs={0}
                followClient={false}
                onFollowChange={noop}
            />,
        );
        expect(html).toContain("Client non détecté");
        expect(html).toContain("disabled");
    });
});

describe("ChampionPicker", () => {
    it("renders nothing without a document, instead of throwing", () => {
        const html = renderToStaticMarkup(
            <ChampionPicker
                open
                target={{ team: "ally", role: 0, mode: "pick" }}
                champions={[AATROX]}
                unavailable={new Set()}
                ranking={{ byKey: new Map(), contextual: false, isLoading: false }}
                rolePools={new Map()}
                onPick={noop}
                onClose={noop}
            />,
        );
        expect(html).toBe("");
    });
});
