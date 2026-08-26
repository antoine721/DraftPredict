import { ROLES, type Role, type Team, type WinrateByTime } from "@draftpredict/core";
import type {
    BanEntry,
    ContributionEntry,
    ContributionGroup,
    DamageDistribution,
    DraftBreakdown,
    SuggestionEntry,
} from "../../api/types";
import type { DraftBoard } from "../../state";
import {
    NBSP,
    formatCount,
    formatNumber,
    formatPercent,
    formatSignedPercent,
    roleLabels,
} from "../../lib/format";

/**
 * The pure half of the draft view.
 *
 * Everything here is a function of the analysis payload and the board, with no
 * React and no I/O, so the reasoning that turns ratings into French sentences
 * is unit-tested rather than eyeballed in a browser.
 *
 * The one rule that runs through the whole file: **the engine's totals are
 * ally-centric**. `totalRating = ally - enemy + allyDuo - enemyDuo + matchup`,
 * so an enemy contribution has to be negated before it can be read as "effect
 * on your win probability". Green always means "good for you".
 */

export type FactorKind = "champion" | "duo" | "matchup";

export type Factor = {
    /** Stable key for React lists. */
    id: string;
    kind: FactorKind;
    /** Which side the underlying entry belongs to. */
    side: Team;
    entry: ContributionEntry;
    /** Signed effect on the **ally** win probability, in points (0-1). */
    effect: number;
    /** Signed, additive contribution to the ally total rating. */
    rating: number;
};

const EPSILON = 1e-9;

function entryId(kind: FactorKind, side: Team, entry: ContributionEntry): string {
    const champions = entry.champions
        .map((champion) => `${champion.key}:${champion.role}`)
        .join("|");
    return `${kind}:${side}:${champions}`;
}

function groupFactors(
    group: ContributionGroup | undefined,
    kind: FactorKind,
    side: Team,
    sign: 1 | -1,
): Factor[] {
    if (!group?.entries) return [];
    return group.entries.map((entry) => ({
        id: entryId(kind, side, entry),
        kind,
        side,
        entry,
        effect: sign * entry.winrateDelta,
        rating: sign * entry.rating,
    }));
}

/**
 * Every contribution of the analysis, expressed as an effect on the ally win
 * probability. Enemy champions and enemy duos are negated on the way out.
 */
export function collectFactors(breakdown: DraftBreakdown | undefined): Factor[] {
    if (!breakdown) return [];
    return [
        ...groupFactors(breakdown.allyChampions, "champion", "ally", 1),
        ...groupFactors(breakdown.enemyChampions, "champion", "opponent", -1),
        ...groupFactors(breakdown.allyDuos, "duo", "ally", 1),
        ...groupFactors(breakdown.enemyDuos, "duo", "opponent", -1),
        ...groupFactors(breakdown.matchups, "matchup", "ally", 1),
    ];
}

/**
 * The `count` strongest factors on each side, ordered by additive rating —
 * win-probability deltas are not additive, so they rank, they do not sum.
 */
export function topFactors(
    factors: readonly Factor[],
    count = 5,
): { positive: Factor[]; negative: Factor[] } {
    const sorted = [...factors].sort((a, b) => b.rating - a.rating);
    const positive = sorted.filter((factor) => factor.rating > EPSILON).slice(0, count);
    const negative = sorted
        .filter((factor) => factor.rating < -EPSILON)
        .reverse()
        .slice(0, count);
    return { positive, negative };
}

/** `wins / games`, or `null` when the entry has no sample at all. */
export function entryWinrate(entry: ContributionEntry): number | null {
    if (!entry.games || entry.games <= 0) return null;
    return entry.wins / entry.games;
}

function championLabel(champion: ContributionEntry["champions"][number]): string {
    const name = champion.name ?? champion.id ?? `#${champion.key}`;
    return `${name} (${roleLabels[champion.role] ?? "?"})`;
}

/**
 * Short label: `Aatrox (Top)`, `Aatrox + Lee Sin`, `Aatrox vs Darius`.
 *
 * An enemy champion or duo is marked as such: without it, "Yasuo +0,8 %" in
 * the list of things helping you is unreadable — it is *their* Yasuo being
 * weak that helps.
 */
export function factorLabel(factor: Factor): string {
    const [first, second] = factor.entry.champions;
    if (!first) return "—";
    const suffix =
        factor.side === "opponent" && factor.kind !== "matchup" ? " — adverse" : "";
    if (!second) return `${championLabel(first)}${suffix}`;
    const separator = factor.kind === "matchup" ? "vs" : "+";
    return `${championLabel(first)} ${separator} ${championLabel(second)}${suffix}`;
}

/** One French sentence explaining exactly what this contribution is. */
export function factorReason(factor: Factor): string {
    const [first, second] = factor.entry.champions;
    if (!first) return "";
    const winrate = entryWinrate(factor.entry);
    const sample =
        factor.entry.games > 0
            ? `${formatNumber(Math.round(factor.entry.wins))} victoires sur ${formatCount(
                  factor.entry.games,
              )} parties`
            : "aucune partie dans l'échantillon";
    const measured =
        winrate === null ? sample : `${formatPercent(winrate)} — ${sample}`;
    const side = factor.side === "ally" ? "votre équipe" : "l'équipe adverse";

    if (factor.kind === "champion") {
        return `${championLabel(first)} dans ${side} : ${measured}.`;
    }
    if (factor.kind === "duo") {
        return `Synergie ${championLabel(first)} / ${championLabel(second!)} dans ${side} : ${measured}.`;
    }
    return `${championLabel(first)} affronte ${championLabel(second!)} : ${measured}.`;
}

/** `+1,2 point de probabilité` — the effect, spelled out. */
export function factorEffectLabel(factor: Factor): string {
    return `${formatSignedPercent(factor.effect)} de probabilité de victoire`;
}

/**
 * The binding sample of the whole analysis: the smallest one every number
 * rests on. A 51 % prediction built on a 40-game matchup is not a 51 %
 * prediction, and the view has to be able to say so.
 */
export function smallestSample(
    breakdown: DraftBreakdown | undefined,
): { games: number; label: string } | null {
    const factors = collectFactors(breakdown).filter(
        (factor) => Number.isFinite(factor.entry.games) && factor.entry.games > 0,
    );
    if (factors.length === 0) return null;
    let smallest = factors[0]!;
    for (const factor of factors) {
        if (factor.entry.games < smallest.entry.games) smallest = factor;
    }
    return { games: smallest.entry.games, label: factorLabel(smallest) };
}

/** Total games behind the champion ratings of both teams. */
export function totalChampionSample(breakdown: DraftBreakdown | undefined): number {
    if (!breakdown) return 0;
    const groups = [breakdown.allyChampions, breakdown.enemyChampions];
    let total = 0;
    for (const group of groups) {
        for (const entry of group?.entries ?? []) total += entry.games;
    }
    return total;
}

/** The champion entry of one board slot, for the per-slot winrate readout. */
export function slotSample(
    breakdown: DraftBreakdown | undefined,
    team: Team,
    role: Role,
    championKey: string,
): { winrate: number; games: number } | null {
    const group =
        team === "ally" ? breakdown?.allyChampions : breakdown?.enemyChampions;
    for (const entry of group?.entries ?? []) {
        const champion = entry.champions[0];
        if (!champion) continue;
        if (champion.key !== championKey || champion.role !== role) continue;
        const winrate = entryWinrate(entry);
        if (winrate === null) return null;
        return { winrate, games: entry.games };
    }
    return null;
}

/** Ally and enemy sides exchanged, bans included. */
export function swapBoard(board: DraftBoard): DraftBoard {
    const ally: DraftBoard["ally"] = { 0: null, 1: null, 2: null, 3: null, 4: null };
    const opponent: DraftBoard["opponent"] = {
        0: null,
        1: null,
        2: null,
        3: null,
        4: null,
    };
    for (const role of ROLES) {
        ally[role] = board.opponent[role];
        opponent[role] = board.ally[role];
    }
    return {
        ally,
        opponent,
        bans: { ally: [...board.bans.opponent], opponent: [...board.bans.ally] },
    };
}

export type DamageShare = { magic: number; physical: number; trueDamage: number };

/** Damage profile as shares of the team total. Absolute values mean nothing. */
export function damageShares(
    distribution: DamageDistribution | undefined,
): DamageShare {
    const magic = distribution?.magic ?? 0;
    const physical = distribution?.physical ?? 0;
    const trueDamage = distribution?.true ?? 0;
    const total = distribution?.total || magic + physical + trueDamage;
    if (!total || !Number.isFinite(total)) {
        return { magic: 0, physical: 0, trueDamage: 0 };
    }
    return {
        magic: magic / total,
        physical: physical / total,
        trueDamage: trueDamage / total,
    };
}

/** A warning when a composition is trivially countered by one resistance. */
export function damageVerdict(
    distribution: DamageDistribution | undefined,
): string | null {
    const shares = damageShares(distribution);
    if (shares.physical + shares.magic + shares.trueDamage <= 0) return null;
    if (shares.physical >= 0.7) {
        return `Dégâts très majoritairement physiques (${formatPercent(shares.physical, 0)}) : une seule pièce d'armure suffit à répondre.`;
    }
    if (shares.magic >= 0.7) {
        return `Dégâts très majoritairement magiques (${formatPercent(shares.magic, 0)}) : une seule pièce de résistance magique suffit à répondre.`;
    }
    if (shares.physical >= 0.4 && shares.magic >= 0.35) {
        return "Dégâts équilibrés : l'adversaire ne peut pas se protéger avec une seule résistance.";
    }
    return null;
}

export type DurationVerdict = {
    tone: "early" | "late" | "flat";
    label: string;
    description: string;
};

/**
 * Whether the composition wants a short game or a long one, read from the
 * winrate-by-duration curve rather than from champion folklore.
 */
export function durationVerdict(
    points: readonly WinrateByTime[],
): DurationVerdict | null {
    if (!points || points.length < 2) return null;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const diff = last.winrate - first.winrate;
    const range = `${formatPercent(first.winrate)} à ${first.duration}${NBSP}min contre ${formatPercent(
        last.winrate,
    )} à ${last.duration}${NBSP}min`;
    if (diff >= 0.004) {
        return {
            tone: "late",
            label: "Composition late game",
            description: `Votre probabilité monte avec la durée : ${range}. Étirez la partie.`,
        };
    }
    if (diff <= -0.004) {
        return {
            tone: "early",
            label: "Composition early game",
            description: `Votre probabilité baisse avec la durée : ${range}. Cherchez à fermer tôt.`,
        };
    }
    return {
        tone: "flat",
        label: "Composition stable",
        description: `La durée change peu l'issue : ${range}.`,
    };
}

/** One honest line per suggestion: what it changes, and on how much data. */
export function suggestionReason(
    entry: SuggestionEntry,
    baselineWinrate: number,
    rank: number,
): string {
    const role = roleLabels[entry.role] ?? "?";
    const gain = entry.winrateDelta;
    const sample = `${formatCount(entry.games)} parties en ${role}`;
    const head =
        rank === 0
            ? `Meilleur choix en ${role} face à ce draft`
            : gain >= 0.02
              ? `Fort gain en ${role} face à ce draft`
              : gain > 0
                ? `Léger gain en ${role}`
                : `Choix neutre en ${role}`;
    const movement =
        Math.abs(gain) < 0.0005
            ? "ne change presque rien"
            : `${formatSignedPercent(gain)} par rapport à ${formatPercent(baselineWinrate)}`;
    return `${head} : ${movement} — ${sample}.`;
}

/** One line per ban suggestion: what it costs you if the enemy gets it. */
export function banReason(entry: BanEntry): string {
    const role = roleLabels[entry.role] ?? "?";
    return `En ${role} chez l'adversaire, ce champion vous coûte ${formatPercent(
        Math.abs(entry.winrateLoss),
    )} de probabilité — ${formatCount(entry.games)} parties.`;
}

/** French label of a champ-select sub-phase. */
export function phaseLabel(phase: string | null | undefined): string {
    switch (phase) {
        case "PLANNING":
            return "Préparation";
        case "BAN_PICK":
            return "Bans & picks";
        case "FINALIZATION":
            return "Finalisation";
        case "GAME_STARTING":
            return "Lancement de la partie";
        case "":
        case null:
        case undefined:
            return "Sélection des champions";
        default:
            return phase;
    }
}

/** Roles with nobody in them, in role order. */
export function openRolesOf(team: DraftBoard["ally"]): Role[] {
    return ROLES.filter((role) => !team[role]);
}
