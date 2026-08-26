import {
    ROLES,
    getRoleFromString,
    predictRoles,
    type Dataset,
    type Role,
} from "@draftpredict/core";

/**
 * Turning champ-select cells into roles.
 *
 * Riot hands us `assignedPosition` in ranked draft and nothing at all in blind
 * pick, ARAM, customs and several rotating modes. The engine needs a role for
 * every champion, so the missing ones are inferred from how often each
 * champion is actually played in each role — that is what `predictRoles` in
 * `@draftpredict/core` does.
 */

/** Riot's position strings, as they appear in a champ-select session. */
export const RIOT_POSITIONS = ["top", "jungle", "middle", "bottom", "utility"] as const;

/**
 * Parses `assignedPosition`.
 *
 * `""` (and `"none"`) mean "Riot did not assign one", which is a state, not an
 * error — the caller infers instead.
 */
export function parseAssignedPosition(
    position: string | undefined | null,
): Role | null {
    const normalized = (position ?? "").trim().toLowerCase();
    if (normalized.length === 0 || normalized === "none" || normalized === "invalid") {
        return null;
    }
    return getRoleFromString(normalized) ?? null;
}

/** One side's cell, reduced to what role assignment needs. */
export type RoleAssignmentCell = {
    cellId: number;
    assignedRole: Role | null;
    /** The champion this cell is showing: locked first, hover second. */
    championKey: string | null;
};

export type RoleAssignmentOptions = {
    /** Dataset used to infer missing positions. Without it, cells fall back to slot order. */
    dataset?: Dataset | undefined;
    /** Set to false to keep unassigned cells unassigned. Default true. */
    infer?: boolean | undefined;
};

/**
 * Assigns a distinct role to every cell of one team.
 *
 * 1. Cells Riot gave a position keep it (first cell wins a duplicate).
 * 2. Cells showing a champion are placed by `predictRoles`, which picks the
 *    single most likely full composition, so two champions never collide.
 * 3. Anything left (empty enemy cells before their turn) fills the remaining
 *    roles in cell order, so the maps stay stable frame to frame.
 */
export function assignRoles(
    cells: readonly RoleAssignmentCell[],
    options: RoleAssignmentOptions = {},
): Map<number, Role> {
    const roleByCell = new Map<number, Role>();
    const taken = new Set<Role>();

    for (const cell of cells) {
        if (cell.assignedRole === null) continue;
        if (taken.has(cell.assignedRole)) continue;
        roleByCell.set(cell.cellId, cell.assignedRole);
        taken.add(cell.assignedRole);
    }

    const remaining = cells.filter((cell) => !roleByCell.has(cell.cellId));
    if (remaining.length === 0) return roleByCell;

    const infer = options.infer ?? true;
    if (infer && options.dataset && remaining.some((cell) => cell.championKey)) {
        inferRemaining(cells, remaining, roleByCell, taken, options.dataset);
    }

    // Whatever is still unassigned takes the first free role, in cell order.
    for (const cell of cells) {
        if (roleByCell.has(cell.cellId)) continue;
        const free = ROLES.find((role) => !taken.has(role));
        if (free === undefined) break;
        roleByCell.set(cell.cellId, free);
        taken.add(free);
    }

    return roleByCell;
}

function inferRemaining(
    cells: readonly RoleAssignmentCell[],
    remaining: readonly RoleAssignmentCell[],
    roleByCell: Map<number, Role>,
    taken: Set<Role>,
    dataset: Dataset,
): void {
    // Champions already pinned to a role constrain the prediction.
    const knownRoles = new Map<Role, string>();
    for (const cell of cells) {
        const role = roleByCell.get(cell.cellId);
        if (role === undefined || !cell.championKey) continue;
        if (!knownRoles.has(role)) knownRoles.set(role, cell.championKey);
    }

    const championKeys: string[] = [];
    for (const key of knownRoles.values()) championKeys.push(key);
    for (const cell of remaining) {
        if (cell.championKey) championKeys.push(cell.championKey);
    }
    if (championKeys.length === 0) return;

    const predicted = predictRoles(dataset, championKeys, { knownRoles });

    // A champion can legitimately appear twice (two players hovering the same
    // pick), so consume the prediction champion by champion.
    const rolesByChampion = new Map<string, Role[]>();
    for (const [role, championKey] of predicted) {
        if (taken.has(role)) continue;
        const list = rolesByChampion.get(championKey);
        if (list) list.push(role);
        else rolesByChampion.set(championKey, [role]);
    }

    for (const cell of remaining) {
        if (!cell.championKey) continue;
        const candidates = rolesByChampion.get(cell.championKey);
        const role = candidates?.shift();
        if (role === undefined || taken.has(role)) continue;
        roleByCell.set(cell.cellId, role);
        taken.add(role);
    }
}
