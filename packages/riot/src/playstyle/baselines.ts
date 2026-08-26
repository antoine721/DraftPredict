import { Role } from "@draftpredict/core";

/**
 * Per-game metrics every playstyle axis is built from.
 *
 * A metric is always expressed the way it is measured (deaths per minute is a
 * count, not a "goodness"); the direction is encoded in the baseline itself —
 * see {@link MetricBaseline}.
 */
export const BASELINE_METRICS = [
    "killParticipation",
    "kaPerMinute",
    "damageShare",
    "soloKillsPerGame",
    "csPerMinute",
    "goldPerMinute",
    "goldShare",
    "visionScorePerMinute",
    "wardsPlacedPerMinute",
    "wardsKilledPerMinute",
    "controlWardsPerGame",
    "objectiveParticipation",
    "objectiveDamagePerMinute",
    "turretDamagePerMinute",
    "deathsPerMinute",
    "deathShare",
    "kda",
    "assistRatio",
    "damageTakenShare",
    "healShieldPerMinute",
] as const;

export type BaselineMetric = (typeof BASELINE_METRICS)[number];

/**
 * Two anchors per metric and per role:
 *
 * - `p50` — a median game for that role, normalised to **50**;
 * - `p90` — a strong game for that role, normalised to **100**.
 *
 * `p90 < p50` for metrics where less is better (deaths), which makes the
 * normalisation formula direction-agnostic:
 *
 * ```
 * score = clamp(50 + 50 * (value - p50) / (p90 - p50), 0, 100)
 * ```
 */
export type MetricBaseline = { p50: number; p90: number };

export type RoleBaseline = Record<BaselineMetric, MetricBaseline>;

export type PlaystyleBaselines = Record<Role, RoleBaseline>;

/**
 * Role-relative baselines.
 *
 * ⚠️ These numbers are **approximations** hand-derived from public aggregate
 * soloq statistics (Emerald+, ~30 minute games, recent patches). They are good
 * enough to place a player against players of the same role, but they are not
 * measured from a dataset. `apps/pipeline` is expected to recompute them from
 * ingested matches and feed them back through
 * `profilePlaystyle(summaries, { baselines })`.
 */
export const DEFAULT_BASELINES: PlaystyleBaselines = {
    [Role.Top]: {
        killParticipation: { p50: 0.48, p90: 0.62 },
        kaPerMinute: { p50: 0.35, p90: 0.52 },
        damageShare: { p50: 0.23, p90: 0.3 },
        soloKillsPerGame: { p50: 0.6, p90: 1.6 },
        csPerMinute: { p50: 6.4, p90: 8.1 },
        goldPerMinute: { p50: 375, p90: 450 },
        goldShare: { p50: 0.215, p90: 0.25 },
        visionScorePerMinute: { p50: 0.55, p90: 0.85 },
        wardsPlacedPerMinute: { p50: 0.35, p90: 0.6 },
        wardsKilledPerMinute: { p50: 0.1, p90: 0.22 },
        controlWardsPerGame: { p50: 1.4, p90: 3 },
        objectiveParticipation: { p50: 0.35, p90: 0.6 },
        objectiveDamagePerMinute: { p50: 250, p90: 450 },
        turretDamagePerMinute: { p50: 90, p90: 220 },
        deathsPerMinute: { p50: 0.19, p90: 0.1 },
        deathShare: { p50: 0.2, p90: 0.13 },
        kda: { p50: 2.4, p90: 4.5 },
        assistRatio: { p50: 0.55, p90: 0.7 },
        damageTakenShare: { p50: 0.26, p90: 0.34 },
        healShieldPerMinute: { p50: 15, p90: 60 },
    },
    [Role.Jungle]: {
        killParticipation: { p50: 0.58, p90: 0.72 },
        kaPerMinute: { p50: 0.42, p90: 0.6 },
        damageShare: { p50: 0.19, p90: 0.26 },
        soloKillsPerGame: { p50: 0.5, p90: 1.4 },
        csPerMinute: { p50: 5.4, p90: 7 },
        goldPerMinute: { p50: 370, p90: 440 },
        goldShare: { p50: 0.21, p90: 0.245 },
        visionScorePerMinute: { p50: 0.8, p90: 1.2 },
        wardsPlacedPerMinute: { p50: 0.5, p90: 0.85 },
        wardsKilledPerMinute: { p50: 0.25, p90: 0.45 },
        controlWardsPerGame: { p50: 2, p90: 4 },
        objectiveParticipation: { p50: 0.7, p90: 0.9 },
        objectiveDamagePerMinute: { p50: 700, p90: 1100 },
        turretDamagePerMinute: { p50: 60, p90: 150 },
        deathsPerMinute: { p50: 0.19, p90: 0.11 },
        deathShare: { p50: 0.2, p90: 0.13 },
        kda: { p50: 2.6, p90: 4.8 },
        assistRatio: { p50: 0.62, p90: 0.75 },
        damageTakenShare: { p50: 0.21, p90: 0.27 },
        healShieldPerMinute: { p50: 20, p90: 70 },
    },
    [Role.Middle]: {
        killParticipation: { p50: 0.55, p90: 0.68 },
        kaPerMinute: { p50: 0.42, p90: 0.6 },
        damageShare: { p50: 0.27, p90: 0.35 },
        soloKillsPerGame: { p50: 0.8, p90: 2 },
        csPerMinute: { p50: 7, p90: 8.7 },
        goldPerMinute: { p50: 400, p90: 480 },
        goldShare: { p50: 0.225, p90: 0.26 },
        visionScorePerMinute: { p50: 0.6, p90: 0.9 },
        wardsPlacedPerMinute: { p50: 0.35, p90: 0.6 },
        wardsKilledPerMinute: { p50: 0.1, p90: 0.22 },
        controlWardsPerGame: { p50: 1.6, p90: 3.2 },
        objectiveParticipation: { p50: 0.4, p90: 0.65 },
        objectiveDamagePerMinute: { p50: 220, p90: 420 },
        turretDamagePerMinute: { p50: 70, p90: 180 },
        deathsPerMinute: { p50: 0.19, p90: 0.11 },
        deathShare: { p50: 0.19, p90: 0.12 },
        kda: { p50: 2.8, p90: 5.2 },
        assistRatio: { p50: 0.52, p90: 0.66 },
        damageTakenShare: { p50: 0.17, p90: 0.22 },
        healShieldPerMinute: { p50: 15, p90: 60 },
    },
    [Role.Bottom]: {
        killParticipation: { p50: 0.55, p90: 0.68 },
        kaPerMinute: { p50: 0.42, p90: 0.6 },
        damageShare: { p50: 0.28, p90: 0.36 },
        soloKillsPerGame: { p50: 0.4, p90: 1.2 },
        csPerMinute: { p50: 7.6, p90: 9.2 },
        goldPerMinute: { p50: 420, p90: 500 },
        goldShare: { p50: 0.235, p90: 0.27 },
        visionScorePerMinute: { p50: 0.55, p90: 0.85 },
        wardsPlacedPerMinute: { p50: 0.3, p90: 0.55 },
        wardsKilledPerMinute: { p50: 0.1, p90: 0.2 },
        controlWardsPerGame: { p50: 1.2, p90: 2.6 },
        objectiveParticipation: { p50: 0.45, p90: 0.7 },
        objectiveDamagePerMinute: { p50: 320, p90: 600 },
        turretDamagePerMinute: { p50: 120, p90: 280 },
        deathsPerMinute: { p50: 0.18, p90: 0.1 },
        deathShare: { p50: 0.18, p90: 0.12 },
        kda: { p50: 3, p90: 5.6 },
        assistRatio: { p50: 0.45, p90: 0.6 },
        damageTakenShare: { p50: 0.15, p90: 0.2 },
        healShieldPerMinute: { p50: 10, p90: 40 },
    },
    [Role.Support]: {
        killParticipation: { p50: 0.6, p90: 0.74 },
        kaPerMinute: { p50: 0.45, p90: 0.65 },
        damageShare: { p50: 0.11, p90: 0.16 },
        soloKillsPerGame: { p50: 0.2, p90: 0.7 },
        csPerMinute: { p50: 1.1, p90: 2.2 },
        goldPerMinute: { p50: 260, p90: 320 },
        goldShare: { p50: 0.145, p90: 0.175 },
        visionScorePerMinute: { p50: 1.7, p90: 2.5 },
        wardsPlacedPerMinute: { p50: 1, p90: 1.6 },
        wardsKilledPerMinute: { p50: 0.3, p90: 0.55 },
        controlWardsPerGame: { p50: 4, p90: 8 },
        objectiveParticipation: { p50: 0.45, p90: 0.7 },
        objectiveDamagePerMinute: { p50: 90, p90: 220 },
        turretDamagePerMinute: { p50: 40, p90: 110 },
        deathsPerMinute: { p50: 0.25, p90: 0.15 },
        deathShare: { p50: 0.24, p90: 0.17 },
        kda: { p50: 2.8, p90: 5 },
        assistRatio: { p50: 0.8, p90: 0.9 },
        damageTakenShare: { p50: 0.17, p90: 0.24 },
        healShieldPerMinute: { p50: 120, p90: 300 },
    },
};

/** Maps a raw metric value onto the documented 0-100 scale. */
export function normalizeMetric(value: number, baseline: MetricBaseline): number {
    if (!Number.isFinite(value)) return 50;
    const span = baseline.p90 - baseline.p50;
    if (span === 0) return 50;
    return clampScore(50 + (50 * (value - baseline.p50)) / span);
}

export function clampScore(value: number): number {
    if (!Number.isFinite(value)) return 50;
    return Math.min(100, Math.max(0, value));
}

export function baselineFor(baselines: PlaystyleBaselines, role: Role): RoleBaseline {
    return baselines[role] ?? baselines[Role.Middle];
}
