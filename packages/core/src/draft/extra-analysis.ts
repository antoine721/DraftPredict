import { defaultChampionRoleData } from "../models/dataset/ChampionRoleData.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";
import { ratingToWinrate, winrateToRating } from "../rating/ratings.js";
import { priorGamesByRiskLevel } from "../risk/risk-level.js";
import { addStats } from "../stats/stats.js";
import type { AnalyzeDraftConfig, DraftResult } from "./analysis.js";

/** Number of duration buckets the time analysis reports. */
export const RATING_BY_TIME_BUCKETS = 5;

export type DraftExtraChampionTimeResult = {
    championKey: string;
    role: Role;
    rating: number;
};

export type DraftExtraTimeResult = {
    championResults: DraftExtraChampionTimeResult[];
    totalRating: number;
};

export type DraftExtraAnalysis = {
    ratingByTime: DraftExtraTimeResult[];
};

/**
 * How much better or worse a team gets as the game goes long.
 *
 * For each duration bucket, every champion's winrate in games of that length is
 * compared to its overall winrate; the difference in rating is the champion's
 * scaling. `enemy` is unused (kept for signature compatibility with DraftGap).
 */
export function analyzeDraftExtra(
    dataset: Dataset,
    fullDataset: Dataset,
    team: Map<Role, string>,
    enemy: Map<Role, string>,
    config: AnalyzeDraftConfig,
): DraftExtraAnalysis {
    void dataset;
    void enemy;

    const priorGames = priorGamesByRiskLevel[config.riskLevel];

    const ally = [...team.entries()];
    const teamChampions = ally.map(
        ([role, champion]) =>
            fullDataset.championData[champion]?.statsByRole[role] ??
            defaultChampionRoleData(),
    );

    return {
        ratingByTime: Array.from({ length: RATING_BY_TIME_BUCKETS }).map((_, i) => {
            const championTimeRatings = teamChampions.map((champion) => {
                const championTime = champion.statsByTime[i];

                const baseChampionStats = addStats(champion, {
                    games: priorGames,
                    wins: priorGames * 0.5,
                });
                const baseChampionWinrate =
                    baseChampionStats.wins / baseChampionStats.games;
                const baseChampionRating = winrateToRating(baseChampionWinrate);

                const championStats = addStats(championTime, {
                    games: priorGames,
                    wins: priorGames * baseChampionWinrate,
                });
                const championTimeRating = winrateToRating(
                    championStats.wins / championStats.games,
                );

                return championTimeRating - baseChampionRating;
            });

            const totalRating = championTimeRatings.reduce(
                (acc, rating) => acc + rating,
                0,
            );

            return {
                championResults: championTimeRatings.map((rating, j) => ({
                    championKey: ally[j][1],
                    role: ally[j][0],
                    rating,
                })),
                totalRating,
            };
        }),
    };
}

export type WinrateByTime = {
    /** Lower bound of the duration bucket, in minutes. */
    duration: number;
    winrate: number;
};

/**
 * The draft's win probability as a function of game length.
 *
 * Takes the draft's flat rating and adds the ally team's scaling for the
 * bucket, minus the enemy team's, then converts back to a winrate.
 */
export function getDraftResultWinrateByTime(
    dataset: Dataset,
    draftResult: DraftResult,
    team: Map<Role, string>,
    enemy: Map<Role, string>,
    config: AnalyzeDraftConfig,
): WinrateByTime[] {
    const allyExtra = analyzeDraftExtra(dataset, dataset, team, enemy, config);
    const enemyExtra = analyzeDraftExtra(dataset, dataset, enemy, team, config);

    return allyExtra.ratingByTime.map((allyBucket, i) => ({
        duration: 20 + i * 5,
        winrate: ratingToWinrate(
            draftResult.totalRating +
                allyBucket.totalRating -
                enemyExtra.ratingByTime[i].totalRating,
        ),
    }));
}
