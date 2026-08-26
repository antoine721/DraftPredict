import { describe, expect, it } from "vitest";
import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    BuildMatchupData,
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset.js";
import { Role } from "../models/Role.js";
import { winrateToRating } from "../rating/ratings.js";
import { buildPriorGamesByRiskLevel } from "../risk/risk-level.js";
import { emptyFullBuildDataset, emptyPartialBuildDataset } from "./data.js";
import {
    analyzeBaseEntity,
    analyzeEntity,
    analyzeEntityMatchup,
} from "./entity-analysis.js";

const config: AnalyzeDraftConfig = {
    ignoreChampionWinrates: false,
    riskLevel: "medium",
    minGames: 0,
};
const PRIOR = buildPriorGamesByRiskLevel.medium; // 1000

/** The "entity" here is just a key into a summoner-spell style record. */
const getStats = (dataset: PartialBuildDataset, id: string) =>
    dataset.summonerSpells[id] ?? { wins: 0, games: 0 };

function makePartial(): PartialBuildDataset {
    const dataset = emptyPartialBuildDataset("1", Role.Top);
    dataset.games = 1000;
    dataset.wins = 500;
    dataset.summonerSpells = {
        good: { games: 400, wins: 240 },
        bad: { games: 100, wins: 30 },
    };
    return dataset;
}

function makeMatchup(overrides: Partial<BuildMatchupData> = {}): BuildMatchupData {
    return {
        ...emptyPartialBuildDataset("2", Role.Top),
        championKey: "2",
        role: Role.Top,
        games: 500,
        wins: 250,
        summonerSpells: { good: { games: 200, wins: 130 } },
        ...overrides,
    };
}

function makeFull(matchups: BuildMatchupData[] = []): FullBuildDataset {
    const dataset = emptyFullBuildDataset("1", Role.Top, matchups);
    dataset.games = 4000;
    dataset.wins = 2000;
    dataset.summonerSpells = {
        good: { games: 1600, wins: 880 },
        bad: { games: 400, wins: 140 },
    };
    return dataset;
}

describe("analyzeBaseEntity", () => {
    it("rates an entity against the champion's own winrate", () => {
        const partial = makePartial();
        const full = makeFull();

        // prior winrate = 880/1600 = 0.55
        // stats = (240 + 1000*0.55) / (400 + 1000) = 790/1400
        const expected = winrateToRating(790 / 1400) - winrateToRating(500 / 1000);
        expect(
            analyzeBaseEntity(partial, full, config, getStats, "good").rating,
        ).toBeCloseTo(expected, 12);
        expect(PRIOR).toBe(1000);
    });

    it("punishes an entity that underperforms", () => {
        const partial = makePartial();
        const full = makeFull();
        expect(
            analyzeBaseEntity(partial, full, config, getStats, "bad").rating,
        ).toBeLessThan(0);
        expect(
            analyzeBaseEntity(partial, full, config, getStats, "good").rating,
        ).toBeGreaterThan(0);
    });

    it("yields NaN when the 30-day sample is empty, as DraftGap does", () => {
        const partial = makePartial();
        const full = makeFull();
        full.summonerSpells = {};
        expect(
            analyzeBaseEntity(partial, full, config, getStats, "good").rating,
        ).toBeNaN();
    });
});

describe("analyzeEntityMatchup", () => {
    it("measures the entity's rating in a matchup against its overall rating", () => {
        const partial = makePartial();
        const full = makeFull();
        const matchup = makeMatchup();

        const result = analyzeEntityMatchup(
            partial,
            full,
            config,
            getStats,
            "good",
            matchup,
        );

        expect(result.championKey).toBe("2");
        expect(result.role).toBe(Role.Top);
        expect(result.raw).toEqual({ games: 200, wins: 130 });
        // The entity does better in this matchup (65%) than the 55% it manages
        // overall against an even matchup, so the rating is positive.
        expect(result.rating).toBeGreaterThan(0);
        expect(result.expected).toBeGreaterThan(0.5);
    });

    it("reports a rating of 0 rather than NaN when data is missing", () => {
        const partial = makePartial();
        const full = makeFull();
        const matchup = makeMatchup({ summonerSpells: {}, games: 0, wins: 0 });

        const result = analyzeEntityMatchup(
            partial,
            full,
            config,
            getStats,
            "good",
            matchup,
        );
        expect(result.rating).toBe(0);
        expect(result.games).toBe(0);
    });
});

describe("analyzeEntity", () => {
    it("adds the base rating to every matchup rating", () => {
        const partial = makePartial();
        const matchups = [makeMatchup(), makeMatchup({ championKey: "3" })];
        const full = makeFull(matchups);

        const result = analyzeEntity(partial, full, config, getStats, "good");

        expect(result.matchupResult.matchupResults).toHaveLength(2);
        expect(result.totalRating).toBeCloseTo(
            result.baseResult.rating + result.matchupResult.totalRating,
            12,
        );
        expect(result.matchupResult.totalRating).toBeCloseTo(
            result.matchupResult.matchupResults.reduce((a, r) => a + r.rating, 0),
            12,
        );
    });

    it("reduces to the base rating with no matchups", () => {
        const partial = makePartial();
        const full = makeFull();
        const result = analyzeEntity(partial, full, config, getStats, "good");
        expect(result.matchupResult.totalRating).toBe(0);
        expect(result.totalRating).toBe(result.baseResult.rating);
    });

    it("uses more prior games at lower risk levels", () => {
        const partial = makePartial();
        const full = makeFull();
        const ratings = (["very-low", "medium", "very-high"] as const).map(
            (riskLevel) =>
                analyzeEntity(partial, full, { ...config, riskLevel }, getStats, "good")
                    .baseResult.rating,
        );
        // "good" is above its prior, so less prior => stronger rating.
        expect(ratings[0]).toBeLessThan(ratings[1]);
        expect(ratings[1]).toBeLessThan(ratings[2]);
    });
});
