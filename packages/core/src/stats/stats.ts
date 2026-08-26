import type { Stats } from "../models/Stats.js";

export function addStats(...stats: Stats[]): Stats {
    let wins = 0;
    let games = 0;

    for (const stat of stats) {
        wins += stat.wins;
        games += stat.games;
    }

    return {
        wins,
        games,
    };
}

export function multiplyStats(stats: Stats, factor: number): Stats {
    return {
        wins: stats.wins * factor,
        games: stats.games * factor,
    };
}

export function divideStats(stats: Stats, divisor: number): Stats {
    return {
        wins: stats.wins / divisor,
        games: stats.games / divisor,
    };
}

export function averageStats(...stats: Stats[]): Stats {
    return divideStats(addStats(...stats), stats.length);
}
