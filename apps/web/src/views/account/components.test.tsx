import { renderToStaticMarkup } from "react-dom/server";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { ApiError } from "../../api";
import { LiveSocketProvider } from "../../api/live";
import { createQueryClient } from "../../api/queries";
import type {
    LeagueEntryDto,
    MasteryEntry,
    MatchSummary,
    PlaystyleProfile,
} from "../../api";
import { AxisTable } from "./AxisTable";
import { ChampionPoolPanel } from "./ChampionPoolPanel";
import { MatchHistoryPanel } from "./MatchHistoryPanel";
import { PlaystylePanel } from "./PlaystylePanel";
import { ProfileHeader } from "./ProfileHeader";
import type { PlaystyleView } from "./hooks";
import { LcuConnectCard } from "./LcuConnectCard";
import { MasteryList } from "./MasteryList";
import { MatchDetail } from "./MatchDetail";
import { MatchRow } from "./MatchRow";
import { RankCard } from "./RankCard";
import { RiotKeyOnboarding } from "./RiotKeyOnboarding";
import { RoleDistribution } from "./RoleDistribution";
import { SavedAccountList } from "./SavedAccountList";
import { TraitList } from "./TraitList";
import type { SavedAccount } from "./helpers";

/**
 * The pieces of the account screen, rendered without a browser.
 *
 * There is no jsdom here: components are rendered to static markup, which is
 * exactly the cold-start paint — nothing has answered, no image has loaded, no
 * effect has run. Everything asserted below is therefore what a user actually
 * sees in the first frame, offline, with no Riot key.
 */

function html(node: ReactNode): string {
    return renderToStaticMarkup(
        <QueryClientProvider client={createQueryClient()}>
            <LiveSocketProvider enabled={false}>
                <MemoryRouter>{node}</MemoryRouter>
            </LiveSocketProvider>
        </QueryClientProvider>,
    );
}

const keyMissing = () =>
    new ApiError({
        code: "RIOT_KEY_MISSING",
        message: "No Riot API key is configured.",
        status: 428,
        endpoint: "/api/account/x/playstyle",
    });

const entry = (overrides: Partial<LeagueEntryDto> = {}): LeagueEntryDto => ({
    queueType: "RANKED_SOLO_5x5",
    tier: "EMERALD",
    rank: "II",
    leaguePoints: 46,
    wins: 132,
    losses: 118,
    hotStreak: false,
    ...overrides,
});

describe("RankCard", () => {
    it("shows the tier, the LP and the sample behind the winrate", () => {
        const markup = html(<RankCard label="Classée solo/duo" entry={entry()} />);
        expect(markup).toContain("Émeraude II");
        expect(markup).toContain("46");
        expect(markup).toContain("132");
        expect(markup).toContain("250 parties");
        expect(markup).toContain("52,8"); // 132 / 250
    });

    it("drops the division for an apex tier", () => {
        const markup = html(
            <RankCard
                label="Classée solo/duo"
                entry={entry({ tier: "CHALLENGER", rank: "I" })}
            />,
        );
        expect(markup).toContain("Challenger");
        expect(markup).not.toContain("Challenger I");
    });

    it("says unranked instead of showing a fake 0 %", () => {
        const markup = html(<RankCard label="Classée flexible" entry={undefined} />);
        expect(markup).toContain("Non classé");
        expect(markup).toContain("Aucune partie classée");
        expect(markup).not.toContain("0,0 %");
    });

    it("renders a promotion series in French", () => {
        const markup = html(
            <RankCard
                label="Classée solo/duo"
                entry={entry({ miniSeries: { wins: 1, losses: 1, target: 3, progress: "WLN" } })}
            />,
        );
        expect(markup).toContain('aria-label="Série de promotion"');
        expect(markup).toContain(">V<");
        expect(markup).toContain(">D<");
    });
});

describe("TraitList", () => {
    const trait = (
        axis: string,
        kind: "strength" | "weakness",
        score: number,
    ): PlaystyleProfile["strengths"][number] =>
        ({
            axis,
            labelKey: `playstyle.${kind}.${axis}`,
            label: "English fallback",
            score,
            delta: score - 50,
        }) as PlaystyleProfile["strengths"][number];

    it("translates the stable labelKeys instead of echoing English", () => {
        const markup = html(
            <TraitList traits={[trait("vision", "strength", 71)]} kind="strength" />,
        );
        expect(markup).toContain("Maître de la vision");
        expect(markup).toContain("+21\u00a0pts");
        expect(markup).not.toContain("English fallback");
    });

    it("is honest when no axis stands out", () => {
        const markup = html(<TraitList traits={[]} kind="weakness" />);
        expect(markup).toContain("Aucune faiblesse marquée");
    });
});

describe("RoleDistribution", () => {
    it("shows every role with its share, games and winrate", () => {
        const markup = html(
            <RoleDistribution
                distribution={[
                    { role: 1, games: 12, share: 0.6, wins: 7, winrate: 0.583 },
                    { role: 2, games: 8, share: 0.4, wins: 3, winrate: 0.375 },
                ]}
            />,
        );
        expect(markup).toContain("Jungle");
        expect(markup).toContain("Midlane");
        expect(markup).toContain("12 parties");
        expect(markup).toContain("60");
    });

    it("says so when Riot reported no position at all", () => {
        expect(html(<RoleDistribution distribution={[]} />)).toContain(
            "Aucun rôle identifié",
        );
    });
});

describe("MasteryList", () => {
    const mastery = (championId: number, name: string): MasteryEntry =>
        ({
            puuid: "p",
            championId,
            championLevel: 7,
            championPoints: 214301,
            lastPlayTime: 0,
            championPointsSinceLastLevel: 0,
            championPointsUntilNextLevel: 0,
            champion: { key: String(championId), id: name, name, icon: null },
        }) as MasteryEntry;

    it("links each mastery to its champion page and falls back to initials", () => {
        const markup = html(<MasteryList mastery={[mastery(266, "Aatrox")]} />);
        expect(markup).toContain('href="/champions/266"');
        expect(markup).toContain("Aatrox");
        // The CDN is unreachable here: the initials tile is the first paint.
        expect(markup).toContain(">AA<");
    });

    it("does not pretend a missing mastery list is an error", () => {
        expect(html(<MasteryList mastery={[]} />)).toContain("Aucune maîtrise");
    });
});

function historyMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
    return {
        matchId: "EUW1_7412345678",
        championKey: "266",
        championName: "Aatrox",
        champLevel: 16,
        role: 0,
        teamPosition: "TOP",
        queue: "Ranked Solo/Duo",
        remake: false,
        win: true,
        kills: 8,
        deaths: 3,
        assists: 6,
        cs: 214,
        csPerMinute: 7.25,
        damage: { toChampions: 24500 },
        damageShare: 0.29,
        durationSeconds: 1770,
        durationMinutes: 29.5,
        gameCreation: 1786900000000,
        gameEnd: 1786901800000,
        draft: { ally: [], opponent: [], bans: { ally: [], opponent: [] } },
        ...overrides,
    } as MatchSummary;
}

describe("MatchRow", () => {
    it("renders a dense, collapsed row with every column", () => {
        const markup = html(
            <MatchRow match={historyMatch()} expanded={false} onToggle={() => {}} />,
        );
        expect(markup).toContain("Victoire");
        expect(markup).toContain("Aatrox");
        expect(markup).toContain("8\u00a0/\u00a03\u00a0/\u00a06");
        expect(markup).toContain("214");
        expect(markup).toContain("29:30");
        expect(markup).toContain("Classée solo/duo");
        expect(markup).toContain('aria-expanded="false"');
        // Collapsed means no draft analysis was requested for this game.
        expect(markup).toContain("hidden");
        expect(markup).not.toContain("Ce que le moteur aurait prédit");
    });

    it("calls a remake a remake", () => {
        const markup = html(
            <MatchRow
                match={historyMatch({ remake: true, win: false })}
                expanded={false}
                onToggle={() => {}}
            />,
        );
        expect(markup).toContain("Partie annulée");
        expect(markup).not.toContain("Défaite");
    });
});

describe("SavedAccountList", () => {
    const account = (puuid: string, riotId: string): SavedAccount => ({
        puuid,
        riotId,
        platform: "euw1",
        source: "riot-id",
        lastUsedAt: 0,
    });

    it("offers one switch button and one forget button per account", () => {
        const markup = html(
            <SavedAccountList
                accounts={[account("a", "Moi#EUW"), account("b", "Smurf#EUW")]}
                activePuuid="a"
                onSelect={() => {}}
                onForget={() => {}}
            />,
        );
        expect(markup).toContain("Moi#EUW");
        expect(markup).toContain("Smurf#EUW");
        expect(markup).toContain('aria-label="Oublier Moi#EUW"');
        expect(markup).toContain("Basculer sur Smurf#EUW");
        expect(markup).toContain("Connecté");
    });

    it("renders nothing at all when no account was ever saved", () => {
        expect(
            html(
                <SavedAccountList
                    accounts={[]}
                    activePuuid={null}
                    onSelect={() => {}}
                    onForget={() => {}}
                />,
            ),
        ).toBe("");
    });
});

describe("RiotKeyOnboarding", () => {
    it("sells the key instead of reporting an error", () => {
        const markup = html(<RiotKeyOnboarding />);
        expect(markup).toContain("Profil de style de jeu");
        expect(markup).toContain("Historique détaillé");
        expect(markup).toContain(
            "Le client League of Legends fonctionne sans clé.",
        );
        expect(markup).toContain('href="/parametres"');
        expect(markup).not.toContain('role="alert"');
    });

    it("has a distinct wording for a key Riot refused", () => {
        const markup = html(<RiotKeyOnboarding rejected />);
        expect(markup).toContain("refusée");
        expect(markup).toContain("24 heures");
    });
});

// ------------------------------------------- the connected dashboard panels ---

const AXES: PlaystyleProfile["axes"] = {
    aggression: 71,
    farming: 58,
    vision: 34,
    objectives: 62,
    survivability: 45,
    teamplay: 55,
    consistency: 61,
    scaling: 49,
};

function profile(overrides: Partial<PlaystyleProfile> = {}): PlaystyleProfile {
    return {
        matchesAnalyzed: 47,
        matchesExcluded: 3,
        lowConfidence: false,
        primaryRole: 1,
        axes: AXES,
        axisDetails: {
            vision: {
                axis: "vision",
                score: 34,
                sampleSize: 47,
                lowConfidence: false,
                description: "english",
                inputs: [
                    {
                        metric: "visionScorePerMinute",
                        weight: 0.45,
                        raw: 0.42,
                        score: 28,
                    },
                ],
            },
        },
        archetype: {
            key: "split-pusher",
            label: "Split-pusher",
            labelKey: "playstyle.archetype.split-pusher",
            explanation: "English explanation from the engine",
            confidence: 0.62,
            runnerUp: { key: "scaling-farmer", label: "Scaling farmer" },
        },
        strengths: [
            {
                axis: "aggression",
                labelKey: "playstyle.strength.aggression",
                label: "Aggressive damage threat",
                score: 71,
                delta: 21,
            },
        ],
        weaknesses: [
            {
                axis: "vision",
                labelKey: "playstyle.weakness.vision",
                label: "Neglects vision",
                score: 34,
                delta: -16,
            },
        ],
        championPool: [
            {
                championKey: "266",
                championName: "Aatrox",
                games: 21,
                wins: 13,
                losses: 8,
                winrate: 13 / 21,
                kda: 3.1,
                performance: 62,
                roles: [{ role: 0, games: 21 }],
                masteryPoints: 214301,
                masteryLevel: 7,
            },
            {
                championKey: "122",
                championName: "Darius",
                games: 2,
                wins: 2,
                losses: 0,
                winrate: 1,
                kda: 6,
                performance: 80,
                roles: [{ role: 0, games: 2 }],
            },
        ],
        roleDistribution: [
            { role: 0, games: 23, share: 0.49, wins: 13, winrate: 0.565 },
            { role: 1, games: 24, share: 0.51, wins: 11, winrate: 0.458 },
        ],
        ...overrides,
    } as unknown as PlaystyleProfile;
}

function playstyleView(overrides: Partial<PlaystyleView> = {}): PlaystyleView {
    return {
        data: {
            puuid: "puuid-1",
            platform: "euw1",
            sampleSize: 47,
            cached: false,
            fetchedAt: Date.now(),
            profile: profile(),
        },
        error: null,
        isLoading: false,
        isFetching: false,
        isRefreshing: false,
        progress: null,
        refresh: () => {},
        retry: () => {},
        ...overrides,
    };
}

describe("ProfileHeader", () => {
    const account = { puuid: "puuid-1", riotId: "Moi#EUW", platform: "euw1" };

    it("keeps the identity from the client when there is no API key", () => {
        const markup = html(
            <ProfileHeader
                account={account}
                profile={null}
                error={keyMissing()}
                isLoading={false}
                isFetching={false}
                onRetry={() => {}}
                onDisconnect={() => {}}
                onSwitch={() => {}}
                version="16.17.1"
                fallback={{
                    displayName: "Moi",
                    summonerLevel: 340,
                    profileIconId: 4568,
                    source: "lcu",
                }}
            />,
        );
        expect(markup).toContain("Moi#EUW");
        expect(markup).toContain("Niveau 340");
        expect(markup).toContain("Client détecté");
        // The 428 is a call to action, not an error.
        expect(markup).toContain("Connectez votre compte Riot");
        expect(markup).toContain("Ajouter une clé d&#x27;API");
        expect(markup).not.toContain('role="alert"');
    });

    it("renders both queues and the masteries once the profile answers", () => {
        const markup = html(
            <ProfileHeader
                account={account}
                profile={
                    {
                        platform: "euw1",
                        account: { puuid: "puuid-1", gameName: "Moi", tagLine: "EUW" },
                        summoner: {
                            puuid: "puuid-1",
                            profileIconId: 4568,
                            summonerLevel: 340,
                            revisionDate: 0,
                        },
                        ranks: { solo: entry(), entries: [] },
                        mastery: [],
                    } as never
                }
                error={null}
                isLoading={false}
                isFetching={false}
                onRetry={() => {}}
                onDisconnect={() => {}}
                onSwitch={() => {}}
                version="16.17.1"
                fallback={null}
            />,
        );
        expect(markup).toContain("Classée solo/duo");
        expect(markup).toContain("Classée flexible");
        expect(markup).toContain("Émeraude II");
        expect(markup).toContain("Non classé");
        expect(markup).toContain("Aucune maîtrise");
    });
});

describe("PlaystylePanel", () => {
    it("headlines the archetype in French and draws the radar with its baseline", () => {
        const markup = html(
            <PlaystylePanel view={playstyleView()} count={50} onCountChange={() => {}} />,
        );
        expect(markup).toContain("Split-pusher");
        expect(markup).toContain("side lane");
        expect(markup).not.toContain("English explanation");
        expect(markup).toContain("47 parties analysées");
        expect(markup).toContain("3 écartées");
        expect(markup).toContain("comparé aux Jungle");
        expect(markup).toContain("Profil le plus proche ensuite");
        expect(markup).toContain("Menace offensive constante");
        expect(markup).toContain("Vision négligée");
        expect(markup).toContain("moyenne des joueurs du même");
    });

    it("offers 20 / 50 / 100 games and a refresh", () => {
        const markup = html(
            <PlaystylePanel view={playstyleView()} count={50} onCountChange={() => {}} />,
        );
        expect(markup).toContain('aria-label="Nombre de parties analysées"');
        expect(markup).toContain(">20<");
        expect(markup).toContain(">100<");
        expect(markup).toContain('aria-label="Recalculer le profil de style de jeu"');
    });

    it("shows the real job progress instead of a spinner", () => {
        const markup = html(
            <PlaystylePanel
                view={playstyleView({
                    data: null,
                    isLoading: true,
                    isFetching: true,
                    progress: {
                        job: "playstyle",
                        key: "puuid-1",
                        stage: "matches",
                        loaded: 23,
                        total: 50,
                    },
                })}
                count={50}
                onCountChange={() => {}}
            />,
        );
        expect(markup).toContain("Lecture des parties une par une");
        expect(markup).toContain("23");
        expect(markup).toContain('aria-valuenow="46"');
        expect(markup).toContain("limiteur de débit");
    });

    it("turns the 428 into the connect call to action", () => {
        const markup = html(
            <PlaystylePanel
                view={playstyleView({ data: null, error: keyMissing() })}
                count={50}
                onCountChange={() => {}}
            />,
        );
        expect(markup).toContain("Connectez votre compte Riot");
        expect(markup).toContain('href="/parametres"');
    });

    it("says there is nothing to profile rather than drawing a flat radar", () => {
        const markup = html(
            <PlaystylePanel
                view={playstyleView({
                    data: {
                        puuid: "puuid-1",
                        platform: "euw1",
                        sampleSize: 0,
                        cached: false,
                        fetchedAt: 0,
                        profile: profile({ matchesAnalyzed: 0 }),
                    },
                })}
                count={20}
                onCountChange={() => {}}
            />,
        );
        expect(markup).toContain("Aucune partie exploitable");
    });
});

describe("AxisTable", () => {
    it("lists the eight axes with their distance to the role baseline", () => {
        const markup = html(<AxisTable axes={AXES} details={profile().axisDetails} />);
        expect(markup).toContain("Agressivité");
        expect(markup).toContain("Montée en puissance");
        expect(markup).toContain("+21");
        expect(markup).toContain("-16");
        expect(markup).toContain('aria-expanded="false"');
        expect(markup.match(/aria-expanded="false"/g)).toHaveLength(8);
    });
});

describe("ChampionPoolPanel", () => {
    it("shows the pool with CS measured on the history, and blanks when unknown", () => {
        const markup = html(
            <ChampionPoolPanel
                profile={profile()}
                csPerMinute={new Map([["266", { csPerMinute: 7.24, games: 9 }]])}
            />,
        );
        expect(markup).toContain("Aatrox");
        expect(markup).toContain("Darius");
        expect(markup).toContain("7,2");
        expect(markup).toContain("CS/min");
        expect(markup).toContain("214\u00a0k");
        // Darius is absent from the loaded history: a dash, never a zero.
        expect(markup).toContain("—");
    });

    it("refuses to rank a champion played twice", () => {
        const markup = html(
            <ChampionPoolPanel profile={profile()} csPerMinute={new Map()} />,
        );
        expect(markup).toContain("Vos meilleurs");
        expect(markup).toContain("1 champion joué moins de 4 fois");
    });

    it("draws the role distribution", () => {
        const markup = html(
            <ChampionPoolPanel profile={profile()} csPerMinute={new Map()} />,
        );
        expect(markup).toContain("Répartition par rôle");
        expect(markup).toContain("Toplane");
        expect(markup).toContain("23 parties");
    });
});

describe("MatchHistoryPanel", () => {
    it("summarises the loaded games and lists them", () => {
        const markup = html(
            <MatchHistoryPanel
                puuid="puuid-1"
                data={{
                    puuid: "puuid-1",
                    platform: "euw1",
                    count: 20,
                    matches: [historyMatch()],
                    skipped: ["EUW1_0"],
                    fetchedAt: Date.now(),
                }}
                error={null}
                isLoading={false}
                isFetching={false}
                onRetry={() => {}}
                count={20}
                onCountChange={() => {}}
            />,
        );
        expect(markup).toContain("1 parties chargées");
        expect(markup).toContain("1 illisibles et ignorées");
        expect(markup).toContain("Aatrox");
        expect(markup).toContain("KDA moyen");
        expect(markup).toContain('aria-label="Nombre de parties chargées"');
    });

    it("has an honest empty state", () => {
        const markup = html(
            <MatchHistoryPanel
                puuid="puuid-1"
                data={{
                    puuid: "puuid-1",
                    platform: "euw1",
                    count: 20,
                    matches: [],
                    skipped: [],
                    fetchedAt: 0,
                }}
                error={null}
                isLoading={false}
                isFetching={false}
                onRetry={() => {}}
                count={20}
                onCountChange={() => {}}
            />,
        );
        expect(markup).toContain("Aucune partie récente");
    });

    it("turns the 428 into the connect call to action", () => {
        const markup = html(
            <MatchHistoryPanel
                puuid="puuid-1"
                data={null}
                error={keyMissing()}
                isLoading={false}
                isFetching={false}
                onRetry={() => {}}
                count={20}
                onCountChange={() => {}}
            />,
        );
        expect(markup).toContain("Connectez votre compte Riot");
        expect(markup).not.toContain('role="alert"');
    });
});

describe("LcuConnectCard", () => {
    it("says the client is not detected instead of pretending to look", () => {
        const markup = html(
            <LcuConnectCard onConnect={() => {}} activePuuid={null} />,
        );
        expect(markup).toContain("Détection automatique");
        expect(markup).toContain("aucune clé d&#x27;API nécessaire");
        expect(markup).toContain("Client non détecté");
        expect(markup).toContain("Chercher à nouveau");
        // Nothing to connect to: the "C'est moi" button must not be offered.
        expect(markup).not.toContain("C&#x27;est moi");
    });
});

describe("MatchDetail", () => {
    const player = (
        puuid: string,
        championKey: string,
        championName: string,
        role: number,
    ) => ({
        puuid,
        participantId: 1,
        championId: Number(championKey),
        championKey,
        championName,
        role,
        teamId: 100,
        win: true,
        kills: 4,
        deaths: 2,
        assists: 7,
        riotId: `${championName}#EUW`,
    });

    const detailed = () =>
        historyMatch({
            puuid: "puuid-1",
            team: {
                teamId: 100,
                side: "blue",
                win: true,
                bans: ["1"],
                objectives: {},
                kills: 20,
                deaths: 12,
                gold: 60000,
                damageToChampions: 90000,
                damageTaken: 80000,
                players: [
                    player("puuid-1", "266", "Aatrox", 0),
                    player("p2", "64", "LeeSin", 1),
                ],
            },
            enemyTeam: {
                teamId: 200,
                side: "red",
                win: false,
                bans: ["2"],
                objectives: {},
                kills: 12,
                deaths: 20,
                gold: 55000,
                damageToChampions: 70000,
                damageTaken: 90000,
                players: [player("p6", "122", "Darius", 0)],
            },
            draft: {
                ally: [
                    [0, "266"],
                    [1, "64"],
                ],
                opponent: [[0, "122"]],
                bans: { ally: ["1"], opponent: ["2"] },
            },
        } as unknown as Partial<MatchSummary>);

    it("replays the draft of the game and marks the player's own row", () => {
        const markup = html(<MatchDetail match={detailed()} />);
        expect(markup).toContain("Draft de la partie");
        expect(markup).toContain("Aatrox");
        expect(markup).toContain("Darius");
        expect(markup).toContain("vous");
        expect(markup).toContain("Votre équipe (victoire)");
        expect(markup).toContain("Bans");
    });

    it("announces the prediction it is about to compute", () => {
        const markup = html(<MatchDetail match={detailed()} />);
        expect(markup).toContain("Ce que le moteur aurait prédit");
    });

    it("does not invent a prediction when Riot gave no draft", () => {
        const markup = html(
            <MatchDetail
                match={historyMatch({
                    team: {
                        teamId: 100,
                        side: "blue",
                        win: true,
                        bans: [],
                        players: [],
                    },
                    enemyTeam: {
                        teamId: 200,
                        side: "red",
                        win: false,
                        bans: [],
                        players: [],
                    },
                } as unknown as Partial<MatchSummary>)}
            />,
        );
        expect(markup).toContain("ne peut pas être rejouée");
    });
});
