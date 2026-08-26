import {
    ROLES,
    isRank,
    isRegion,
    isRole,
    parseRiskLevel,
    type Rank,
    type Region,
    type RiskLevel,
    type Role,
} from "@draftpredict/core";
import { emptyBoard, type DraftBoard } from "./draft-board";

/**
 * The draft in the address bar.
 *
 * A draft must be shareable: copy the URL, send it to a duo, they see the same
 * board and the same numbers. The encoding is short and human-inspectable:
 *
 * `?ally=0-266.1-64&enemy=0-122&banA=1.2&risk=medium&rank=PLATINUM_PLUS`
 *
 * Decoding is deliberately forgiving — a hand-edited or truncated URL loads
 * whatever still makes sense instead of failing.
 */

export type DraftUrlState = {
    board: DraftBoard;
    riskLevel: RiskLevel | null;
    rank: Rank | null;
    region: Region | null;
    minGames: number | null;
    ignoreChampionWinrates: boolean | null;
};

export const DRAFT_URL_PARAMS = [
    "ally",
    "enemy",
    "banA",
    "banE",
    "risk",
    "rank",
    "region",
    "minGames",
    "icw",
] as const;

const PAIR_SEPARATOR = ".";
const ROLE_SEPARATOR = "-";

function encodeTeam(team: Record<Role, string | null>): string {
    return ROLES.filter((role) => team[role])
        .map((role) => `${role}${ROLE_SEPARATOR}${team[role]}`)
        .join(PAIR_SEPARATOR);
}

function decodeTeam(value: string | null): Record<Role, string | null> {
    const team: Record<Role, string | null> = {
        0: null,
        1: null,
        2: null,
        3: null,
        4: null,
    };
    if (!value) return team;
    for (const pair of value.split(PAIR_SEPARATOR)) {
        const [rawRole, rawKey] = pair.split(ROLE_SEPARATOR);
        const role = Number(rawRole);
        if (!isRole(role)) continue;
        if (!rawKey || !/^\d+$/.test(rawKey)) continue;
        team[role as Role] = rawKey;
    }
    return team;
}

function decodeBans(value: string | null): string[] {
    if (!value) return [];
    return value
        .split(PAIR_SEPARATOR)
        .map((key) => key.trim())
        .filter((key) => /^\d+$/.test(key))
        .slice(0, 5);
}

/** The params for a draft, ready for `URLSearchParams` / `setSearchParams`. */
export function encodeDraftParams(state: {
    board: DraftBoard;
    riskLevel?: RiskLevel | null;
    rank?: Rank | null;
    region?: Region | null;
    minGames?: number | null;
    ignoreChampionWinrates?: boolean | null;
}): Record<string, string> {
    const params: Record<string, string> = {};
    const ally = encodeTeam(state.board.ally);
    const enemy = encodeTeam(state.board.opponent);
    if (ally) params.ally = ally;
    if (enemy) params.enemy = enemy;
    if (state.board.bans.ally.length > 0) {
        params.banA = state.board.bans.ally.join(PAIR_SEPARATOR);
    }
    if (state.board.bans.opponent.length > 0) {
        params.banE = state.board.bans.opponent.join(PAIR_SEPARATOR);
    }
    if (state.riskLevel) params.risk = state.riskLevel;
    if (state.rank) params.rank = state.rank;
    if (state.region) params.region = state.region;
    if (typeof state.minGames === "number") params.minGames = String(state.minGames);
    if (typeof state.ignoreChampionWinrates === "boolean") {
        params.icw = state.ignoreChampionWinrates ? "1" : "0";
    }
    return params;
}

/** The `?…` string for a draft, `""` when there is nothing to share. */
export function encodeDraftSearch(
    state: Parameters<typeof encodeDraftParams>[0],
): string {
    const params = new URLSearchParams(encodeDraftParams(state));
    const query = params.toString();
    return query.length > 0 ? `?${query}` : "";
}

/** Reads a draft out of a query string. Unknown values are simply dropped. */
export function decodeDraftParams(input: URLSearchParams | string): DraftUrlState {
    const params = typeof input === "string" ? new URLSearchParams(input) : input;
    const board = emptyBoard();
    board.ally = decodeTeam(params.get("ally"));
    board.opponent = decodeTeam(params.get("enemy"));
    board.bans = {
        ally: decodeBans(params.get("banA")),
        opponent: decodeBans(params.get("banE")),
    };

    const rawRisk = params.get("risk");
    const rawRank = params
        .get("rank")
        ?.toUpperCase()
        .replace(/[\s-]+/g, "_");
    const rawRegion = params.get("region")?.toUpperCase();
    const rawMinGames = params.get("minGames");
    const rawIcw = params.get("icw");
    const minGames = rawMinGames === null ? Number.NaN : Number(rawMinGames);

    return {
        board,
        riskLevel: rawRisk ? (parseRiskLevel(rawRisk) ?? null) : null,
        rank: rawRank && isRank(rawRank) ? rawRank : null,
        region: rawRegion && isRegion(rawRegion) ? rawRegion : null,
        minGames:
            Number.isFinite(minGames) && minGames >= 0 ? Math.trunc(minGames) : null,
        ignoreChampionWinrates:
            rawIcw === null ? null : rawIcw === "1" || rawIcw === "true",
    };
}

/** `true` when the query carries at least one draft parameter. */
export function hasDraftParams(input: URLSearchParams | string): boolean {
    const params = typeof input === "string" ? new URLSearchParams(input) : input;
    return DRAFT_URL_PARAMS.some((key) => params.has(key));
}
