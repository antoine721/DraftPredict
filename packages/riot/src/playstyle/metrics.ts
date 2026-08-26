import { Role } from "@draftpredict/core";

import type { MatchSummary } from "../match/summary.js";
import {
    BASELINE_METRICS,
    baselineFor,
    normalizeMetric,
    type BaselineMetric,
    type PlaystyleBaselines,
} from "./baselines.js";

export type GameMetrics = Record<BaselineMetric, number>;

/** Raw per-game metric values, all in the metric's natural unit. */
export function computeGameMetrics(summary: MatchSummary): GameMetrics {
    const minutes = summary.durationMinutes > 0 ? summary.durationMinutes : 1;
    const takedowns = summary.kills + summary.assists;
    return {
        killParticipation: summary.killParticipation,
        kaPerMinute: takedowns / minutes,
        damageShare: summary.damageShare,
        soloKillsPerGame: summary.soloKills,
        csPerMinute: summary.csPerMinute,
        goldPerMinute: summary.goldPerMinute,
        goldShare: summary.goldShare,
        visionScorePerMinute: summary.vision.scorePerMinute,
        wardsPlacedPerMinute: summary.vision.wardsPlaced / minutes,
        wardsKilledPerMinute: summary.vision.wardsKilled / minutes,
        controlWardsPerGame: summary.vision.controlWardsPlaced,
        objectiveParticipation: summary.objectives.participation,
        objectiveDamagePerMinute: summary.damage.toObjectives / minutes,
        turretDamagePerMinute: summary.damage.toTurrets / minutes,
        deathsPerMinute: summary.deaths / minutes,
        deathShare: summary.deathShare,
        kda: summary.kda,
        assistRatio: takedowns > 0 ? summary.assists / takedowns : 0,
        damageTakenShare: summary.damageTakenShare,
        healShieldPerMinute: summary.healingAndShielding / minutes,
    };
}

/** The same metrics mapped onto the 0-100 scale of the player's role. */
export function normalizeGameMetrics(
    metrics: GameMetrics,
    role: Role,
    baselines: PlaystyleBaselines,
): GameMetrics {
    const baseline = baselineFor(baselines, role);
    const normalized = {} as GameMetrics;
    for (const metric of BASELINE_METRICS) {
        normalized[metric] = normalizeMetric(metrics[metric], baseline[metric]);
    }
    return normalized;
}

/** Element-wise mean; an empty list yields the neutral 50 vector. */
export function averageMetrics(list: readonly GameMetrics[]): GameMetrics {
    const average = {} as GameMetrics;
    for (const metric of BASELINE_METRICS) {
        if (list.length === 0) {
            average[metric] = 0;
            continue;
        }
        let total = 0;
        for (const entry of list) total += entry[metric];
        average[metric] = total / list.length;
    }
    return average;
}

/** One analysed game: raw and normalised metrics plus its resolved role. */
export type AnalyzedGame = {
    summary: MatchSummary;
    role: Role;
    metrics: GameMetrics;
    normalized: GameMetrics;
    performance: number;
};

/**
 * Weights of the per-game performance score (0-100), the scalar used for
 * consistency, scaling, form and the per-champion breakdowns.
 */
export const PERFORMANCE_WEIGHTS: Partial<Record<BaselineMetric, number>> = {
    killParticipation: 0.2,
    damageShare: 0.2,
    kda: 0.2,
    csPerMinute: 0.15,
    goldPerMinute: 0.1,
    visionScorePerMinute: 0.1,
    objectiveParticipation: 0.05,
};

export function performanceScore(normalized: GameMetrics): number {
    return weightedScore(normalized, PERFORMANCE_WEIGHTS);
}

/** Weighted average of normalised metrics; weights need not sum to 1. */
export function weightedScore(
    normalized: GameMetrics,
    weights: Partial<Record<BaselineMetric, number>>,
): number {
    let total = 0;
    let sum = 0;
    for (const [metric, weight] of Object.entries(weights) as [
        BaselineMetric,
        number,
    ][]) {
        const value = normalized[metric];
        if (value === undefined || weight === undefined) continue;
        total += weight;
        sum += weight * value;
    }
    if (total === 0) return 50;
    return sum / total;
}

/** Fallback role when Riot could not tell us where the player was. */
export const FALLBACK_ROLE: Role = Role.Middle;
