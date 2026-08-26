import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import { winrateToRating } from "../rating/ratings.js";
import { priorGamesByRiskLevel } from "../risk/risk-level.js";
import { makeDataset, makeTeam, setMatchup, setSynergy } from "../testing/fixtures.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import type { AnalyzeDraftConfig } from "./analysis.js";
import {
    analyzeChampion,
    analyzeChampions,
    analyzeDraft,
    analyzeDuos,
    analyzeMatchups,
} from "./analysis.js";

/**
 * A three-champion world small enough to verify with a calculator.
 *
 *  patch:  1@Top 60/100   2@Jungle 90/200   3@Top 30/50
 *  full:   1@Top 550/1000 2@Jungle 180/400  3@Top 260/500
 */
let patch: Dataset;
let full: Dataset;

const config: AnalyzeDraftConfig = {
    ignoreChampionWinrates: false,
    riskLevel: "medium",
    minGames: 0,
};
const PRIOR = priorGamesByRiskLevel.medium; // 1000

beforeEach(() => {
    patch = makeDataset([
        { key: "1", roles: { [Role.Top]: { games: 100, wins: 60 } } },
        { key: "2", roles: { [Role.Jungle]: { games: 200, wins: 90 } } },
        { key: "3", roles: { [Role.Top]: { games: 50, wins: 30 } } },
    ]);

    full = makeDataset([
        { key: "1", roles: { [Role.Top]: { games: 1000, wins: 550 } } },
        { key: "2", roles: { [Role.Jungle]: { games: 400, wins: 180 } } },
        { key: "3", roles: { [Role.Top]: { games: 500, wins: 260 } } },
    ]);

    setSynergy(full, "1", Role.Top, "2", Role.Jungle, { games: 100, wins: 60 });
    setSynergy(full, "2", Role.Jungle, "1", Role.Top, { games: 80, wins: 40 });

    setMatchup(full, "1", Role.Top, "3", Role.Top, { games: 60, wins: 33 });
    setMatchup(full, "3", Role.Top, "1", Role.Top, { games: 40, wins: 18 });
});

const ally = () =>
    makeTeam([
        [Role.Top, "1"],
        [Role.Jungle, "2"],
    ]);
const enemy = () => makeTeam([[Role.Top, "3"]]);

describe("analyzeChampion", () => {
    it("blends the patch sample with a prior set to the 30-day winrate", () => {
        // (60 + 1000*0.55) / (100 + 1000) = 610/1100
        const result = analyzeChampion(patch, full, Role.Top, "1", PRIOR);
        expect(result.rating).toBeCloseTo(38.05350199290135, 10);
        expect(result.rating).toBeCloseTo(winrateToRating(610 / 1100), 12);
        expect(result).toMatchObject({
            role: Role.Top,
            championKey: "1",
            wins: 60,
            games: 100,
        });
    });

    it("reports a rating of exactly 0 when both samples sit at 50%", () => {
        const evenPatch = makeDataset([
            { key: "1", roles: { [Role.Top]: { games: 100, wins: 50 } } },
        ]);
        const evenFull = makeDataset([
            { key: "1", roles: { [Role.Top]: { games: 900, wins: 450 } } },
        ]);
        expect(analyzeChampion(evenPatch, evenFull, Role.Top, "1", PRIOR).rating).toBe(
            -0,
        );
    });

    it("treats an unplayed 30-day role as a 50% prior", () => {
        // 30-day games are 0 in Middle, so the prior is 500 wins in 1000 games.
        const result = analyzeChampion(patch, full, Role.Middle, "1", PRIOR);
        expect(result.rating).toBeCloseTo(winrateToRating(500 / 1000), 12);
        expect(result.games).toBe(0);
    });

    it("falls back to an empty 30-day champion when it is missing entirely", () => {
        const withoutChampion = makeDataset([]);
        const result = analyzeChampion(patch, withoutChampion, Role.Top, "1", PRIOR);
        // Prior of 500/1000 plus the patch's 60/100.
        expect(result.rating).toBeCloseTo(winrateToRating(560 / 1100), 12);
    });
});

describe("analyzeChampions", () => {
    it("sums the per-champion ratings in map order", () => {
        const result = analyzeChampions(patch, full, ally(), PRIOR);
        expect(result.championResults.map((r) => r.championKey)).toEqual(["1", "2"]);
        expect(result.championResults[1].rating).toBeCloseTo(winrateToRating(0.45), 12);
        expect(result.totalRating).toBeCloseTo(3.1934317053412755, 10);
    });

    it("is empty for an empty team", () => {
        expect(analyzeChampions(patch, full, new Map(), PRIOR)).toEqual({
            championResults: [],
            totalRating: 0,
        });
    });
});

describe("analyzeDuos", () => {
    it("averages both directions of the synergy sample", () => {
        const result = analyzeDuos(full, ally(), PRIOR);
        expect(result.duoResults).toHaveLength(1);

        const duo = result.duoResults[0];
        // 0.55 and 0.45 have opposite ratings, so the pair is expected to be even.
        // average({60,100},{40,80}) = {50,90}; (50 + 500) / (90 + 1000) = 550/1090
        expect(duo.games).toBe(90);
        expect(duo.wins).toBeCloseTo(50, 10);
        expect(duo.rating).toBeCloseTo(3.187571868510117, 10);
        expect(result.totalRating).toBeCloseTo(duo.rating, 12);
        expect(duo).toMatchObject({
            roleA: Role.Top,
            championKeyA: "1",
            roleB: Role.Jungle,
            championKeyB: "2",
        });
    });

    it("pairs every ordered role combination, sorted by role", () => {
        const team = makeTeam([
            [Role.Support, "3"],
            [Role.Top, "1"],
            [Role.Jungle, "2"],
        ]);
        const result = analyzeDuos(full, team, PRIOR);
        expect(result.duoResults.map((d) => [d.roleA, d.roleB])).toEqual([
            [Role.Top, Role.Jungle],
            [Role.Top, Role.Support],
            [Role.Jungle, Role.Support],
        ]);
    });

    it("produces no duos for fewer than two picks", () => {
        expect(analyzeDuos(full, new Map(), PRIOR).totalRating).toBe(0);
        expect(
            analyzeDuos(full, makeTeam([[Role.Top, "1"]]), PRIOR).duoResults,
        ).toEqual([]);
    });

    it("returns a rating of 0 when there is no synergy data at all", () => {
        const empty = makeDataset([
            { key: "1", roles: { [Role.Top]: { games: 100, wins: 50 } } },
            { key: "2", roles: { [Role.Jungle]: { games: 100, wins: 50 } } },
        ]);
        const result = analyzeDuos(empty, ally(), PRIOR);
        expect(result.duoResults[0].rating).toBeCloseTo(0, 12);
        expect(result.duoResults[0].games).toBe(0);
        expect(result.duoResults[0].wins).toBeNaN();
    });
});

describe("analyzeMatchups", () => {
    it("combines the ally's wins with the enemy's losses", () => {
        const result = analyzeMatchups(full, ally(), enemy(), PRIOR);
        expect(result.matchupResults).toHaveLength(2);

        const [topVsTop, jungleVsTop] = result.matchupResults;
        // wins = (33 + (40-18)) / 2 = 27.5, games = (60+40)/2 = 50
        expect(topVsTop.games).toBe(50);
        expect(topVsTop.wins).toBeCloseTo(26, 10);
        expect(topVsTop.rating).toBeCloseTo(0.6602676202357571, 10);

        // No matchup data at all: the rating collapses to the expectation.
        expect(jungleVsTop.games).toBe(0);
        expect(jungleVsTop.rating).toBeCloseTo(0, 12);
        expect(jungleVsTop.wins).toBeNaN();

        expect(result.totalRating).toBeCloseTo(
            topVsTop.rating + jungleVsTop.rating,
            12,
        );
    });

    it("is empty when either side has no picks", () => {
        expect(analyzeMatchups(full, ally(), new Map(), PRIOR).matchupResults).toEqual(
            [],
        );
        expect(analyzeMatchups(full, new Map(), enemy(), PRIOR).matchupResults).toEqual(
            [],
        );
    });
});

describe("analyzeDraft", () => {
    it("adds up to the hand-computed total", () => {
        const result = analyzeDraft(patch, full, ally(), enemy(), config);

        expect(result.allyChampionRating.totalRating).toBeCloseTo(
            3.1934317053412755,
            10,
        );
        expect(result.enemyChampionRating.totalRating).toBeCloseTo(
            16.55707406329004,
            10,
        );
        expect(result.allyDuoRating.totalRating).toBeCloseTo(3.187571868510117, 10);
        expect(result.enemyDuoRating.totalRating).toBe(0);
        expect(result.matchupRating.totalRating).toBeCloseTo(0.6602676202357571, 10);

        expect(result.totalRating).toBeCloseTo(-9.515802869202892, 10);
        expect(result.winrate).toBeCloseTo(0.4863090820502731, 10);
    });

    it("obeys the identity totalRating = ally - enemy + matchups", () => {
        const result = analyzeDraft(patch, full, ally(), enemy(), config);
        expect(result.totalRating).toBeCloseTo(
            result.allyChampionRating.totalRating +
                result.allyDuoRating.totalRating +
                result.matchupRating.totalRating -
                result.enemyChampionRating.totalRating -
                result.enemyDuoRating.totalRating,
            12,
        );
    });

    it("drops champion strength when ignoreChampionWinrates is set", () => {
        const result = analyzeDraft(patch, full, ally(), enemy(), {
            ...config,
            ignoreChampionWinrates: true,
        });
        expect(result.allyChampionRating).toEqual({
            championResults: [],
            totalRating: 0,
            winrate: 0,
        });
        expect(result.enemyChampionRating.totalRating).toBe(0);
        expect(result.totalRating).toBeCloseTo(
            result.allyDuoRating.totalRating + result.matchupRating.totalRating,
            12,
        );
    });

    it("is a coin flip on an empty draft", () => {
        const result = analyzeDraft(patch, full, new Map(), new Map(), config);
        expect(result.totalRating).toBe(0);
        expect(result.winrate).toBe(0.5);
    });

    it("is antisymmetric: swapping sides mirrors the winrate", () => {
        const a = analyzeDraft(patch, full, ally(), enemy(), config);
        const b = analyzeDraft(patch, full, enemy(), ally(), config);
        expect(a.totalRating).toBeCloseTo(-b.totalRating, 9);
        expect(a.winrate + b.winrate).toBeCloseTo(1, 9);
    });

    it("trusts small samples more at higher risk levels", () => {
        const ratings = (
            ["very-low", "low", "medium", "high", "very-high"] as const
        ).map(
            (riskLevel) =>
                analyzeDraft(patch, full, ally(), enemy(), { ...config, riskLevel })
                    .allyDuoRating.totalRating,
        );
        // The duo sample is above its expectation, so less prior => more credit.
        for (let i = 1; i < ratings.length; i++) {
            expect(ratings[i]).toBeGreaterThan(ratings[i - 1]);
        }
    });
});
