import type { Role } from "@draftpredict/core";

import type { ChampionMasteryDto } from "../types/mastery.js";
import type { BaselineMetric, PlaystyleBaselines } from "./baselines.js";

/** The eight normalised 0-100 axes of a playstyle. */
export const PLAYSTYLE_AXES = [
    "aggression",
    "farming",
    "vision",
    "objectives",
    "survivability",
    "teamplay",
    "consistency",
    "scaling",
] as const;

export type PlaystyleAxis = (typeof PLAYSTYLE_AXES)[number];

/** Axes computed as a weighted mix of per-game metrics. */
export type MetricAxis = Exclude<PlaystyleAxis, "consistency" | "scaling">;

export type AxisScores = Record<PlaystyleAxis, number>;

export type AxisInput = {
    metric: BaselineMetric;
    weight: number;
    /** Average raw value across the analysed games. */
    raw: number;
    /** Average 0-100 value against the role baseline. */
    score: number;
};

export type AxisDetail = {
    axis: PlaystyleAxis;
    score: number;
    /** Games that contributed to the score. */
    sampleSize: number;
    /** Too few games (or missing buckets) for the score to mean much. */
    lowConfidence: boolean;
    inputs: AxisInput[];
    /** One-line English explanation of how the score was obtained. */
    description: string;
};

export type ArchetypeKey =
    | "hyper-carry"
    | "lane-bully"
    | "scaling-farmer"
    | "playmaker"
    | "vision-controller"
    | "frontline-anchor"
    | "split-pusher"
    | "all-rounder"
    | "unknown";

export type PlaystyleArchetype = {
    key: ArchetypeKey;
    /** English label; `labelKey` is the stable key the UI translates. */
    label: string;
    labelKey: string;
    /** Human readable justification built from the axis vector. */
    explanation: string;
    /** 0-1 — how far ahead of the runner-up this archetype scored. */
    confidence: number;
    runnerUp?: { key: ArchetypeKey; label: string };
};

export type PlaystyleTrait = {
    axis: PlaystyleAxis;
    labelKey: string;
    label: string;
    score: number;
    /** Distance from the role baseline (score - 50). */
    delta: number;
};

export type ChampionRoleGames = { role: Role; games: number };

export type ChampionPoolEntry = {
    championKey: string;
    championName: string;
    games: number;
    wins: number;
    losses: number;
    winrate: number;
    kda: number;
    /** Average per-game performance score, 0-100. */
    performance: number;
    roles: ChampionRoleGames[];
    masteryPoints?: number;
    masteryLevel?: number;
};

export type RoleDistributionEntry = {
    role: Role;
    games: number;
    /** Fraction of analysed games, 0-1. */
    share: number;
    wins: number;
    winrate: number;
};

export type MatchupEntry = {
    role: Role | null;
    championKey: string;
    championName: string;
    games: number;
    wins: number;
    losses: number;
    winrate: number;
    /** Laplace-smoothed winrate used for ranking, `(wins+1)/(games+2)`. */
    score: number;
};

export type FormGame = {
    matchId: string;
    championKey: string;
    championName: string;
    role: Role | null;
    win: boolean;
    kda: number;
    performance: number;
    gameStart: number;
};

export type PlaystyleForm = {
    /** Most recent games first. */
    games: FormGame[];
    streak: { type: "win" | "loss" | "none"; length: number };
    winrate: number;
    averagePerformance: number;
    /** Performance of the recent half minus the older half. */
    trend: "improving" | "declining" | "stable";
    trendDelta: number;
};

export type PlaystyleBreakdown = {
    games: number;
    wins: number;
    winrate: number;
    axes: AxisScores;
    performance: number;
};

export type RoleBreakdown = PlaystyleBreakdown & { role: Role };

export type ChampionBreakdown = PlaystyleBreakdown & {
    championKey: string;
    championName: string;
};

export type PlaystyleTotals = {
    games: number;
    wins: number;
    losses: number;
    winrate: number;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    killParticipation: number;
    damageShare: number;
    csPerMinute: number;
    visionScorePerMinute: number;
    goldPerMinute: number;
    averageDurationMinutes: number;
};

export type PlaystyleProfile = {
    puuid?: string;
    /** Games that passed the filters. */
    matchesAnalyzed: number;
    /** Games dropped (remakes, wrong queue, too short). */
    matchesExcluded: number;
    /** Fewer than {@link MIN_CONFIDENT_GAMES} games. */
    lowConfidence: boolean;
    primaryRole: Role | null;
    axes: AxisScores;
    axisDetails: Record<PlaystyleAxis, AxisDetail>;
    archetype: PlaystyleArchetype;
    strengths: PlaystyleTrait[];
    weaknesses: PlaystyleTrait[];
    championPool: ChampionPoolEntry[];
    roleDistribution: RoleDistributionEntry[];
    matchups: { best: MatchupEntry[]; worst: MatchupEntry[] };
    form: PlaystyleForm;
    byRole: RoleBreakdown[];
    byChampion: ChampionBreakdown[];
    totals: PlaystyleTotals;
};

export type ProfilePlaystyleOptions = {
    /** Only used to label the profile; summaries are already player-scoped. */
    puuid?: string;
    /** Champion mastery, either the raw DTOs or `championKey -> points`. */
    mastery?: readonly ChampionMasteryDto[] | Record<string, number>;
    /** Drop remakes and early surrenders. Default `true`. */
    excludeRemakes?: boolean;
    /** Drop games shorter than this. Default 300 seconds. */
    minDurationSeconds?: number;
    /** Keep only these queue ids. Default: every queue. */
    queues?: readonly number[];
    /** Games considered "recent" for form/streak. Default 10. */
    formGames?: number;
    /** Cap on `championPool` entries. Default 15. */
    maxChampionPool?: number;
    /** Cap on best/worst matchup entries. Default 5. */
    maxMatchups?: number;
    /** Override the role baselines (the pipeline can measure real ones). */
    baselines?: PlaystyleBaselines;
};
