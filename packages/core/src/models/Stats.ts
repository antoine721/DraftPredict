/** A win/loss sample. `games` may be fractional after averaging. */
export type Stats = {
    wins: number;
    games: number;
};

/** DraftGap-compatible alias. */
export type RankData = Stats;

export function emptyStats(): Stats {
    return { wins: 0, games: 0 };
}

/**
 * Winrate of a sample, with DraftGap's edge case: an empty sample is 50%.
 *
 * NOTE: the engine internals deliberately compute `wins / games` inline in the
 * places where DraftGap does (which can yield NaN); this helper is for callers.
 */
export function winrate(stats: Stats): number {
    if (stats.games === 0) return 0.5;
    return stats.wins / stats.games;
}
