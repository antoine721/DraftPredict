/**
 * The five positions of a Summoner's Rift team.
 *
 * The numeric values are part of the on-the-wire dataset format (DraftGap
 * dataset v5) and must not change.
 */
export const Role = {
    Top: 0,
    Jungle: 1,
    Middle: 2,
    Bottom: 3,
    Support: 4,

    // Riot-style aliases, kept so callers can use either vocabulary.
    TOP: 0,
    JUNGLE: 1,
    MIDDLE: 2,
    BOTTOM: 3,
    UTILITY: 4,
} as const;

export const ROLES = [0, 1, 2, 3, 4] as const;

export type Role = (typeof ROLES)[number];

export const displayNameByRole: Record<Role, string> = {
    [Role.Top]: "Top",
    [Role.Jungle]: "Jungle",
    [Role.Middle]: "Middle",
    [Role.Bottom]: "Bottom",
    [Role.Support]: "Support",
};

/** Riot / LCU position identifiers, indexed by {@link Role}. */
export const riotPositionByRole: Record<Role, string> = {
    [Role.Top]: "TOP",
    [Role.Jungle]: "JUNGLE",
    [Role.Middle]: "MIDDLE",
    [Role.Bottom]: "BOTTOM",
    [Role.Support]: "UTILITY",
};

const roleByName = new Map<string, Role>([
    ["top", Role.Top],
    ["jungle", Role.Jungle],
    ["jgl", Role.Jungle],
    ["jg", Role.Jungle],
    ["middle", Role.Middle],
    ["mid", Role.Middle],
    ["bottom", Role.Bottom],
    ["bot", Role.Bottom],
    ["adc", Role.Bottom],
    ["support", Role.Support],
    ["utility", Role.Support],
    ["sup", Role.Support],
    ["supp", Role.Support],
]);

export function isRole(value: unknown): value is Role {
    return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 4
    );
}

/**
 * Parses a role from any of the common spellings ("TOP", "utility", "adc", …).
 * Returns `undefined` when the name is not recognised.
 */
export function getRoleFromString(role: string): Role | undefined {
    return roleByName.get(role.trim().toLowerCase());
}
