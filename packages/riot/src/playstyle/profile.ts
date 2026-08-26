import { ROLES, type Role } from "@draftpredict/core";

import { REMAKE_DURATION_SECONDS, type MatchSummary } from "../match/summary.js";
import type { ChampionMasteryDto } from "../types/mastery.js";
import { pickArchetype } from "./archetype.js";
import { MIN_CONFIDENT_GAMES, computeAxes, computeAxisDetails } from "./axes.js";
import { DEFAULT_BASELINES } from "./baselines.js";
import {
    FALLBACK_ROLE,
    computeGameMetrics,
    normalizeGameMetrics,
    performanceScore,
    type AnalyzedGame,
} from "./metrics.js";
import { pickStrengths, pickWeaknesses } from "./traits.js";
import type {
    ChampionBreakdown,
    ChampionPoolEntry,
    ChampionRoleGames,
    FormGame,
    MatchupEntry,
    PlaystyleForm,
    PlaystyleProfile,
    PlaystyleTotals,
    ProfilePlaystyleOptions,
    RoleBreakdown,
    RoleDistributionEntry,
} from "./types.js";

type MasteryEntry = { points: number; level?: number };

const DEFAULT_FORM_GAMES = 10;
const DEFAULT_CHAMPION_POOL = 15;
const DEFAULT_MATCHUPS = 5;

/**
 * Builds a full playstyle profile out of match summaries that all belong to the
 * same player.
 *
 * Pure function: no I/O, no clock, no randomness — the same summaries always
 * produce the same profile.
 *
 * `options` may also be the player's puuid, which is what
 * `profilePlaystyle(matches, puuid)` in ARCHITECTURE.md describes.
 */
export function profilePlaystyle(
    summaries: readonly MatchSummary[],
    options: ProfilePlaystyleOptions | string = {},
): PlaystyleProfile {
    const opts: ProfilePlaystyleOptions =
        typeof options === "string" ? { puuid: options } : options;
    const baselines = opts.baselines ?? DEFAULT_BASELINES;
    const excludeRemakes = opts.excludeRemakes ?? true;
    const minDuration = opts.minDurationSeconds ?? REMAKE_DURATION_SECONDS;
    const queues = opts.queues;
    const puuid = opts.puuid ?? summaries[0]?.puuid;

    const kept = summaries.filter((summary) => {
        if (excludeRemakes && summary.remake) return false;
        if (summary.durationSeconds < minDuration) return false;
        if (queues && !queues.includes(summary.queueId)) return false;
        if (puuid !== undefined && summary.puuid !== puuid) return false;
        return true;
    });

    const primaryRole = mostPlayedRole(kept);
    const games: AnalyzedGame[] = kept.map((summary) => {
        const role = summary.role ?? primaryRole ?? FALLBACK_ROLE;
        const metrics = computeGameMetrics(summary);
        const normalized = normalizeGameMetrics(metrics, role, baselines);
        return {
            summary,
            role,
            metrics,
            normalized,
            performance: performanceScore(normalized),
        };
    });

    const { axes, details } = computeAxisDetails(games);

    return {
        puuid,
        matchesAnalyzed: games.length,
        matchesExcluded: summaries.length - games.length,
        lowConfidence: games.length < MIN_CONFIDENT_GAMES,
        primaryRole,
        axes,
        axisDetails: details,
        archetype: pickArchetype(axes, { role: primaryRole, games: games.length }),
        strengths: pickStrengths(axes),
        weaknesses: pickWeaknesses(axes),
        championPool: buildChampionPool(
            games,
            normalizeMastery(opts.mastery),
            opts.maxChampionPool ?? DEFAULT_CHAMPION_POOL,
        ),
        roleDistribution: buildRoleDistribution(games),
        matchups: buildMatchups(games, opts.maxMatchups ?? DEFAULT_MATCHUPS),
        form: buildForm(games, opts.formGames ?? DEFAULT_FORM_GAMES),
        byRole: buildRoleBreakdowns(games),
        byChampion: buildChampionBreakdowns(games),
        totals: buildTotals(games),
    };
}

function mostPlayedRole(summaries: readonly MatchSummary[]): Role | null {
    const counts = new Map<Role, number>();
    for (const summary of summaries) {
        if (summary.role === null) continue;
        counts.set(summary.role, (counts.get(summary.role) ?? 0) + 1);
    }
    let best: Role | null = null;
    let bestCount = 0;
    for (const role of ROLES) {
        const count = counts.get(role) ?? 0;
        if (count > bestCount) {
            best = role;
            bestCount = count;
        }
    }
    return best;
}

function normalizeMastery(
    mastery: ProfilePlaystyleOptions["mastery"],
): Map<string, MasteryEntry> {
    const map = new Map<string, MasteryEntry>();
    if (!mastery) return map;
    if (Array.isArray(mastery)) {
        for (const entry of mastery as readonly ChampionMasteryDto[]) {
            map.set(String(entry.championId), {
                points: entry.championPoints,
                level: entry.championLevel,
            });
        }
        return map;
    }
    for (const [championKey, points] of Object.entries(
        mastery as Record<string, number>,
    )) {
        map.set(championKey, { points });
    }
    return map;
}

function buildChampionPool(
    games: readonly AnalyzedGame[],
    mastery: Map<string, MasteryEntry>,
    limit: number,
): ChampionPoolEntry[] {
    const byChampion = groupBy(games, (game) => game.summary.championKey);
    const entries: ChampionPoolEntry[] = [];
    for (const [championKey, list] of byChampion) {
        const wins = list.filter((game) => game.summary.win).length;
        const roleCounts = new Map<Role, number>();
        for (const game of list) {
            if (game.summary.role === null) continue;
            roleCounts.set(
                game.summary.role,
                (roleCounts.get(game.summary.role) ?? 0) + 1,
            );
        }
        const roles: ChampionRoleGames[] = [...roleCounts.entries()]
            .map(([role, count]) => ({ role, games: count }))
            .sort((a, b) => b.games - a.games);
        const masteryEntry = mastery.get(championKey);
        entries.push({
            championKey,
            championName: list[0]!.summary.championName,
            games: list.length,
            wins,
            losses: list.length - wins,
            winrate: wins / list.length,
            kda: mean(list.map((game) => game.summary.kda)),
            performance: mean(list.map((game) => game.performance)),
            roles,
            masteryPoints: masteryEntry?.points,
            masteryLevel: masteryEntry?.level,
        });
    }
    return entries
        .sort((a, b) => b.games - a.games || b.winrate - a.winrate)
        .slice(0, limit);
}

function buildRoleDistribution(games: readonly AnalyzedGame[]): RoleDistributionEntry[] {
    const entries: RoleDistributionEntry[] = [];
    for (const role of ROLES) {
        const list = games.filter((game) => game.summary.role === role);
        if (list.length === 0) continue;
        const wins = list.filter((game) => game.summary.win).length;
        entries.push({
            role,
            games: list.length,
            share: games.length === 0 ? 0 : list.length / games.length,
            wins,
            winrate: wins / list.length,
        });
    }
    return entries.sort((a, b) => b.games - a.games);
}

function buildMatchups(
    games: readonly AnalyzedGame[],
    limit: number,
): { best: MatchupEntry[]; worst: MatchupEntry[] } {
    const withOpponent = games.filter(
        (game) => game.summary.opponentChampionKey !== null,
    );
    const grouped = groupBy(
        withOpponent,
        (game) => `${game.summary.role ?? "?"}:${game.summary.opponentChampionKey}`,
    );
    const entries: MatchupEntry[] = [];
    for (const list of grouped.values()) {
        const first = list[0]!.summary;
        const wins = list.filter((game) => game.summary.win).length;
        entries.push({
            role: first.role,
            championKey: first.opponentChampionKey!,
            championName: first.opponentChampionName ?? first.opponentChampionKey!,
            games: list.length,
            wins,
            losses: list.length - wins,
            winrate: wins / list.length,
            // Laplace smoothing keeps a 1-0 matchup from outranking a 5-1 one.
            score: (wins + 1) / (list.length + 2),
        });
    }
    const sorted = [...entries].sort(
        (a, b) => b.score - a.score || b.games - a.games,
    );
    return {
        best: sorted.slice(0, limit),
        worst: [...sorted].reverse().slice(0, limit),
    };
}

function buildForm(games: readonly AnalyzedGame[], count: number): PlaystyleForm {
    const chronological = [...games].sort(
        (a, b) => a.summary.gameStart - b.summary.gameStart,
    );
    const recent = chronological.slice(-count);
    const newestFirst = [...recent].reverse();

    const formGames: FormGame[] = newestFirst.map((game) => ({
        matchId: game.summary.matchId,
        championKey: game.summary.championKey,
        championName: game.summary.championName,
        role: game.summary.role,
        win: game.summary.win,
        kda: game.summary.kda,
        performance: game.performance,
        gameStart: game.summary.gameStart,
    }));

    let streakLength = 0;
    const streakType: "win" | "loss" | "none" =
        formGames.length === 0 ? "none" : formGames[0]!.win ? "win" : "loss";
    for (const game of formGames) {
        if (streakType === "none") break;
        if (game.win !== (streakType === "win")) break;
        streakLength += 1;
    }

    const wins = formGames.filter((game) => game.win).length;
    const half = Math.floor(recent.length / 2);
    const older = recent.slice(0, half);
    const newer = recent.slice(recent.length - half);
    const trendDelta =
        half === 0
            ? 0
            : mean(newer.map((game) => game.performance)) -
              mean(older.map((game) => game.performance));

    return {
        games: formGames,
        streak: { type: streakType, length: streakLength },
        winrate: formGames.length === 0 ? 0 : wins / formGames.length,
        averagePerformance: mean(recent.map((game) => game.performance)),
        trend: trendDelta > 5 ? "improving" : trendDelta < -5 ? "declining" : "stable",
        trendDelta,
    };
}

function buildRoleBreakdowns(games: readonly AnalyzedGame[]): RoleBreakdown[] {
    const breakdowns: RoleBreakdown[] = [];
    for (const role of ROLES) {
        const list = games.filter((game) => game.summary.role === role);
        if (list.length === 0) continue;
        const wins = list.filter((game) => game.summary.win).length;
        breakdowns.push({
            role,
            games: list.length,
            wins,
            winrate: wins / list.length,
            axes: computeAxes(list),
            performance: mean(list.map((game) => game.performance)),
        });
    }
    return breakdowns.sort((a, b) => b.games - a.games);
}

function buildChampionBreakdowns(games: readonly AnalyzedGame[]): ChampionBreakdown[] {
    const grouped = groupBy(games, (game) => game.summary.championKey);
    const breakdowns: ChampionBreakdown[] = [];
    for (const [championKey, list] of grouped) {
        const wins = list.filter((game) => game.summary.win).length;
        breakdowns.push({
            championKey,
            championName: list[0]!.summary.championName,
            games: list.length,
            wins,
            winrate: wins / list.length,
            axes: computeAxes(list),
            performance: mean(list.map((game) => game.performance)),
        });
    }
    return breakdowns.sort((a, b) => b.games - a.games);
}

function buildTotals(games: readonly AnalyzedGame[]): PlaystyleTotals {
    const wins = games.filter((game) => game.summary.win).length;
    const kills = sum(games.map((game) => game.summary.kills));
    const deaths = sum(games.map((game) => game.summary.deaths));
    const assists = sum(games.map((game) => game.summary.assists));
    return {
        games: games.length,
        wins,
        losses: games.length - wins,
        winrate: games.length === 0 ? 0 : wins / games.length,
        kills,
        deaths,
        assists,
        kda: (kills + assists) / Math.max(1, deaths),
        killParticipation: mean(games.map((game) => game.summary.killParticipation)),
        damageShare: mean(games.map((game) => game.summary.damageShare)),
        csPerMinute: mean(games.map((game) => game.summary.csPerMinute)),
        visionScorePerMinute: mean(
            games.map((game) => game.summary.vision.scorePerMinute),
        ),
        goldPerMinute: mean(games.map((game) => game.summary.goldPerMinute)),
        averageDurationMinutes: mean(
            games.map((game) => game.summary.durationMinutes),
        ),
    };
}

function groupBy<T>(
    items: readonly T[],
    key: (item: T) => string,
): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const id = key(item);
        const list = map.get(id);
        if (list) list.push(item);
        else map.set(id, [item]);
    }
    return map;
}

function mean(values: readonly number[]): number {
    if (values.length === 0) return 0;
    return sum(values) / values.length;
}

function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}
