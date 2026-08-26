import { describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import { ratingToWinrate, winrateToRating } from "../rating/ratings.js";
import { priorGamesByRiskLevel } from "../risk/risk-level.js";
import { makeDataset, makeTeam } from "../testing/fixtures.js";
import type { AnalyzeDraftConfig } from "./analysis.js";
import { analyzeDraft } from "./analysis.js";
import {
    analyzeDraftExtra,
    getDraftResultWinrateByTime,
    RATING_BY_TIME_BUCKETS,
} from "./extra-analysis.js";

const config: AnalyzeDraftConfig = {
    ignoreChampionWinrates: false,
    riskLevel: "medium",
    minGames: 0,
};
const PRIOR = priorGamesByRiskLevel.medium;

/** A late-game champion: 50% overall, but 70% in games that go long. */
const dataset = makeDataset([
    {
        key: "1",
        roles: {
            [Role.Top]: {
                games: 1000,
                wins: 500,
                statsByTime: [
                    { games: 100, wins: 30 },
                    { games: 100, wins: 40 },
                    { games: 100, wins: 50 },
                    { games: 100, wins: 60 },
                    { games: 100, wins: 70 },
                    { games: 100, wins: 80 },
                    { games: 100, wins: 90 },
                ],
            },
        },
    },
    { key: "2", roles: { [Role.Jungle]: { games: 1000, wins: 500 } } },
]);

describe("analyzeDraftExtra", () => {
    it("reports one bucket per tracked duration", () => {
        const extra = analyzeDraftExtra(
            dataset,
            dataset,
            makeTeam([[Role.Top, "1"]]),
            new Map(),
            config,
        );
        expect(extra.ratingByTime).toHaveLength(RATING_BY_TIME_BUCKETS);
        expect(RATING_BY_TIME_BUCKETS).toBe(5);
    });

    it("scales a champion up as the game gets longer", () => {
        const extra = analyzeDraftExtra(
            dataset,
            dataset,
            makeTeam([[Role.Top, "1"]]),
            new Map(),
            config,
        );
        const ratings = extra.ratingByTime.map((b) => b.totalRating);
        for (let i = 1; i < ratings.length; i++) {
            expect(ratings[i]).toBeGreaterThan(ratings[i - 1]);
        }
        expect(ratings[0]).toBeLessThan(0);
        expect(ratings[4]).toBeGreaterThan(0);
    });

    it("computes the first bucket by hand", () => {
        const extra = analyzeDraftExtra(
            dataset,
            dataset,
            makeTeam([[Role.Top, "1"]]),
            new Map(),
            config,
        );
        // base = (500 + 500) / (1000 + 1000) = 0.5
        // bucket 0 = (30 + 1000*0.5) / (100 + 1000) = 530/1100
        const expected = winrateToRating(530 / 1100) - winrateToRating(0.5);
        expect(extra.ratingByTime[0].totalRating).toBeCloseTo(expected, 12);
        expect(extra.ratingByTime[0].championResults).toEqual([
            { championKey: "1", role: Role.Top, rating: expect.any(Number) },
        ]);
    });

    it("gives a flat champion a rating of zero in every bucket", () => {
        const extra = analyzeDraftExtra(
            dataset,
            dataset,
            makeTeam([[Role.Jungle, "2"]]),
            new Map(),
            config,
        );
        // No time data at all: every bucket collapses to the base winrate.
        for (const bucket of extra.ratingByTime) {
            expect(bucket.totalRating).toBeCloseTo(0, 12);
        }
    });

    it("uses an empty champion for picks the dataset does not know", () => {
        const extra = analyzeDraftExtra(
            dataset,
            dataset,
            makeTeam([[Role.Top, "nope"]]),
            new Map(),
            config,
        );
        for (const bucket of extra.ratingByTime) {
            // 0/0 games everywhere, so both sides of the difference are the
            // prior's 50%.
            expect(bucket.totalRating).toBeCloseTo(0, 12);
        }
        expect(PRIOR).toBe(1000);
    });

    it("is empty for an empty team", () => {
        const extra = analyzeDraftExtra(dataset, dataset, new Map(), new Map(), config);
        for (const bucket of extra.ratingByTime) {
            expect(bucket.championResults).toEqual([]);
            expect(bucket.totalRating).toBe(0);
        }
    });
});

describe("getDraftResultWinrateByTime", () => {
    const team = makeTeam([[Role.Top, "1"]]);
    const enemy = makeTeam([[Role.Jungle, "2"]]);

    it("labels the buckets from 20 minutes in 5 minute steps", () => {
        const result = analyzeDraft(dataset, dataset, team, enemy, config);
        expect(
            getDraftResultWinrateByTime(dataset, result, team, enemy, config).map(
                (b) => b.duration,
            ),
        ).toEqual([20, 25, 30, 35, 40]);
    });

    it("adds the ally scaling and subtracts the enemy scaling", () => {
        const result = analyzeDraft(dataset, dataset, team, enemy, config);
        const allyExtra = analyzeDraftExtra(dataset, dataset, team, enemy, config);
        const enemyExtra = analyzeDraftExtra(dataset, dataset, enemy, team, config);

        const byTime = getDraftResultWinrateByTime(
            dataset,
            result,
            team,
            enemy,
            config,
        );
        byTime.forEach((bucket, i) => {
            expect(bucket.winrate).toBeCloseTo(
                ratingToWinrate(
                    result.totalRating +
                        allyExtra.ratingByTime[i].totalRating -
                        enemyExtra.ratingByTime[i].totalRating,
                ),
                12,
            );
        });
    });

    it("rises over time for a team with the late-game champion", () => {
        const result = analyzeDraft(dataset, dataset, team, enemy, config);
        const winrates = getDraftResultWinrateByTime(
            dataset,
            result,
            team,
            enemy,
            config,
        ).map((b) => b.winrate);

        for (let i = 1; i < winrates.length; i++) {
            expect(winrates[i]).toBeGreaterThan(winrates[i - 1]);
        }
    });

    it("mirrors when the sides are swapped", () => {
        const a = analyzeDraft(dataset, dataset, team, enemy, config);
        const b = analyzeDraft(dataset, dataset, enemy, team, config);
        const forward = getDraftResultWinrateByTime(dataset, a, team, enemy, config);
        const backward = getDraftResultWinrateByTime(dataset, b, enemy, team, config);

        forward.forEach((bucket, i) => {
            expect(bucket.winrate + backward[i].winrate).toBeCloseTo(1, 9);
        });
    });
});
