import { ROLES, type Role, type Team } from "@draftpredict/core";
import type { SerializedChampSelectState, TeamEntries } from "../api/types";

/**
 * The draft board, in a shape a store can hold and a URL can carry.
 *
 * The engine wants `Map<Role, string>`; JSON, `localStorage` and the address
 * bar do not. The board is therefore a plain 5-slot record per team, converted
 * to the wire format at the edge with {@link teamEntries}.
 */

export type TeamBoard = Record<Role, string | null>;

export type DraftBoard = {
    ally: TeamBoard;
    opponent: TeamBoard;
    bans: { ally: string[]; opponent: string[] };
};

export type DraftSlot = { team: Team; role: Role };

export function emptyTeamBoard(): TeamBoard {
    return { 0: null, 1: null, 2: null, 3: null, 4: null };
}

export function emptyBoard(): DraftBoard {
    return {
        ally: emptyTeamBoard(),
        opponent: emptyTeamBoard(),
        bans: { ally: [], opponent: [] },
    };
}

export function cloneBoard(board: DraftBoard): DraftBoard {
    return {
        ally: { ...board.ally },
        opponent: { ...board.opponent },
        bans: { ally: [...board.bans.ally], opponent: [...board.bans.opponent] },
    };
}

/** `[role, championKey][]`, in role order — the API's wire format. */
export function teamEntries(team: TeamBoard): TeamEntries {
    return ROLES.flatMap((role) => {
        const key = team[role];
        return key ? [[role, key] as [Role, string]] : [];
    });
}

export function boardIsEmpty(board: DraftBoard): boolean {
    return (
        teamEntries(board.ally).length === 0 &&
        teamEntries(board.opponent).length === 0 &&
        board.bans.ally.length === 0 &&
        board.bans.opponent.length === 0
    );
}

export function pickedChampions(board: DraftBoard): Set<string> {
    const picked = new Set<string>();
    for (const role of ROLES) {
        const ally = board.ally[role];
        const enemy = board.opponent[role];
        if (ally) picked.add(ally);
        if (enemy) picked.add(enemy);
    }
    return picked;
}

/** Picked *or* banned — everything the picker must grey out. */
export function unavailableChampions(board: DraftBoard): Set<string> {
    const unavailable = pickedChampions(board);
    for (const key of board.bans.ally) unavailable.add(key);
    for (const key of board.bans.opponent) unavailable.add(key);
    return unavailable;
}

export function openRoles(team: TeamBoard): Role[] {
    return ROLES.filter((role) => !team[role]);
}

/** The next empty slot after `from`, wrapping — drives "pick then move on". */
export function nextOpenSlot(
    board: DraftBoard,
    from: DraftSlot | null,
): DraftSlot | null {
    const order: DraftSlot[] = [
        ...ROLES.map((role) => ({ team: "ally" as Team, role })),
        ...ROLES.map((role) => ({ team: "opponent" as Team, role })),
    ];
    const start = from
        ? order.findIndex(
              (slot) => slot.team === from.team && slot.role === from.role,
          ) + 1
        : 0;
    for (let offset = 0; offset < order.length; offset += 1) {
        const slot = order[(start + offset) % order.length]!;
        const team = slot.team === "ally" ? board.ally : board.opponent;
        if (!team[slot.role]) return slot;
    }
    return null;
}

/**
 * A champ-select state from the League Client, as a board.
 *
 * Hovers are merged into empty slots exactly like the server does, so the
 * gauge reacts while a teammate is still hovering instead of waiting for the
 * lock-in.
 */
export function boardFromChampSelect(state: SerializedChampSelectState): DraftBoard {
    const board = emptyBoard();
    for (const [role, key] of state.ally) board.ally[role] = key;
    for (const [role, key] of state.opponent) board.opponent[role] = key;
    for (const [role, key] of state.allyHovers) {
        if (!board.ally[role]) board.ally[role] = key;
    }
    for (const [role, key] of state.opponentHovers) {
        if (!board.opponent[role]) board.opponent[role] = key;
    }
    board.bans = {
        ally: [...(state.bans?.ally ?? [])],
        opponent: [...(state.bans?.opponent ?? [])],
    };
    return board;
}

/** Deep equality, used to avoid pushing no-op history entries. */
export function boardsEqual(a: DraftBoard, b: DraftBoard): boolean {
    for (const role of ROLES) {
        if (a.ally[role] !== b.ally[role]) return false;
        if (a.opponent[role] !== b.opponent[role]) return false;
    }
    return (
        a.bans.ally.join(",") === b.bans.ally.join(",") &&
        a.bans.opponent.join(",") === b.bans.opponent.join(",")
    );
}
