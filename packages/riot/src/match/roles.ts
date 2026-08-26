import { Role, getRoleFromString } from "@draftpredict/core";

/**
 * Riot exposes a position four different ways and none of them is reliable on
 * its own:
 *
 * - `teamPosition`      — best effort, `""` when Riot could not decide;
 * - `individualPosition` — same values plus `"Invalid"`;
 * - `lane`               — `TOP|JUNGLE|MIDDLE|MID|BOTTOM|BOT|NONE`;
 * - `role`               — `SOLO|CARRY|SUPPORT|DUO|DUO_CARRY|DUO_SUPPORT|NONE`.
 *
 * {@link normalizeRole} tries them in that order and finally combines
 * `lane` + `role` (the only way to tell a bot-lane support from an ADC on old
 * matches). Returns `null` when nothing usable is present — the caller then
 * falls back to positional assignment.
 */
export function normalizeRole(
    teamPosition?: string | null,
    individualPosition?: string | null,
    lane?: string | null,
    role?: string | null,
): Role | null {
    return (
        parsePosition(teamPosition) ??
        parsePosition(individualPosition) ??
        fromLaneAndRole(lane, role) ??
        null
    );
}

const UNUSABLE = new Set(["", "none", "invalid", "undefined", "null", "afk"]);

function clean(value: string | null | undefined): string {
    return (value ?? "").trim().toLowerCase();
}

/** `TOP`/`JUNGLE`/`MIDDLE`/`BOTTOM`/`UTILITY` and friends. */
function parsePosition(value: string | null | undefined): Role | null {
    const normalized = clean(value);
    if (UNUSABLE.has(normalized)) return null;
    return getRoleFromString(normalized) ?? null;
}

function fromLaneAndRole(
    lane: string | null | undefined,
    role: string | null | undefined,
): Role | null {
    const laneName = clean(lane);
    const roleName = clean(role);
    const supportish =
        roleName === "support" || roleName === "duo_support" || roleName === "utility";

    if (laneName === "bottom" || laneName === "bot") {
        return supportish ? Role.Support : Role.Bottom;
    }
    if (laneName === "middle" || laneName === "mid") return Role.Middle;
    if (laneName === "top") return supportish ? Role.Support : Role.Top;
    if (laneName === "jungle") return Role.Jungle;

    // `lane: NONE` happens on very old matches; the role field can still tell
    // a support apart, otherwise there is nothing to go on.
    if (supportish) return Role.Support;
    return null;
}

/**
 * Assigns exactly one role per player of a five-man team.
 *
 * Normalised roles win, first come first served; anybody left over is dropped
 * into the remaining slots in participant order, which matches Riot's own
 * ordering convention (top, jungle, mid, bot, support).
 */
export function assignTeamRoles<T>(
    players: readonly T[],
    roleOf: (player: T) => Role | null,
): Map<T, Role> {
    const assigned = new Map<T, Role>();
    const taken = new Set<Role>();
    const leftovers: T[] = [];

    for (const player of players) {
        const role = roleOf(player);
        if (role === null || taken.has(role)) {
            leftovers.push(player);
            continue;
        }
        taken.add(role);
        assigned.set(player, role);
    }

    const free = (
        [Role.Top, Role.Jungle, Role.Middle, Role.Bottom, Role.Support] as Role[]
    ).filter((role) => !taken.has(role));
    leftovers.forEach((player, index) => {
        const role = free[index];
        if (role === undefined) return;
        assigned.set(player, role);
    });
    return assigned;
}
