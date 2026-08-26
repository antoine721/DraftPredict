import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    BuildMatchupData,
    EntityStats,
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset.js";
import type { Role } from "../models/Role.js";
import { ratingToWinrate, winrateToRating } from "../rating/ratings.js";
import { buildPriorGamesByRiskLevel } from "../risk/risk-level.js";
import { addStats } from "../stats/stats.js";

export type { EntityStats };

export type EntityAnalysisResult = {
    baseResult: BaseEntityAnalysisResult;
    matchupResult: EntityMatchupsAnalysisResult;
    totalRating: number;
};

export type BaseEntityAnalysisResult = {
    rating: number;
};

export type EntityMatchupAnalysisResult = {
    championKey: string;
    role: Role;
    rating: number;
    wins: number;
    games: number;
    raw: {
        wins: number;
        games: number;
    };
    expected: number;
};

export type EntityMatchupsAnalysisResult = {
    matchupResults: EntityMatchupAnalysisResult[];
    totalRating: number;
};

/** Reads the stats of one build entity out of a build dataset. */
export type EntityStatsGetter<T> = (
    dataset: PartialBuildDataset,
    entity: T,
) => EntityStats;

/**
 * How much a build entity is worth: its standalone rating plus how well it
 * performs into each of the enemy champions specifically.
 */
export function analyzeEntity<T>(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
    getStats: EntityStatsGetter<T>,
    entity: T,
): EntityAnalysisResult {
    const baseResult = analyzeBaseEntity(
        partialBuildDataset,
        fullBuildDataset,
        config,
        getStats,
        entity,
    );
    const matchupResult = analyzeEntityMatchups(
        partialBuildDataset,
        fullBuildDataset,
        config,
        getStats,
        entity,
    );

    const totalRating = baseResult.rating + matchupResult.totalRating;

    return {
        baseResult,
        matchupResult,
        totalRating,
    };
}

export function analyzeBaseEntity<T>(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
    getStats: EntityStatsGetter<T>,
    entity: T,
): BaseEntityAnalysisResult {
    const priorGames = buildPriorGamesByRiskLevel[config.riskLevel];

    const championWinrate = partialBuildDataset.wins / partialBuildDataset.games;

    const previousEntityStats = getStats(fullBuildDataset, entity);
    const previousEntityWinrate = previousEntityStats.wins / previousEntityStats.games;
    const currentEntityStats = getStats(partialBuildDataset, entity);

    const entityStats = addStats(currentEntityStats, {
        wins: priorGames * previousEntityWinrate,
        games: priorGames,
    });
    const entityWinrate = entityStats.wins / entityStats.games;
    const entityRating = winrateToRating(entityWinrate);

    const rating = entityRating - winrateToRating(championWinrate);

    return {
        rating,
    };
}

export function analyzeEntityMatchups<T>(
    partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
    getStats: EntityStatsGetter<T>,
    entity: T,
): EntityMatchupsAnalysisResult {
    const matchupResults = fullBuildDataset.matchups.map((m) =>
        analyzeEntityMatchup(
            partialBuildDataset,
            fullBuildDataset,
            config,
            getStats,
            entity,
            m,
        ),
    );

    const totalRating = matchupResults.reduce((total, r) => total + r.rating, 0);

    return {
        matchupResults,
        totalRating,
    };
}

export function analyzeEntityMatchup<T>(
    _partialBuildDataset: PartialBuildDataset,
    fullBuildDataset: FullBuildDataset,
    config: AnalyzeDraftConfig,
    getStats: EntityStatsGetter<T>,
    entity: T,
    matchup: BuildMatchupData,
): EntityMatchupAnalysisResult {
    const priorGames = buildPriorGamesByRiskLevel[config.riskLevel];

    // Calculate entity rating
    const championWinrate = fullBuildDataset.wins / fullBuildDataset.games;
    const championWithEntityStats = getStats(fullBuildDataset, entity);
    const championWithEntityWinrate =
        championWithEntityStats.wins / championWithEntityStats.games;

    const entityRating =
        winrateToRating(championWithEntityWinrate) - winrateToRating(championWinrate);

    // Calculate entity rating in matchup
    const matchupWinrate = matchup.wins / matchup.games;
    const matchupRating = winrateToRating(matchupWinrate);
    const expectedWithEntityMatchupRating = matchupRating + entityRating;
    const expectedWithEntityMatchupWinrate = ratingToWinrate(
        expectedWithEntityMatchupRating,
    );

    const rawMatchupWithEntityStats = getStats(matchup, entity);

    const matchupWithEntityStats = addStats(rawMatchupWithEntityStats, {
        wins: priorGames * expectedWithEntityMatchupWinrate,
        games: priorGames,
    });
    const matchupWithEntityWinrate =
        matchupWithEntityStats.wins / matchupWithEntityStats.games;
    const matchupWithEntityRating = winrateToRating(matchupWithEntityWinrate);
    const entityRatingInMatchup = matchupWithEntityRating - matchupRating;

    // Calculate final rating
    const rating = entityRatingInMatchup - entityRating;

    return {
        championKey: matchup.championKey,
        role: matchup.role,
        rating: isNaN(rating) ? 0 : rating,
        games: rawMatchupWithEntityStats.games,
        wins:
            ratingToWinrate(
                winrateToRating(
                    rawMatchupWithEntityStats.wins / rawMatchupWithEntityStats.games,
                ) - expectedWithEntityMatchupRating,
            ) * rawMatchupWithEntityStats.games,
        raw: {
            games: rawMatchupWithEntityStats.games,
            wins: rawMatchupWithEntityStats.wins,
        },
        expected: expectedWithEntityMatchupWinrate,
    };
}
