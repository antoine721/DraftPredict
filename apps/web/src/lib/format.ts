import type { Rank, Role } from "@draftpredict/core";

/**
 * French-locale formatters. Everything a player reads goes through here, so
 * "51,2 %" never appears next to "51.2%" on the same screen.
 *
 * The numeric formatting is written by hand rather than delegated to `Intl`:
 * it must be byte-identical in the browser, in Node and in a unit test, and
 * `Intl`'s compact notation is not.
 */

/** Narrow no-break space — French typography before `%`, and as a thousands separator. */
export const NBSP = "\u00a0";

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/** `1234.5` -> `"1 234,5"` (no-break spaces, French decimal comma). */
export function formatNumber(value: number, decimals = 0): string {
    if (!Number.isFinite(value)) return "—";
    const negative = value < 0;
    const fixed = Math.abs(value).toFixed(clamp(decimals, 0, 6));
    const [integer = "0", fraction] = fixed.split(".");
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    const body = fraction ? `${grouped},${fraction}` : grouped;
    return negative ? `-${body}` : body;
}

/**
 * Sample sizes: `842` -> `"842"`, `12_400` -> `"12,4 k"`, `1_240_000` -> `"1,24 M"`.
 * Long lists of games played need to stay narrow and still be comparable.
 */
export function formatCount(value: number): string {
    if (!Number.isFinite(value)) return "—";
    const negative = value < 0;
    const abs = Math.abs(value);
    let body: string;
    if (abs < 1000) {
        body = formatNumber(Math.round(abs));
    } else if (abs < 1_000_000) {
        const scaled = abs / 1000;
        body = `${formatNumber(scaled, scaled < 10 ? 1 : 0)}${NBSP}k`;
    } else if (abs < 1_000_000_000) {
        const scaled = abs / 1_000_000;
        body = `${formatNumber(scaled, scaled < 10 ? 2 : 0)}${NBSP}M`;
    } else {
        body = `${formatNumber(abs / 1_000_000_000, 1)}${NBSP}Md`;
    }
    return negative ? `-${body}` : body;
}

/** `0.5123` -> `"51,2 %"`. Pass a 0-1 ratio, not a percentage. */
export function formatPercent(value: number, decimals = 1): string {
    if (!Number.isFinite(value)) return "—";
    return `${formatNumber(value * 100, decimals)}${NBSP}%`;
}

/** `0.0324` -> `"+3,2 %"`, `-0.0324` -> `"-3,2 %"`, `0` -> `"±0,0 %"`. */
export function formatSignedPercent(value: number, decimals = 1): string {
    if (!Number.isFinite(value)) return "—";
    const rounded = Number((value * 100).toFixed(decimals));
    if (rounded === 0) return `±${formatNumber(0, decimals)}${NBSP}%`;
    const sign = rounded > 0 ? "+" : "-";
    return `${sign}${formatNumber(Math.abs(rounded), decimals)}${NBSP}%`;
}

/** Signed plain number, e.g. a rating: `-34.0658` -> `"-34,07"`. */
export function formatSigned(value: number, decimals = 2): string {
    if (!Number.isFinite(value)) return "—";
    const rounded = Number(value.toFixed(decimals));
    if (rounded === 0) return `±${formatNumber(0, decimals)}`;
    return `${rounded > 0 ? "+" : "-"}${formatNumber(Math.abs(rounded), decimals)}`;
}

/** Tailwind colour class for a signed value (green up, red down, muted flat). */
export function signedColorClass(value: number, epsilon = 1e-9): string {
    if (!Number.isFinite(value) || Math.abs(value) <= epsilon) {
        return "text-ink-muted";
    }
    return value > 0 ? "text-positive" : "text-negative";
}

/** `"+"`, `"-"` or `"±"` — for arrows and prefixes. */
export function signOf(value: number, epsilon = 1e-9): "+" | "-" | "±" {
    if (!Number.isFinite(value) || Math.abs(value) <= epsilon) return "±";
    return value > 0 ? "+" : "-";
}

/** `1770` -> `"29:30"`; hours appear only when needed (`"1:05:03"`). */
export function formatDuration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "—";
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    const pad = (value: number) => String(value).padStart(2, "0");
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(rest)}`
        : `${minutes}:${pad(rest)}`;
}

/** Champ-select and live-game countdowns: `27000` -> `"0:27"`. */
export function formatTimer(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0:00";
    return formatDuration(Math.ceil(milliseconds / 1000));
}

/** `29.5` -> `"29 min"`. */
export function formatMinutes(minutes: number): string {
    if (!Number.isFinite(minutes)) return "—";
    return `${formatNumber(minutes, 0)}${NBSP}min`;
}

// ------------------------------------------------------------------ ranks ---

/** Dataset ranks (`@draftpredict/core`), in French. */
export const rankLabels: Record<Rank, string> = {
    ALL: "Tous rangs",
    IRON: "Fer",
    BRONZE: "Bronze",
    SILVER: "Argent",
    GOLD: "Or",
    PLATINUM: "Platine",
    EMERALD: "Émeraude",
    DIAMOND: "Diamant",
    MASTER: "Maître",
    GRANDMASTER: "Grand Maître",
    CHALLENGER: "Challenger",
    PLATINUM_PLUS: "Platine+",
    DIAMOND_PLUS: "Diamant+",
};

/** Riot ranked tiers as they come out of league-v4 (`"EMERALD"`), in French. */
const TIER_LABELS: Record<string, string> = {
    UNRANKED: "Non classé",
    IRON: "Fer",
    BRONZE: "Bronze",
    SILVER: "Argent",
    GOLD: "Or",
    PLATINUM: "Platine",
    EMERALD: "Émeraude",
    DIAMOND: "Diamant",
    MASTER: "Maître",
    GRANDMASTER: "Grand Maître",
    CHALLENGER: "Challenger",
};

export function formatRank(rank: Rank | string | null | undefined): string {
    if (!rank) return "Non classé";
    const key = String(rank)
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
    return rankLabels[key as Rank] ?? TIER_LABELS[key] ?? String(rank);
}

/**
 * A full ranked line: `formatTier("EMERALD", "II", 46)` -> `"Émeraude II (46 LP)"`.
 * Apex tiers have no meaningful division, so it is dropped.
 */
export function formatTier(
    tier: string | null | undefined,
    division?: string | null,
    leaguePoints?: number | null,
): string {
    if (!tier) return "Non classé";
    const upper = tier.toUpperCase();
    const name = TIER_LABELS[upper] ?? tier;
    const apex =
        upper === "MASTER" || upper === "GRANDMASTER" || upper === "CHALLENGER";
    const withDivision = !apex && division ? `${name} ${division}` : name;
    return typeof leaguePoints === "number"
        ? `${withDivision} (${formatNumber(leaguePoints)}${NBSP}LP)`
        : withDivision;
}

/** Queue names Riot exposes, in French. */
export function formatQueue(queue: string | null | undefined): string {
    if (!queue) return "Partie";
    const map: Record<string, string> = {
        "Ranked Solo/Duo": "Classée solo/duo",
        "Ranked Flex": "Classée flexible",
        "Normal Draft": "Normale draft",
        "Normal Blind": "Normale aveugle",
        ARAM: "ARAM",
        Quickplay: "Partie rapide",
    };
    return map[queue] ?? queue;
}

// ------------------------------------------------------------------ roles ---

export const roleLabels: Record<Role, string> = {
    0: "Top",
    1: "Jungle",
    2: "Mid",
    3: "ADC",
    4: "Support",
};

export const roleLongLabels: Record<Role, string> = {
    0: "Toplane",
    1: "Jungle",
    2: "Midlane",
    3: "Botlane",
    4: "Support",
};

export function formatRole(role: Role | null | undefined): string {
    return role === null || role === undefined ? "—" : (roleLabels[role] ?? "—");
}

// ------------------------------------------------------------------ dates ---

const MONTHS = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
];

function toDate(value: Date | number | string): Date | null {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** `"26 août 2026"`. */
export function formatDate(value: Date | number | string): string {
    const date = toDate(value);
    if (!date) return "—";
    return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `"26 août 2026 à 14:05"`. */
export function formatDateTime(value: Date | number | string): string {
    const date = toDate(value);
    if (!date) return "—";
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(
        date.getMinutes(),
    ).padStart(2, "0")}`;
    return `${formatDate(date)} à ${time}`;
}

/** `"il y a 3 h"`, `"à l'instant"`, `"dans 2 j"`. */
export function formatRelativeTime(
    value: Date | number | string,
    now: Date | number = Date.now(),
): string {
    const date = toDate(value);
    if (!date) return "—";
    const reference = now instanceof Date ? now.getTime() : now;
    const deltaSeconds = Math.round((date.getTime() - reference) / 1000);
    const past = deltaSeconds <= 0;
    const abs = Math.abs(deltaSeconds);

    let body: string;
    if (abs < 45) return "à l'instant";
    if (abs < 3600) body = `${Math.round(abs / 60)}${NBSP}min`;
    else if (abs < 86_400) body = `${Math.round(abs / 3600)}${NBSP}h`;
    else if (abs < 2_592_000) body = `${Math.round(abs / 86_400)}${NBSP}j`;
    else if (abs < 31_536_000) body = `${Math.round(abs / 2_592_000)}${NBSP}mois`;
    else
        body = `${Math.round(abs / 31_536_000)}${NBSP}an${abs >= 63_072_000 ? "s" : ""}`;

    return past ? `il y a ${body}` : `dans ${body}`;
}

/** `"2026-08-26"` -> `"26 août 2026"`, tolerant of a `null` dataset date. */
export function formatDatasetDate(date: string | null | undefined): string {
    if (!date) return "date inconnue";
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return date;
    const [, year, month, day] = match;
    return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** `"Nom#TAG"` from the two halves, tolerant of missing pieces. */
export function formatRiotId(
    gameName: string | null | undefined,
    tagLine: string | null | undefined,
): string {
    if (!gameName) return tagLine ? `#${tagLine}` : "—";
    return tagLine ? `${gameName}#${tagLine}` : gameName;
}

/** `"KDA 4,67"` style ratio, `"Parfait"` when there are no deaths. */
export function formatKda(kills: number, deaths: number, assists: number): string {
    if (deaths === 0) return "Parfait";
    return formatNumber((kills + assists) / deaths, 2);
}
