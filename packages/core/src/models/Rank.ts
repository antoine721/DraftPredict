export const RANKS = [
    "ALL",
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
    "PLATINUM_PLUS",
    "DIAMOND_PLUS",
] as const;

export type Rank = (typeof RANKS)[number];

export const displayNameByRank: Record<Rank, string> = {
    ALL: "All ranks",
    IRON: "Iron",
    BRONZE: "Bronze",
    SILVER: "Silver",
    GOLD: "Gold",
    PLATINUM: "Platinum",
    EMERALD: "Emerald",
    DIAMOND: "Diamond",
    MASTER: "Master",
    GRANDMASTER: "Grandmaster",
    CHALLENGER: "Challenger",
    PLATINUM_PLUS: "Platinum+",
    DIAMOND_PLUS: "Diamond+",
};

/** Ranks in the order they should be listed in a UI. */
export const RANKS_IN_DISPLAY_ORDER: readonly Rank[] = RANKS;

/** The ranks that map to a single tier (no "ALL", no "+" aggregates). */
export const SINGLE_TIER_RANKS: readonly Rank[] = [
    "IRON",
    "BRONZE",
    "SILVER",
    "GOLD",
    "PLATINUM",
    "EMERALD",
    "DIAMOND",
    "MASTER",
    "GRANDMASTER",
    "CHALLENGER",
];

export const DEFAULT_RANK: Rank = "PLATINUM_PLUS";

export function isRank(value: unknown): value is Rank {
    return typeof value === "string" && (RANKS as readonly string[]).includes(value);
}

/** Parses a rank from a case-insensitive string, `undefined` when unknown. */
export function parseRank(value: string): Rank | undefined {
    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
    return isRank(normalized) ? normalized : undefined;
}
