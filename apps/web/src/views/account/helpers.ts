import type { Role } from "@draftpredict/core";
import type { LeagueEntryDto, MatchSummary, PlaystyleProfile } from "../../api/types";
import { NBSP, formatNumber, formatPercent } from "../../lib/format";

/**
 * The pure half of the account view.
 *
 * Riot IDs, ranked entries, playstyle axes and match rows all need small
 * decisions — is this tag valid, is this rank a promotion series, is this
 * champion played often enough to compare, was the prediction right — and
 * every one of them is a function of its input with no React and no I/O, so
 * they are unit-tested instead of eyeballed.
 */

export type PoolEntry = PlaystyleProfile["championPool"][number];
export type RoleShare = PlaystyleProfile["roleDistribution"][number];
export type AxisDetail = PlaystyleProfile["axisDetails"][keyof PlaystyleProfile["axisDetails"]];

// ---------------------------------------------------------------- riot id ---

export type ParsedRiotId = { gameName: string; tagLine: string };

/** Riot's own limits: 3-16 characters of name, 2-5 of tag. */
const NAME_MIN = 3;
const NAME_MAX = 16;
const TAG_PATTERN = /^[A-Za-z0-9]{2,5}$/;

/** `" Faker # KR1 "` -> `{ gameName: "Faker", tagLine: "KR1" }`, or `null`. */
export function parseRiotId(value: string): ParsedRiotId | null {
    const parts = value.split("#");
    if (parts.length !== 2) return null;
    const gameName = parts[0]!.trim();
    const tagLine = parts[1]!.trim();
    if (gameName.length < NAME_MIN || gameName.length > NAME_MAX) return null;
    if (!TAG_PATTERN.test(tagLine)) return null;
    return { gameName, tagLine };
}

/** The French reason a Riot ID cannot be submitted, or `null` when it can. */
export function riotIdError(value: string): string | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) return "Entrez votre Riot ID, par exemple Nom#EUW.";
    const hashes = trimmed.split("#").length - 1;
    if (hashes === 0) return "Il manque le tag : écrivez Nom#TAG.";
    if (hashes > 1) return "Un Riot ID ne contient qu'un seul « # ».";
    const [name = "", tag = ""] = trimmed.split("#").map((part) => part.trim());
    if (name.length === 0) return "Le nom est vide.";
    if (name.length < NAME_MIN) return `Le nom fait au moins ${NAME_MIN} caractères.`;
    if (name.length > NAME_MAX) return `Le nom fait au plus ${NAME_MAX} caractères.`;
    if (tag.length === 0) return "Le tag est vide : écrivez Nom#TAG.";
    if (!TAG_PATTERN.test(tag))
        return "Le tag fait 2 à 5 caractères, lettres et chiffres uniquement.";
    return null;
}

/** Canonical `Nom#TAG`, used as the storage key of a remembered account. */
export function normalizeRiotId(value: string): string {
    const parsed = parseRiotId(value);
    return parsed ? `${parsed.gameName}#${parsed.tagLine}` : value.trim();
}

// --------------------------------------------------------- saved accounts ---

export type SavedAccount = {
    puuid: string;
    riotId: string | null;
    platform: string;
    /** How this account was connected — the badge on the switcher. */
    source: "lcu" | "riot-id";
    /** Epoch ms of the last time it was selected; the list is sorted by it. */
    lastUsedAt: number;
};

export const MAX_SAVED_ACCOUNTS = 6;

export function accountKey(account: Pick<SavedAccount, "puuid" | "platform">): string {
    return `${account.platform.toLowerCase()}:${account.puuid}`;
}

/** Adds or refreshes an account, most recent first, capped and de-duplicated. */
export function upsertAccount(
    list: readonly SavedAccount[],
    account: SavedAccount,
    limit = MAX_SAVED_ACCOUNTS,
): SavedAccount[] {
    const key = accountKey(account);
    const previous = list.find((entry) => accountKey(entry) === key);
    const merged: SavedAccount = {
        ...account,
        // A Riot ID once known is not forgotten because the client reconnected.
        riotId: account.riotId ?? previous?.riotId ?? null,
    };
    return [merged, ...list.filter((entry) => accountKey(entry) !== key)].slice(0, limit);
}

export function removeAccount(
    list: readonly SavedAccount[],
    key: string,
): SavedAccount[] {
    return list.filter((entry) => accountKey(entry) !== key);
}

/** Drops anything that is not a usable saved account (corrupt localStorage). */
export function sanitizeAccounts(value: unknown): SavedAccount[] {
    if (!Array.isArray(value)) return [];
    const clean: SavedAccount[] = [];
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null) continue;
        const record = entry as Record<string, unknown>;
        if (typeof record.puuid !== "string" || record.puuid.length === 0) continue;
        if (typeof record.platform !== "string" || record.platform.length === 0) continue;
        clean.push({
            puuid: record.puuid,
            riotId: typeof record.riotId === "string" ? record.riotId : null,
            platform: record.platform,
            source: record.source === "lcu" ? "lcu" : "riot-id",
            lastUsedAt:
                typeof record.lastUsedAt === "number" && Number.isFinite(record.lastUsedAt)
                    ? record.lastUsedAt
                    : 0,
        });
    }
    return clean.slice(0, MAX_SAVED_ACCOUNTS);
}

// ------------------------------------------------------------------ ranks ---

export type RankStats = {
    games: number;
    wins: number;
    losses: number;
    winrate: number;
};

export function rankStats(entry: LeagueEntryDto | undefined | null): RankStats {
    const wins = entry?.wins ?? 0;
    const losses = entry?.losses ?? 0;
    const games = wins + losses;
    return { games, wins, losses, winrate: games > 0 ? wins / games : 0 };
}

/** `"WLN"` -> `["V", "D", "—"]`: the promotion series, read left to right. */
export function seriesMarks(progress: string | null | undefined): string[] {
    if (!progress) return [];
    return [...progress].map((mark) =>
        mark === "W" ? "V" : mark === "L" ? "D" : "—",
    );
}

/** Apex tiers have a single division; showing "Maître I" is noise. */
export function isApexTier(tier: string | null | undefined): boolean {
    if (!tier) return false;
    const upper = tier.toUpperCase();
    return upper === "MASTER" || upper === "GRANDMASTER" || upper === "CHALLENGER";
}

/** Data Dragon profile icon, or `null` when the patch version is unknown. */
export function profileIconUrl(
    version: string | null | undefined,
    iconId: number | null | undefined,
): string | null {
    if (!version || iconId === null || iconId === undefined) return null;
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

// ------------------------------------------------------------- playstyle ---

/** The role baseline every axis is normalised against: 50 is an average game. */
export const AXIS_BASELINE = 50;

export type AxisVerdict = {
    delta: number;
    label: string;
    tone: "positive" | "negative" | "neutral";
};

/**
 * How an axis reads against players of the same role.
 *
 * The thresholds are the ones `@draftpredict/riot` uses to pick strengths and
 * weaknesses (58 / 42), so the radar and the two lists can never disagree.
 */
export function axisVerdict(score: number): AxisVerdict {
    const delta = score - AXIS_BASELINE;
    if (score >= 58) return { delta, label: "au-dessus de la moyenne du rôle", tone: "positive" };
    if (score <= 42) return { delta, label: "en dessous de la moyenne du rôle", tone: "negative" };
    return { delta, label: "dans la moyenne du rôle", tone: "neutral" };
}

/** `"+11 pts"` / `"±0 pt"` — axis deltas are points, not percentages. */
export function formatAxisDelta(delta: number): string {
    const rounded = Math.round(delta);
    const unit = Math.abs(rounded) > 1 ? "pts" : "pt";
    if (rounded === 0) return `±0${NBSP}pt`;
    return `${rounded > 0 ? "+" : "-"}${formatNumber(Math.abs(rounded))}${NBSP}${unit}`;
}

/** The metric that pushed an axis furthest from the baseline, weight included. */
export function drivingInput(detail: AxisDetail | undefined | null) {
    if (!detail || detail.inputs.length === 0) return null;
    return [...detail.inputs].sort(
        (a, b) =>
            Math.abs(b.score - AXIS_BASELINE) * b.weight -
            Math.abs(a.score - AXIS_BASELINE) * a.weight,
    )[0]!;
}

export type RadarPoint = {
    axis: string;
    score: number;
    baseline: number;
};

/** The eight axes as Recharts rows, always in the same order. */
export function radarPoints(
    axes: PlaystyleProfile["axes"],
    order: readonly string[],
): RadarPoint[] {
    return order.map((axis) => ({
        axis,
        score: axes[axis as keyof PlaystyleProfile["axes"]] ?? AXIS_BASELINE,
        baseline: AXIS_BASELINE,
    }));
}

/** 0-1 progress of a Riot job; `null` total means "unknown, stay indeterminate". */
export function jobProgressRatio(
    progress: { loaded: number; total: number } | null,
): number {
    if (!progress || progress.total <= 0) return 0;
    return Math.min(1, Math.max(0, progress.loaded / progress.total));
}

// ------------------------------------------------------------ champion pool ---

/** Below this, a winrate is an anecdote — best/worst lists refuse to rank it. */
export const POOL_MIN_GAMES = 4;

export type PoolExtremes = {
    best: PoolEntry[];
    worst: PoolEntry[];
    /** Champions dropped for lack of games — said out loud, never hidden. */
    ignored: number;
};

/**
 * Best and worst champions of a pool.
 *
 * Ranking is done on a Laplace-smoothed winrate `(wins + 1) / (games + 2)`, so
 * a 2-0 champion does not outrank a 34-16 one, and anything under
 * {@link POOL_MIN_GAMES} games is excluded outright.
 */
export function poolExtremes(
    pool: readonly PoolEntry[],
    limit = 3,
    minGames = POOL_MIN_GAMES,
): PoolExtremes {
    const eligible = pool.filter((entry) => entry.games >= minGames);
    const ranked = [...eligible].sort(
        (a, b) => smoothedWinrate(b) - smoothedWinrate(a) || b.games - a.games,
    );
    const best = ranked.slice(0, limit);
    const worst = [...ranked]
        .reverse()
        .filter((entry) => !best.includes(entry))
        .slice(0, limit);
    return { best, worst, ignored: pool.length - eligible.length };
}

export function smoothedWinrate(entry: Pick<PoolEntry, "wins" | "games">): number {
    return (entry.wins + 1) / (entry.games + 2);
}

export type PoolSort = "games" | "winrate" | "kda" | "performance" | "mastery";

export function sortPool(
    pool: readonly PoolEntry[],
    sort: PoolSort,
    csPerMinute?: ReadonlyMap<string, number>,
): PoolEntry[] {
    const rows = [...pool];
    switch (sort) {
        case "winrate":
            return rows.sort(
                (a, b) => smoothedWinrate(b) - smoothedWinrate(a) || b.games - a.games,
            );
        case "kda":
            return rows.sort((a, b) => b.kda - a.kda || b.games - a.games);
        case "performance":
            return rows.sort((a, b) => b.performance - a.performance || b.games - a.games);
        case "mastery":
            return rows.sort(
                (a, b) => (b.masteryPoints ?? 0) - (a.masteryPoints ?? 0) || b.games - a.games,
            );
        default:
            void csPerMinute;
            return rows.sort((a, b) => b.games - a.games || smoothedWinrate(b) - smoothedWinrate(a));
    }
}

/** The main role of a pool entry — the one it was played in most. */
export function mainPoolRole(entry: PoolEntry): Role | null {
    if (entry.roles.length === 0) return null;
    return [...entry.roles].sort((a, b) => b.games - a.games)[0]!.role;
}

/**
 * CS per minute per champion, measured on the loaded match history.
 *
 * The playstyle profile does not carry it, and the history is usually a
 * smaller sample than the profile, so the caller must label the result with
 * the number of games it actually saw — hence `games` in the value.
 */
export function csPerMinuteByChampion(
    matches: readonly MatchSummary[],
): Map<string, { csPerMinute: number; games: number }> {
    const totals = new Map<string, { cs: number; minutes: number; games: number }>();
    for (const match of matches) {
        if (match.remake || match.durationMinutes <= 0) continue;
        const current = totals.get(match.championKey) ?? { cs: 0, minutes: 0, games: 0 };
        current.cs += match.cs;
        current.minutes += match.durationMinutes;
        current.games += 1;
        totals.set(match.championKey, current);
    }
    const result = new Map<string, { csPerMinute: number; games: number }>();
    for (const [key, value] of totals) {
        if (value.minutes <= 0) continue;
        result.set(key, { csPerMinute: value.cs / value.minutes, games: value.games });
    }
    return result;
}

/** Total games behind a role distribution — the denominator of every share. */
export function totalRoleGames(distribution: readonly RoleShare[]): number {
    return distribution.reduce((total, entry) => total + entry.games, 0);
}

// ---------------------------------------------------------------- matches ---

export type MatchOutcome = {
    label: string;
    tone: "positive" | "negative" | "neutral";
};

export function matchOutcome(match: MatchSummary): MatchOutcome {
    if (match.remake) return { label: "Partie annulée", tone: "neutral" };
    return match.win
        ? { label: "Victoire", tone: "positive" }
        : { label: "Défaite", tone: "negative" };
}

/** `8 / 3 / 6` — the universal KDA line, always in that order. */
export function killLine(match: Pick<MatchSummary, "kills" | "deaths" | "assists">): string {
    return `${match.kills}${NBSP}/${NBSP}${match.deaths}${NBSP}/${NBSP}${match.assists}`;
}

export type HistoryTotals = {
    games: number;
    wins: number;
    winrate: number;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    remakes: number;
};

/** The summary line above the history — computed, never taken on faith. */
export function historyTotals(matches: readonly MatchSummary[]): HistoryTotals {
    let games = 0;
    let wins = 0;
    let kills = 0;
    let deaths = 0;
    let assists = 0;
    let remakes = 0;
    for (const match of matches) {
        if (match.remake) {
            remakes += 1;
            continue;
        }
        games += 1;
        if (match.win) wins += 1;
        kills += match.kills;
        deaths += match.deaths;
        assists += match.assists;
    }
    return {
        games,
        wins,
        winrate: games > 0 ? wins / games : 0,
        kills,
        deaths,
        assists,
        kda: deaths > 0 ? (kills + assists) / deaths : kills + assists,
        remakes,
    };
}

export type PredictionVerdict = {
    /** `"prédit 47 %, résultat : défaite"`. */
    sentence: string;
    /** Did the model lean the right way? `null` for a coin flip or a remake. */
    correct: boolean | null;
    /** How far the outcome was from the prediction, in win-probability points. */
    surprise: number;
    label: string;
    tone: "positive" | "negative" | "neutral";
};

/**
 * What the draft engine would have said before the game started, against what
 * actually happened.
 *
 * The engine's number is the *ally* win probability, and `matches[].draft` is
 * already ally-first, so no side flipping is needed. A prediction within one
 * point of 50 % is called a coin flip rather than right or wrong: claiming a
 * 50,4 % call was "correct" would be dishonest.
 */
export function predictionVerdict(
    winrate: number | null | undefined,
    match: Pick<MatchSummary, "win" | "remake">,
): PredictionVerdict | null {
    if (winrate === null || winrate === undefined || !Number.isFinite(winrate)) return null;
    const outcome = match.remake ? "partie annulée" : match.win ? "victoire" : "défaite";
    const sentence = `prédit ${formatPercent(winrate, 0)}, résultat${NBSP}: ${outcome}`;
    const surprise = Math.abs((match.win ? 1 : 0) - winrate);
    if (match.remake) {
        return { sentence, correct: null, surprise: 0, label: "Sans objet", tone: "neutral" };
    }
    if (Math.abs(winrate - 0.5) < 0.01) {
        return { sentence, correct: null, surprise, label: "Draft équilibré", tone: "neutral" };
    }
    const correct = winrate > 0.5 === match.win;
    return {
        sentence,
        correct,
        surprise,
        label: correct ? "Draft confirmé" : "Draft démenti",
        tone: correct ? "positive" : "negative",
    };
}

/** Ally-then-enemy rows for the expanded draft of a finished game. */
export type DraftRow = { role: Role; ally: string | null; enemy: string | null };

export function draftRows(
    draft: MatchSummary["draft"] | null | undefined,
    roles: readonly Role[],
): DraftRow[] {
    const ally = new Map(draft?.ally ?? []);
    const enemy = new Map(draft?.opponent ?? []);
    return roles.map((role) => ({
        role,
        ally: ally.get(role) ?? null,
        enemy: enemy.get(role) ?? null,
    }));
}

/** A draft can be analysed only if both teams have at least one champion. */
export function draftIsAnalysable(
    draft: MatchSummary["draft"] | null | undefined,
): boolean {
    return (draft?.ally.length ?? 0) > 0 && (draft?.opponent.length ?? 0) > 0;
}
