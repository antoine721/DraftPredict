/**
 * Elo-style ratings. A rating is a winrate expressed on a logit scale where
 * 400 points is a factor 10 in odds; 0 rating is a 50% winrate.
 */

/** Winrate implied by a rating difference. */
export function ratingToWinrate(d: number): number {
    return 1 / (1 + Math.pow(10, -d / 400));
}

/** Rating difference implied by a winrate. */
export function winrateToRating(w: number): number {
    return -400 * Math.log10(1 / w - 1);
}

/** Winrate of a `w1` player against a `w2` player. */
export function getMatchupWinrate(w1: number, w2: number): number {
    return ratingToWinrate(winrateToRating(w1) - winrateToRating(w2));
}

/** Winrate of a `w1` player teamed up with a `w2` player. */
export function getDuoWinrate(w1: number, w2: number): number {
    return ratingToWinrate(winrateToRating(w1) + winrateToRating(w2));
}
