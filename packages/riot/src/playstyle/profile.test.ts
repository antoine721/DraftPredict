import { Role } from "@draftpredict/core";
import { beforeEach, describe, expect, it } from "vitest";

import type { MatchSummary } from "../match/summary.js";
import {
    makeSummary,
    resetFixtureCounter,
    type SummaryOptions,
} from "../testing/fixtures.js";
import { DEFAULT_BASELINES } from "./baselines.js";
import { profilePlaystyle } from "./profile.js";
import { PLAYSTYLE_AXES } from "./types.js";

beforeEach(() => {
    resetFixtureCounter();
});

/** A bot-lane hyper-carry: farms hard, deals the damage, ignores wards. */
function carryGames(count = 8, overrides: SummaryOptions = {}): MatchSummary[] {
    return Array.from({ length: count }, (_, index) =>
        makeSummary({
            role: Role.Bottom,
            championKey: "22",
            championName: "Ashe",
            win: index % 4 !== 0,
            killParticipation: 0.62,
            kills: 9,
            deaths: 3,
            assists: 7,
            deathShare: 0.12,
            csPerMinute: 9.4,
            goldPerMinute: 520,
            goldShare: 0.28,
            damageShare: 0.38,
            damageTakenShare: 0.14,
            visionScorePerMinute: 0.4,
            wardsPlaced: 8,
            wardsKilled: 1,
            controlWards: 1,
            objectiveParticipation: 0.5,
            objectiveDamagePerMinute: 500,
            turretDamagePerMinute: 260,
            soloKills: 1,
            healShieldPerMinute: 5,
            ...overrides,
        }),
    );
}

/** An enchanter support: vision, assists, healing, no farm and no damage. */
function supportGames(count = 8): MatchSummary[] {
    return Array.from({ length: count }, (_, index) =>
        makeSummary({
            role: Role.Support,
            championKey: "16",
            championName: "Soraka",
            win: index % 3 !== 0,
            killParticipation: 0.72,
            kills: 1,
            deaths: 5,
            assists: 18,
            deathShare: 0.26,
            csPerMinute: 1.0,
            goldPerMinute: 265,
            goldShare: 0.14,
            damageShare: 0.09,
            damageTakenShare: 0.16,
            visionScorePerMinute: 2.8,
            wardsPlaced: 55,
            wardsKilled: 18,
            controlWards: 9,
            objectiveParticipation: 0.5,
            objectiveDamagePerMinute: 60,
            turretDamagePerMinute: 20,
            soloKills: 0,
            healShieldPerMinute: 400,
        }),
    );
}

/** A jungler living on objectives. */
function jungleGames(count = 8): MatchSummary[] {
    return Array.from({ length: count }, (_, index) =>
        makeSummary({
            role: Role.Jungle,
            championKey: "64",
            championName: "LeeSin",
            win: index % 2 === 0,
            killParticipation: 0.74,
            kills: 6,
            deaths: 5,
            assists: 12,
            deathShare: 0.2,
            csPerMinute: 6.2,
            goldPerMinute: 420,
            goldShare: 0.22,
            damageShare: 0.2,
            damageTakenShare: 0.24,
            visionScorePerMinute: 1.1,
            wardsPlaced: 30,
            wardsKilled: 15,
            controlWards: 4,
            objectiveParticipation: 0.95,
            objectiveDamagePerMinute: 1_300,
            turretDamagePerMinute: 120,
            soloKills: 1,
            healShieldPerMinute: 30,
        }),
    );
}

describe("profilePlaystyle — shape", () => {
    it("returns every axis on a 0-100 scale", () => {
        const profile = profilePlaystyle(carryGames());
        for (const axis of PLAYSTYLE_AXES) {
            expect(profile.axes[axis], axis).toBeGreaterThanOrEqual(0);
            expect(profile.axes[axis], axis).toBeLessThanOrEqual(100);
            expect(profile.axisDetails[axis].axis).toBe(axis);
            expect(profile.axisDetails[axis].description.length).toBeGreaterThan(0);
        }
        expect(profile.matchesAnalyzed).toBe(8);
        expect(profile.matchesExcluded).toBe(0);
        expect(profile.lowConfidence).toBe(false);
    });

    it("is pure: the same input gives the same output", () => {
        const games = carryGames();
        expect(profilePlaystyle(games)).toEqual(profilePlaystyle(games));
    });
});

describe("profilePlaystyle — a bot lane carry", () => {
    const profile = profilePlaystyle(carryGames());

    it("scores farming and aggression high, vision low", () => {
        expect(profile.primaryRole).toBe(Role.Bottom);
        expect(profile.axes.farming).toBeGreaterThan(70);
        expect(profile.axes.aggression).toBeGreaterThan(60);
        expect(profile.axes.vision).toBeLessThan(40);
    });

    it("lists readable strengths and weaknesses with English keys", () => {
        const strengthAxes = profile.strengths.map((trait) => trait.axis);
        expect(strengthAxes).toContain("farming");
        expect(profile.weaknesses.map((trait) => trait.axis)).toContain("vision");
        for (const trait of [...profile.strengths, ...profile.weaknesses]) {
            expect(trait.labelKey).toMatch(/^playstyle\.(strength|weakness)\./);
            expect(trait.label).toMatch(/^[\x20-\x7E]+$/);
            expect(trait.delta).toBeCloseTo(trait.score - 50, 10);
        }
    });

    it("picks a carry archetype and explains it", () => {
        expect(["hyper-carry", "split-pusher", "lane-bully"]).toContain(
            profile.archetype.key,
        );
        expect(profile.archetype.labelKey).toBe(
            `playstyle.archetype.${profile.archetype.key}`,
        );
        expect(profile.archetype.explanation).toContain("/100");
        expect(profile.archetype.explanation).toContain("Bottom");
        expect(profile.archetype.confidence).toBeGreaterThanOrEqual(0);
        expect(profile.archetype.confidence).toBeLessThanOrEqual(1);
        expect(profile.archetype.runnerUp?.key).toBeDefined();
    });
});

describe("profilePlaystyle — a support", () => {
    const profile = profilePlaystyle(supportGames());

    it("compares a support against supports, not against carries", () => {
        expect(profile.primaryRole).toBe(Role.Support);
        expect(profile.axes.vision).toBeGreaterThan(70);
        expect(profile.axes.teamplay).toBeGreaterThan(70);
        // 1 cs/min is a perfectly normal support: farming must not collapse.
        expect(profile.axes.farming).toBeGreaterThan(30);
        expect(profile.axes.farming).toBeLessThan(60);
    });

    it("is recognised as a vision controller", () => {
        expect(profile.archetype.key).toBe("vision-controller");
        expect(profile.strengths.map((trait) => trait.axis)).toContain("vision");
    });
});

describe("profilePlaystyle — a jungler", () => {
    const profile = profilePlaystyle(jungleGames());

    it("scores objectives high", () => {
        expect(profile.primaryRole).toBe(Role.Jungle);
        expect(profile.axes.objectives).toBeGreaterThan(75);
        expect(profile.axes.aggression).toBeGreaterThan(55);
    });

    it("breaks the profile down per role and per champion", () => {
        expect(profile.byRole).toHaveLength(1);
        expect(profile.byRole[0]!.role).toBe(Role.Jungle);
        expect(profile.byRole[0]!.games).toBe(8);
        expect(profile.byChampion[0]!.championName).toBe("LeeSin");
        expect(profile.byChampion[0]!.axes.objectives).toBeGreaterThan(75);
    });
});

describe("profilePlaystyle — derived sections", () => {
    it("builds the champion pool with mastery and roles", () => {
        const summaries = [...carryGames(6), ...supportGames(2)];
        const profile = profilePlaystyle(summaries, {
            mastery: [
                {
                    puuid: "puuid-test",
                    championId: 22,
                    championLevel: 7,
                    championPoints: 250_000,
                    lastPlayTime: 0,
                    championPointsSinceLastLevel: 0,
                    championPointsUntilNextLevel: 0,
                },
            ],
        });
        const ashe = profile.championPool[0]!;
        expect(ashe.championKey).toBe("22");
        expect(ashe.games).toBe(6);
        expect(ashe.masteryPoints).toBe(250_000);
        expect(ashe.masteryLevel).toBe(7);
        expect(ashe.roles[0]).toEqual({ role: Role.Bottom, games: 6 });
        expect(ashe.winrate).toBeCloseTo(4 / 6, 10);
        expect(profile.championPool[1]!.masteryPoints).toBeUndefined();
    });

    it("accepts a plain championKey -> points mastery map", () => {
        const profile = profilePlaystyle(carryGames(2), { mastery: { "22": 1_234 } });
        expect(profile.championPool[0]!.masteryPoints).toBe(1_234);
    });

    it("reports the role distribution", () => {
        const profile = profilePlaystyle([...carryGames(6), ...supportGames(2)]);
        expect(profile.roleDistribution).toEqual([
            expect.objectContaining({ role: Role.Bottom, games: 6, share: 0.75 }),
            expect.objectContaining({ role: Role.Support, games: 2, share: 0.25 }),
        ]);
    });

    it("ranks best and worst matchups with Laplace smoothing", () => {
        const summaries = [
            ...carryGames(3, { opponentChampionKey: "51", win: true }),
            makeSummary({
                role: Role.Bottom,
                championKey: "22",
                opponentChampionKey: "236",
                win: false,
            }),
            makeSummary({
                role: Role.Bottom,
                championKey: "22",
                opponentChampionKey: "236",
                win: false,
            }),
        ];
        const profile = profilePlaystyle(summaries);
        expect(profile.matchups.best[0]).toMatchObject({
            championKey: "51",
            games: 3,
            wins: 3,
            winrate: 1,
        });
        expect(profile.matchups.best[0]!.score).toBeCloseTo(4 / 5, 10);
        expect(profile.matchups.worst[0]).toMatchObject({
            championKey: "236",
            games: 2,
            wins: 0,
        });
    });

    it("tracks form, streak and trend over the recent games", () => {
        const older = Array.from({ length: 4 }, (_, index) =>
            makeSummary({
                role: Role.Middle,
                win: false,
                gameStart: 1_000 + index,
                csPerMinute: 4,
                damageShare: 0.15,
                killParticipation: 0.3,
            }),
        );
        const newer = Array.from({ length: 4 }, (_, index) =>
            makeSummary({
                role: Role.Middle,
                win: true,
                gameStart: 2_000 + index,
                csPerMinute: 9,
                damageShare: 0.4,
                killParticipation: 0.75,
            }),
        );
        const profile = profilePlaystyle([...older, ...newer]);
        expect(profile.form.games).toHaveLength(8);
        expect(profile.form.games[0]!.gameStart).toBe(2_003);
        expect(profile.form.streak).toEqual({ type: "win", length: 4 });
        expect(profile.form.winrate).toBe(0.5);
        expect(profile.form.trend).toBe("improving");
        expect(profile.form.trendDelta).toBeGreaterThan(5);
    });

    it("limits the form window", () => {
        const profile = profilePlaystyle(carryGames(20), { formGames: 5 });
        expect(profile.form.games).toHaveLength(5);
    });

    it("aggregates totals", () => {
        const profile = profilePlaystyle(carryGames(4));
        expect(profile.totals).toMatchObject({
            games: 4,
            wins: 3,
            losses: 1,
            kills: 36,
            deaths: 12,
            assists: 28,
        });
        expect(profile.totals.winrate).toBe(0.75);
        expect(profile.totals.kda).toBeCloseTo((36 + 28) / 12, 10);
        expect(profile.totals.csPerMinute).toBeCloseTo(9.4, 10);
    });
});

describe("profilePlaystyle — filtering and edge cases", () => {
    it("handles zero matches without dividing by zero", () => {
        const profile = profilePlaystyle([]);
        expect(profile.matchesAnalyzed).toBe(0);
        expect(profile.lowConfidence).toBe(true);
        expect(profile.primaryRole).toBeNull();
        expect(profile.archetype.key).toBe("unknown");
        expect(profile.archetype.confidence).toBe(0);
        for (const axis of PLAYSTYLE_AXES) expect(profile.axes[axis]).toBe(50);
        expect(profile.championPool).toEqual([]);
        expect(profile.roleDistribution).toEqual([]);
        expect(profile.matchups.best).toEqual([]);
        expect(profile.form.streak).toEqual({ type: "none", length: 0 });
        expect(profile.totals.winrate).toBe(0);
        expect(JSON.stringify(profile)).not.toContain("null,null");
    });

    it("still produces a profile from a single match", () => {
        const profile = profilePlaystyle(carryGames(1));
        expect(profile.matchesAnalyzed).toBe(1);
        expect(profile.lowConfidence).toBe(true);
        expect(profile.axisDetails.consistency.lowConfidence).toBe(true);
        expect(profile.axes.consistency).toBe(50);
        expect(profile.axes.scaling).toBe(50);
        expect(profile.form.streak.length).toBe(1);
        expect(profile.archetype.key).not.toBe("unknown");
    });

    it("excludes remakes and short games", () => {
        const summaries = [
            ...carryGames(3),
            makeSummary({ role: Role.Bottom, durationSeconds: 210 }),
            makeSummary({ role: Role.Bottom, durationSeconds: 900, remake: true }),
        ];
        const profile = profilePlaystyle(summaries);
        expect(profile.matchesAnalyzed).toBe(3);
        expect(profile.matchesExcluded).toBe(2);
    });

    it("can keep remakes when asked", () => {
        const summaries = [...carryGames(3), makeSummary({ durationSeconds: 210 })];
        const profile = profilePlaystyle(summaries, {
            excludeRemakes: false,
            minDurationSeconds: 0,
        });
        expect(profile.matchesAnalyzed).toBe(4);
    });

    it("filters by queue", () => {
        const summaries = [
            ...carryGames(3),
            makeSummary({ role: Role.Bottom, queueId: 450 }),
        ];
        expect(profilePlaystyle(summaries, { queues: [420] }).matchesAnalyzed).toBe(3);
        expect(profilePlaystyle(summaries, { queues: [450] }).matchesAnalyzed).toBe(1);
    });

    it("keeps only the requested player's games", () => {
        const summaries = [
            ...carryGames(2),
            makeSummary({ role: Role.Middle, puuid: "someone-else" }),
        ];
        const profile = profilePlaystyle(summaries, { puuid: "puuid-test" });
        expect(profile.matchesAnalyzed).toBe(2);
        expect(profile.puuid).toBe("puuid-test");
    });

    it("accepts a puuid instead of an options object", () => {
        const summaries = carryGames(3);
        expect(profilePlaystyle(summaries, "puuid-test")).toEqual(
            profilePlaystyle(summaries, { puuid: "puuid-test" }),
        );
    });

    it("uses the primary role for games Riot could not position", () => {
        const summaries = [
            ...supportGames(3),
            makeSummary({ role: null, championKey: "16", csPerMinute: 1.1 }),
        ];
        const profile = profilePlaystyle(summaries);
        expect(profile.matchesAnalyzed).toBe(4);
        expect(profile.primaryRole).toBe(Role.Support);
        // Scored as a support, 1.1 cs/min stays average rather than terrible.
        expect(profile.axes.farming).toBeGreaterThan(30);
    });

    it("accepts custom baselines from the pipeline", () => {
        const games = carryGames(4);
        const withDefaults = profilePlaystyle(games);
        const harsher = profilePlaystyle(games, {
            baselines: {
                ...DEFAULT_BASELINES,
                [Role.Bottom]: {
                    ...DEFAULT_BASELINES[Role.Bottom],
                    csPerMinute: { p50: 10, p90: 12 },
                },
            },
        });
        expect(harsher.axes.farming).toBeLessThan(withDefaults.axes.farming);
    });
});
