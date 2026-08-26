import { ROLES, Role } from "@draftpredict/core";
import { beforeEach, describe, expect, it } from "vitest";

import { makeSummary, resetFixtureCounter } from "../testing/fixtures.js";
import {
    AXIS_METRIC_WEIGHTS,
    METRIC_AXES,
    computeAxes,
    computeAxisDetails,
    consistencyScore,
    scalingScore,
    standardDeviation,
} from "./axes.js";
import {
    BASELINE_METRICS,
    DEFAULT_BASELINES,
    normalizeMetric,
} from "./baselines.js";
import {
    computeGameMetrics,
    normalizeGameMetrics,
    performanceScore,
    type AnalyzedGame,
} from "./metrics.js";
import type { SummaryOptions } from "../testing/fixtures.js";
import type { MatchSummary } from "../match/summary.js";

beforeEach(() => {
    resetFixtureCounter();
});

function analyze(summary: MatchSummary, role = summary.role ?? Role.Middle): AnalyzedGame {
    const metrics = computeGameMetrics(summary);
    const normalized = normalizeGameMetrics(metrics, role, DEFAULT_BASELINES);
    return {
        summary,
        role,
        metrics,
        normalized,
        performance: performanceScore(normalized),
    };
}

const game = (options: SummaryOptions): AnalyzedGame => analyze(makeSummary(options));

describe("baselines", () => {
    it("covers every role and every metric", () => {
        for (const role of ROLES) {
            const baseline = DEFAULT_BASELINES[role];
            for (const metric of BASELINE_METRICS) {
                expect(baseline[metric], `${role}/${metric}`).toBeDefined();
                expect(Number.isFinite(baseline[metric].p50)).toBe(true);
                expect(baseline[metric].p90).not.toBe(baseline[metric].p50);
            }
        }
    });

    it("maps p50 to 50 and p90 to 100, clamped at both ends", () => {
        const baseline = { p50: 6, p90: 8 };
        expect(normalizeMetric(6, baseline)).toBe(50);
        expect(normalizeMetric(8, baseline)).toBe(100);
        expect(normalizeMetric(7, baseline)).toBe(75);
        expect(normalizeMetric(4, baseline)).toBe(0);
        expect(normalizeMetric(100, baseline)).toBe(100);
    });

    it("inverts direction when p90 < p50 (deaths are better when low)", () => {
        const deaths = DEFAULT_BASELINES[Role.Middle].deathsPerMinute;
        expect(deaths.p90).toBeLessThan(deaths.p50);
        expect(normalizeMetric(deaths.p50, deaths)).toBe(50);
        expect(normalizeMetric(deaths.p90, deaths)).toBe(100);
        expect(normalizeMetric(deaths.p50 * 2, deaths)).toBeLessThan(50);
    });

    it("judges the same game differently depending on the role", () => {
        const supportish = makeSummary({ csPerMinute: 2, visionScorePerMinute: 2.4 });
        const asSupport = analyze(supportish, Role.Support);
        const asBottom = analyze(supportish, Role.Bottom);
        expect(asSupport.normalized.csPerMinute).toBeGreaterThan(
            asBottom.normalized.csPerMinute,
        );
        expect(asSupport.normalized.visionScorePerMinute).toBeLessThan(100);
        expect(asBottom.normalized.visionScorePerMinute).toBe(100);
    });
});

describe("axis weights", () => {
    it("weights sum to one on every metric axis", () => {
        for (const axis of METRIC_AXES) {
            const total = Object.values(AXIS_METRIC_WEIGHTS[axis]).reduce(
                (sum, weight) => sum + (weight ?? 0),
                0,
            );
            expect(total, axis).toBeCloseTo(1, 10);
        }
    });

    it("gives a perfectly average player 50 everywhere", () => {
        const baseline = DEFAULT_BASELINES[Role.Middle];
        const average = game({
            role: Role.Middle,
            killParticipation: baseline.killParticipation.p50,
            kills: baseline.kaPerMinute.p50 * 30 * (1 - baseline.assistRatio.p50),
            assists: baseline.kaPerMinute.p50 * 30 * baseline.assistRatio.p50,
            deaths: baseline.deathsPerMinute.p50 * 30,
            deathShare: baseline.deathShare.p50,
            damageShare: baseline.damageShare.p50,
            soloKills: baseline.soloKillsPerGame.p50,
            csPerMinute: baseline.csPerMinute.p50,
            goldPerMinute: baseline.goldPerMinute.p50,
            goldShare: baseline.goldShare.p50,
            visionScorePerMinute: baseline.visionScorePerMinute.p50,
            wardsPlaced: baseline.wardsPlacedPerMinute.p50 * 30,
            wardsKilled: baseline.wardsKilledPerMinute.p50 * 30,
            controlWards: baseline.controlWardsPerGame.p50,
            objectiveParticipation: baseline.objectiveParticipation.p50,
            objectiveDamagePerMinute: baseline.objectiveDamagePerMinute.p50,
            turretDamagePerMinute: baseline.turretDamagePerMinute.p50,
            damageTakenShare: baseline.damageTakenShare.p50,
            healShieldPerMinute: baseline.healShieldPerMinute.p50,
        });
        for (const axis of METRIC_AXES) {
            const value = computeAxes([average])[axis];
            // KDA is derived from kills/deaths/assists, so allow a little slack.
            expect(value, axis).toBeGreaterThan(40);
            expect(value, axis).toBeLessThan(62);
        }
    });

    it("moves the right axis when a single metric moves", () => {
        const base = game({ role: Role.Middle });
        const farmer = game({ role: Role.Middle, csPerMinute: 10, goldPerMinute: 520 });
        expect(computeAxes([farmer]).farming).toBeGreaterThan(
            computeAxes([base]).farming,
        );

        const warden = game({
            role: Role.Middle,
            visionScorePerMinute: 1.6,
            wardsPlaced: 40,
            controlWards: 8,
        });
        expect(computeAxes([warden]).vision).toBeGreaterThan(
            computeAxes([base]).vision,
        );

        const feeder = game({ role: Role.Middle, deaths: 12, deathShare: 0.4 });
        expect(computeAxes([feeder]).survivability).toBeLessThan(
            computeAxes([base]).survivability,
        );
    });
});

describe("consistency", () => {
    it("needs at least three games", () => {
        expect(consistencyScore([70, 70])).toMatchObject({
            score: 50,
            lowConfidence: true,
        });
    });

    it("rewards stable performances", () => {
        expect(consistencyScore([60, 60, 60]).score).toBe(100);
        expect(consistencyScore([20, 60, 100]).score).toBeLessThan(
            consistencyScore([50, 60, 70]).score,
        );
    });

    it("computes a population standard deviation", () => {
        expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 10);
        expect(standardDeviation([])).toBe(0);
    });
});

describe("scaling", () => {
    it("stays neutral without both short and long games", () => {
        const games = [game({ durationSeconds: 1_500 })];
        expect(scalingScore(games)).toMatchObject({
            score: 50,
            lowConfidence: true,
        });
    });

    it("rewards winning the long games", () => {
        const games = [
            game({ durationSeconds: 1_400, win: false }),
            game({ durationSeconds: 1_400, win: false }),
            game({ durationSeconds: 2_300, win: true }),
            game({ durationSeconds: 2_300, win: true }),
        ];
        const result = scalingScore(games);
        expect(result.score).toBeGreaterThan(60);
        expect(result.lowConfidence).toBe(false);
        expect(result.buckets.short.games).toBe(2);
        expect(result.buckets.long.games).toBe(2);
    });

    it("punishes fading in long games", () => {
        const games = [
            game({ durationSeconds: 1_400, win: true }),
            game({ durationSeconds: 2_300, win: false }),
        ];
        expect(scalingScore(games).score).toBeLessThan(40);
    });
});

describe("computeAxisDetails", () => {
    it("returns neutral axes and prose for an empty sample", () => {
        const { axes, details } = computeAxisDetails([]);
        for (const value of Object.values(axes)) expect(value).toBe(50);
        expect(details.consistency.lowConfidence).toBe(true);
        expect(details.scaling.description).toMatch(/Not enough/);
    });

    it("explains each axis with its strongest input", () => {
        const { details } = computeAxisDetails([
            game({
                role: Role.Support,
                visionScorePerMinute: 3.5,
                wardsPlaced: 60,
                wardsKilled: 20,
                controlWards: 12,
            }),
        ]);
        expect(details.vision.score).toBeGreaterThan(80);
        expect(details.vision.inputs.length).toBeGreaterThan(0);
        expect(details.vision.description).toContain("vision score per minute");
        expect(details.vision.sampleSize).toBe(1);
        expect(details.vision.lowConfidence).toBe(true);
    });
});
