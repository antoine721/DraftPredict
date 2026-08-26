import { clampScore, type BaselineMetric } from "./baselines.js";
import {
    averageMetrics,
    weightedScore,
    type AnalyzedGame,
    type GameMetrics,
} from "./metrics.js";
import {
    type AxisDetail,
    type AxisInput,
    type AxisScores,
    type MetricAxis,
    type PlaystyleAxis,
} from "./types.js";

/**
 * How each axis is built from the per-game metrics.
 *
 * Every metric is first normalised against the role baseline (0-100, 50 = an
 * average game for that role), then averaged over the analysed games, then
 * combined with these weights. Weights sum to 1 per axis.
 */
export const AXIS_METRIC_WEIGHTS: Record<
    MetricAxis,
    Partial<Record<BaselineMetric, number>>
> = {
    aggression: {
        killParticipation: 0.3,
        kaPerMinute: 0.25,
        damageShare: 0.3,
        soloKillsPerGame: 0.15,
    },
    farming: {
        csPerMinute: 0.45,
        goldPerMinute: 0.35,
        goldShare: 0.2,
    },
    vision: {
        visionScorePerMinute: 0.45,
        wardsPlacedPerMinute: 0.2,
        wardsKilledPerMinute: 0.15,
        controlWardsPerGame: 0.2,
    },
    objectives: {
        objectiveParticipation: 0.45,
        objectiveDamagePerMinute: 0.3,
        turretDamagePerMinute: 0.25,
    },
    survivability: {
        deathsPerMinute: 0.4,
        deathShare: 0.25,
        kda: 0.35,
    },
    teamplay: {
        assistRatio: 0.45,
        damageTakenShare: 0.3,
        healShieldPerMinute: 0.25,
    },
};

export const METRIC_AXES = Object.keys(AXIS_METRIC_WEIGHTS) as MetricAxis[];

/** Games at or under this length count as "short" for the scaling axis. */
export const SHORT_GAME_SECONDS = 25 * 60;
/** Games at or over this length count as "long" for the scaling axis. */
export const LONG_GAME_SECONDS = 35 * 60;

/** Below this many games every axis is flagged as low confidence. */
export const MIN_CONFIDENT_GAMES = 5;

export const neutralAxes = (): AxisScores => ({
    aggression: 50,
    farming: 50,
    vision: 50,
    objectives: 50,
    survivability: 50,
    teamplay: 50,
    consistency: 50,
    scaling: 50,
});

const AXIS_LABELS: Record<PlaystyleAxis, string> = {
    aggression: "Aggression",
    farming: "Farming",
    vision: "Vision",
    objectives: "Objectives",
    survivability: "Survivability",
    teamplay: "Teamplay",
    consistency: "Consistency",
    scaling: "Scaling",
};

export function axisLabel(axis: PlaystyleAxis): string {
    return AXIS_LABELS[axis];
}

/**
 * Population standard deviation. Used for the consistency axis, where the
 * sample *is* the whole set of analysed games.
 */
export function standardDeviation(values: readonly number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const variance =
        values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Consistency: how stable the per-game performance score is.
 *
 * `100 - 2.5 * stdev(performance)`, so a player swinging by ±20 points lands
 * at 50 and a metronome sits near 100. Needs at least 3 games to mean
 * anything; below that it stays neutral.
 */
export function consistencyScore(performances: readonly number[]): {
    score: number;
    stdev: number;
    lowConfidence: boolean;
} {
    if (performances.length < 3) {
        return { score: 50, stdev: 0, lowConfidence: true };
    }
    const stdev = standardDeviation(performances);
    return { score: clampScore(100 - 2.5 * stdev), stdev, lowConfidence: false };
}

export type ScalingBuckets = {
    short: { games: number; winrate: number; performance: number };
    long: { games: number; winrate: number; performance: number };
};

/**
 * Scaling: are long games better than short ones?
 *
 * Compares winrate and performance in games of 25 minutes or less against
 * games of 35 minutes or more:
 *
 * ```
 * delta   = 0.5 * (longWinrate - shortWinrate)
 *         + 0.5 * (longPerformance - shortPerformance) / 25
 * scaling = 50 + 50 * clamp(delta, -1, 1)
 * ```
 *
 * With one of the two buckets empty there is nothing to compare, so the score
 * stays neutral and is flagged as low confidence.
 */
export function scalingScore(games: readonly AnalyzedGame[]): {
    score: number;
    lowConfidence: boolean;
    buckets: ScalingBuckets;
} {
    const shortGames = games.filter(
        (game) => game.summary.durationSeconds <= SHORT_GAME_SECONDS,
    );
    const longGames = games.filter(
        (game) => game.summary.durationSeconds >= LONG_GAME_SECONDS,
    );
    const buckets: ScalingBuckets = {
        short: bucketStats(shortGames),
        long: bucketStats(longGames),
    };
    if (shortGames.length === 0 || longGames.length === 0) {
        return { score: 50, lowConfidence: true, buckets };
    }
    const delta =
        0.5 * (buckets.long.winrate - buckets.short.winrate) +
        0.5 * ((buckets.long.performance - buckets.short.performance) / 25);
    const bounded = Math.min(1, Math.max(-1, delta));
    return {
        score: clampScore(50 + 50 * bounded),
        lowConfidence: shortGames.length < 2 || longGames.length < 2,
        buckets,
    };
}

function bucketStats(games: readonly AnalyzedGame[]): {
    games: number;
    winrate: number;
    performance: number;
} {
    if (games.length === 0) return { games: 0, winrate: 0, performance: 0 };
    const wins = games.filter((game) => game.summary.win).length;
    const performance =
        games.reduce((total, game) => total + game.performance, 0) / games.length;
    return { games: games.length, winrate: wins / games.length, performance };
}

/** The six metric axes for a set of games (no consistency/scaling). */
export function computeMetricAxes(games: readonly AnalyzedGame[]): Record<MetricAxis, number> {
    const normalized = averageMetrics(games.map((game) => game.normalized));
    const scores = {} as Record<MetricAxis, number>;
    for (const axis of METRIC_AXES) {
        scores[axis] =
            games.length === 0
                ? 50
                : clampScore(weightedScore(normalized, AXIS_METRIC_WEIGHTS[axis]));
    }
    return scores;
}

/** Full 8-axis vector for a set of games. */
export function computeAxes(games: readonly AnalyzedGame[]): AxisScores {
    if (games.length === 0) return neutralAxes();
    const metricAxes = computeMetricAxes(games);
    const performances = games.map((game) => game.performance);
    return {
        ...metricAxes,
        consistency: consistencyScore(performances).score,
        scaling: scalingScore(games).score,
    };
}

/** Axis scores plus the inputs and prose that explain them. */
export function computeAxisDetails(games: readonly AnalyzedGame[]): {
    axes: AxisScores;
    details: Record<PlaystyleAxis, AxisDetail>;
} {
    const rawAverage = averageMetrics(games.map((game) => game.metrics));
    const normalizedAverage = averageMetrics(games.map((game) => game.normalized));
    const performances = games.map((game) => game.performance);
    const consistency = consistencyScore(performances);
    const scaling = scalingScore(games);
    const lowSample = games.length < MIN_CONFIDENT_GAMES;

    const axes = neutralAxes();
    const details = {} as Record<PlaystyleAxis, AxisDetail>;

    for (const axis of METRIC_AXES) {
        const weights = AXIS_METRIC_WEIGHTS[axis];
        const inputs = toInputs(weights, rawAverage, normalizedAverage);
        const score =
            games.length === 0 ? 50 : clampScore(weightedScore(normalizedAverage, weights));
        axes[axis] = score;
        details[axis] = {
            axis,
            score,
            sampleSize: games.length,
            lowConfidence: lowSample,
            inputs,
            description: describeAxis(axis, score, inputs),
        };
    }

    axes.consistency = games.length === 0 ? 50 : consistency.score;
    details.consistency = {
        axis: "consistency",
        score: axes.consistency,
        sampleSize: games.length,
        lowConfidence: consistency.lowConfidence || lowSample,
        inputs: [],
        description:
            games.length < 3
                ? "Not enough games to measure how stable performances are."
                : `Per-game performance swings by ±${consistency.stdev.toFixed(1)} points ` +
                  `around an average of ${average(performances).toFixed(0)}/100.`,
    };

    axes.scaling = games.length === 0 ? 50 : scaling.score;
    details.scaling = {
        axis: "scaling",
        score: axes.scaling,
        sampleSize: scaling.buckets.short.games + scaling.buckets.long.games,
        lowConfidence: scaling.lowConfidence || lowSample,
        inputs: [],
        description: scaling.lowConfidence
            ? "Not enough short and long games to compare early and late game impact."
            : `${percent(scaling.buckets.long.winrate)} winrate in games over 35 min ` +
              `versus ${percent(scaling.buckets.short.winrate)} in games under 25 min.`,
    };

    return { axes, details };
}

function toInputs(
    weights: Partial<Record<BaselineMetric, number>>,
    raw: GameMetrics,
    normalized: GameMetrics,
): AxisInput[] {
    return (Object.entries(weights) as [BaselineMetric, number][]).map(
        ([metric, weight]) => ({
            metric,
            weight,
            raw: raw[metric] ?? 0,
            score: normalized[metric] ?? 50,
        }),
    );
}

function describeAxis(
    axis: PlaystyleAxis,
    score: number,
    inputs: readonly AxisInput[],
): string {
    const sorted = [...inputs].sort(
        (a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50),
    );
    const top = sorted[0];
    const direction = score >= 60 ? "above" : score <= 40 ? "below" : "around";
    const head = `${axisLabel(axis)} ${score.toFixed(0)}/100 — ${direction} the role baseline`;
    if (!top) return `${head}.`;
    return `${head}, driven by ${humanMetric(top.metric)} (${top.score.toFixed(0)}/100).`;
}

const METRIC_NAMES: Record<BaselineMetric, string> = {
    killParticipation: "kill participation",
    kaPerMinute: "kills+assists per minute",
    damageShare: "damage share",
    soloKillsPerGame: "solo kills",
    csPerMinute: "CS per minute",
    goldPerMinute: "gold per minute",
    goldShare: "gold share",
    visionScorePerMinute: "vision score per minute",
    wardsPlacedPerMinute: "wards placed per minute",
    wardsKilledPerMinute: "wards cleared per minute",
    controlWardsPerGame: "control wards",
    objectiveParticipation: "objective participation",
    objectiveDamagePerMinute: "objective damage",
    turretDamagePerMinute: "turret damage",
    deathsPerMinute: "deaths per minute",
    deathShare: "death share",
    kda: "KDA",
    assistRatio: "assist ratio",
    damageTakenShare: "damage taken share",
    healShieldPerMinute: "healing and shielding",
};

export function humanMetric(metric: BaselineMetric): string {
    return METRIC_NAMES[metric];
}

function average(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((total, value) => total + value, 0) / values.length;
}

function percent(value: number): string {
    return `${Math.round(value * 100)}%`;
}
