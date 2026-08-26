import { PLAYSTYLE_AXES, type AxisScores, type PlaystyleAxis, type PlaystyleTrait } from "./types.js";

/**
 * English labels for the strengths and weaknesses list.
 *
 * `labelKey` is the stable identifier the UI translates (the product ships in
 * French first); `label` is a readable fallback.
 */
const STRENGTH_LABELS: Record<PlaystyleAxis, string> = {
    aggression: "Aggressive damage threat",
    farming: "Excellent farmer",
    vision: "Vision controller",
    objectives: "Objective focused",
    survivability: "Hard to kill",
    teamplay: "Team player",
    consistency: "Consistent performer",
    scaling: "Strong late game",
};

const WEAKNESS_LABELS: Record<PlaystyleAxis, string> = {
    aggression: "Passive in fights",
    farming: "Low income",
    vision: "Neglects vision",
    objectives: "Misses objectives",
    survivability: "Dies too often",
    teamplay: "Plays alone",
    consistency: "Inconsistent games",
    scaling: "Fades in long games",
};

/** Score at or above which an axis counts as a strength. */
export const STRENGTH_THRESHOLD = 58;
/** Score at or below which an axis counts as a weakness. */
export const WEAKNESS_THRESHOLD = 42;

export function strengthLabel(axis: PlaystyleAxis): string {
    return STRENGTH_LABELS[axis];
}

export function weaknessLabel(axis: PlaystyleAxis): string {
    return WEAKNESS_LABELS[axis];
}

function trait(axis: PlaystyleAxis, score: number, kind: "strength" | "weakness"): PlaystyleTrait {
    return {
        axis,
        labelKey: `playstyle.${kind}.${axis}`,
        label: kind === "strength" ? strengthLabel(axis) : weaknessLabel(axis),
        score,
        delta: score - 50,
    };
}

/** The `limit` highest axes above {@link STRENGTH_THRESHOLD}. */
export function pickStrengths(axes: AxisScores, limit = 3): PlaystyleTrait[] {
    return [...PLAYSTYLE_AXES]
        .map((axis) => ({ axis, score: axes[axis] }))
        .filter((entry) => entry.score >= STRENGTH_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((entry) => trait(entry.axis, entry.score, "strength"));
}

/** The `limit` lowest axes below {@link WEAKNESS_THRESHOLD}. */
export function pickWeaknesses(axes: AxisScores, limit = 3): PlaystyleTrait[] {
    return [...PLAYSTYLE_AXES]
        .map((axis) => ({ axis, score: axes[axis] }))
        .filter((entry) => entry.score <= WEAKNESS_THRESHOLD)
        .sort((a, b) => a.score - b.score)
        .slice(0, limit)
        .map((entry) => trait(entry.axis, entry.score, "weakness"));
}
