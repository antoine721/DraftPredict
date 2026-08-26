import { displayNameByRole, type Role } from "@draftpredict/core";

import { axisLabel } from "./axes.js";
import type {
    ArchetypeKey,
    AxisScores,
    PlaystyleArchetype,
    PlaystyleAxis,
} from "./types.js";

type ArchetypeDefinition = {
    key: ArchetypeKey;
    label: string;
    /** Weights applied to `(axis - 50)`; negative weights penalise an axis. */
    weights: Partial<Record<PlaystyleAxis, number>>;
    /** Flat bonus, used to make "all-rounder" the default. */
    bias: number;
    /** Sentence appended to the generated explanation. */
    summary: string;
};

/**
 * Archetypes are scored as a dot product between the axis vector (centred on
 * the role baseline, so `axis - 50`) and a weight vector. The best score wins;
 * `all-rounder` carries a flat bias so a perfectly average player lands there
 * instead of on a random archetype.
 */
export const ARCHETYPES: readonly ArchetypeDefinition[] = [
    {
        key: "hyper-carry",
        label: "Hyper-carry",
        weights: {
            aggression: 0.35,
            farming: 0.3,
            survivability: 0.2,
            scaling: 0.1,
            teamplay: -0.15,
        },
        bias: 0,
        summary:
            "You take the lion's share of the gold and the damage and expect the team to play around you.",
    },
    {
        key: "lane-bully",
        label: "Lane bully",
        weights: {
            aggression: 0.45,
            farming: 0.15,
            survivability: 0.1,
            scaling: -0.3,
        },
        bias: 0,
        summary:
            "You win by pressuring your opponent early; games that go long are worth less to you.",
    },
    {
        key: "scaling-farmer",
        label: "Scaling farmer",
        weights: {
            farming: 0.4,
            scaling: 0.35,
            survivability: 0.15,
            aggression: -0.2,
        },
        bias: 0,
        summary: "You farm safely, avoid early risk and let the game come to you.",
    },
    {
        key: "playmaker",
        label: "Playmaker",
        weights: {
            aggression: 0.3,
            teamplay: 0.35,
            vision: 0.15,
            farming: -0.2,
        },
        bias: 0,
        summary:
            "You roam and look for fights with your team rather than farming lanes.",
    },
    {
        key: "vision-controller",
        label: "Vision controller",
        weights: {
            vision: 0.5,
            teamplay: 0.25,
            objectives: 0.15,
            farming: -0.15,
        },
        bias: 0,
        summary:
            "You win the map before the fight starts: wards, sweeps and control wards.",
    },
    {
        key: "frontline-anchor",
        label: "Frontline anchor",
        weights: {
            teamplay: 0.35,
            objectives: 0.2,
            aggression: 0.15,
            survivability: -0.2,
        },
        bias: 0,
        summary:
            "You start fights and soak damage for the team, trading your own KDA for space.",
    },
    {
        key: "split-pusher",
        label: "Split-pusher",
        weights: {
            objectives: 0.35,
            farming: 0.3,
            teamplay: -0.3,
            vision: -0.1,
        },
        bias: 0,
        summary:
            "You create pressure in side lanes and take structures while the team holds mid.",
    },
    {
        key: "all-rounder",
        label: "All-rounder",
        weights: { consistency: 0.25 },
        bias: 4,
        summary: "No single axis dominates: you play a balanced, steady game.",
    },
];

function scoreArchetype(definition: ArchetypeDefinition, axes: AxisScores): number {
    let score = definition.bias;
    for (const [axis, weight] of Object.entries(definition.weights) as [
        PlaystyleAxis,
        number,
    ][]) {
        score += weight * (axes[axis] - 50);
    }
    return score;
}

/**
 * Picks the archetype that best matches an axis vector and explains the choice
 * with the two axes that contributed most to it.
 */
export function pickArchetype(
    axes: AxisScores,
    context: { role?: Role | null; games: number } = { games: 0 },
): PlaystyleArchetype {
    if (context.games === 0) {
        return {
            key: "unknown",
            label: "Not enough data",
            labelKey: "playstyle.archetype.unknown",
            explanation: "No analysable game found for this player.",
            confidence: 0,
        };
    }

    const ranked = ARCHETYPES.map((definition) => ({
        definition,
        score: scoreArchetype(definition, axes),
    })).sort((a, b) => b.score - a.score);

    const best = ranked[0]!;
    const second = ranked[1];
    const confidence = second
        ? Math.min(1, Math.max(0, (best.score - second.score) / 10))
        : 1;

    return {
        key: best.definition.key,
        label: best.definition.label,
        labelKey: `playstyle.archetype.${best.definition.key}`,
        explanation: explain(best.definition, axes, context.role ?? null),
        confidence,
        runnerUp: second
            ? { key: second.definition.key, label: second.definition.label }
            : undefined,
    };
}

function explain(
    definition: ArchetypeDefinition,
    axes: AxisScores,
    role: Role | null,
): string {
    const contributions = (
        Object.entries(definition.weights) as [PlaystyleAxis, number][]
    )
        .map(([axis, weight]) => ({
            axis,
            weight,
            contribution: weight * (axes[axis] - 50),
        }))
        .sort((a, b) => b.contribution - a.contribution);

    const reference =
        role === null ? "the average player" : `the average ${displayNameByRole[role]}`;
    const parts = contributions
        .filter((entry) => Math.abs(entry.contribution) >= 1)
        .slice(0, 2)
        .map((entry) => {
            const score = axes[entry.axis];
            const comparison =
                score >= 55 ? "above" : score <= 45 ? "below" : "in line with";
            return `${axisLabel(entry.axis).toLowerCase()} ${score.toFixed(0)}/100 (${comparison} ${reference})`;
        });

    if (parts.length === 0) {
        return `${definition.summary} Every axis sits close to ${reference}.`;
    }
    return `${parts.join(" and ")}. ${definition.summary}`;
}
