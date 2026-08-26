import type { Role } from "../models/Role.js";
import { isRole, ROLES } from "../models/Role.js";
import type { Team } from "../models/Team.js";

/**
 * The full state of a champion select: both team compositions and both ban
 * lists. `Map`s keep role slots sparse, which is what the engine wants.
 */
export type DraftState = {
    ally: Map<Role, string>;
    opponent: Map<Role, string>;
    bans: {
        ally: string[];
        opponent: string[];
    };
};

/** JSON-safe representation of a {@link DraftState} (Maps become tuple lists). */
export type SerializedDraftState = {
    ally: [Role, string][];
    opponent: [Role, string][];
    bans: {
        ally: string[];
        opponent: string[];
    };
};

export function emptyDraftState(): DraftState {
    return {
        ally: new Map(),
        opponent: new Map(),
        bans: { ally: [], opponent: [] },
    };
}

/**
 * Builds a draft state from two 5-slot arrays indexed by {@link Role}. Slots
 * holding `null`/`undefined`/`""` stay empty.
 */
export function draftStateFromArrays(
    ally: readonly (string | null | undefined)[],
    opponent: readonly (string | null | undefined)[],
    bans: { ally?: readonly string[]; opponent?: readonly string[] } = {},
): DraftState {
    return {
        ally: teamFromArray(ally),
        opponent: teamFromArray(opponent),
        bans: {
            ally: [...(bans.ally ?? [])],
            opponent: [...(bans.opponent ?? [])],
        },
    };
}

function teamFromArray(
    champions: readonly (string | null | undefined)[],
): Map<Role, string> {
    const team = new Map<Role, string>();
    for (const role of ROLES) {
        const championKey = champions[role];
        if (championKey === null || championKey === undefined || championKey === "")
            continue;
        team.set(role, championKey);
    }
    return team;
}

/** The 5-slot array form of a team, with `null` for empty slots. */
export function teamToArray(team: Map<Role, string>): (string | null)[] {
    return ROLES.map((role) => team.get(role) ?? null);
}

export function serializeDraftState(state: DraftState): SerializedDraftState {
    return {
        ally: [...state.ally.entries()],
        opponent: [...state.opponent.entries()],
        bans: {
            ally: [...state.bans.ally],
            opponent: [...state.bans.opponent],
        },
    };
}

export function deserializeDraftState(serialized: SerializedDraftState): DraftState {
    return {
        ally: deserializeTeam(serialized.ally),
        opponent: deserializeTeam(serialized.opponent),
        bans: {
            ally: [...(serialized.bans?.ally ?? [])],
            opponent: [...(serialized.bans?.opponent ?? [])],
        },
    };
}

function deserializeTeam(entries: readonly [Role, string][]): Map<Role, string> {
    const team = new Map<Role, string>();
    for (const entry of entries ?? []) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [role, championKey] = entry;
        if (!isRole(role)) continue;
        if (typeof championKey !== "string" || championKey === "") continue;
        team.set(role, championKey);
    }
    return team;
}

export function getTeam(state: DraftState, team: Team): Map<Role, string> {
    return team === "ally" ? state.ally : state.opponent;
}

/** A copy of `state` with `championKey` placed in `role` for `team`. */
export function withPick(
    state: DraftState,
    team: Team,
    role: Role,
    championKey: string,
): DraftState {
    const next = cloneDraftState(state);
    getTeam(next, team).set(role, championKey);
    return next;
}

/** A copy of `state` with `role` cleared for `team`. */
export function withoutPick(state: DraftState, team: Team, role: Role): DraftState {
    const next = cloneDraftState(state);
    getTeam(next, team).delete(role);
    return next;
}

export function cloneDraftState(state: DraftState): DraftState {
    return {
        ally: new Map(state.ally),
        opponent: new Map(state.opponent),
        bans: {
            ally: [...state.bans.ally],
            opponent: [...state.bans.opponent],
        },
    };
}

/** Champion keys that are unavailable: picked by either team, or banned. */
export function getUnavailableChampions(state: DraftState): Set<string> {
    return new Set([
        ...state.ally.values(),
        ...state.opponent.values(),
        ...state.bans.ally,
        ...state.bans.opponent,
    ]);
}

/** Roles with no champion yet, for one team. */
export function getOpenRoles(team: Map<Role, string>): Role[] {
    return ROLES.filter((role) => !team.has(role));
}

export function isDraftComplete(state: DraftState): boolean {
    return state.ally.size === ROLES.length && state.opponent.size === ROLES.length;
}
