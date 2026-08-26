import type { Dataset } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";
import { ROLES } from "../models/Role.js";
import type { AnalyzeDraftConfig, DraftResult } from "./analysis.js";
import { analyzeDraft } from "./analysis.js";
import { getStats } from "./utils.js";

export type Suggestion = {
    championKey: string;
    role: Role;
    /** Total rating of the draft with this champion picked. */
    rating: number;
    /** Ally win probability of the draft with this champion picked. */
    winrate: number;
    draftResult: DraftResult;
};

/**
 * Every (champion, open role) pick that is legal in the current draft, best
 * first.
 *
 * `dataset` is the per-patch dataset, `synergyMatchupDataset` the 30-day one.
 * The `minGames` config is compared against the champion's games scaled from 30
 * days down to a 7-day patch, exactly like DraftGap.
 */
export function getSuggestions(
    dataset: Dataset,
    synergyMatchupDataset: Dataset,
    team: Map<Role, string>,
    enemy: Map<Role, string>,
    config: AnalyzeDraftConfig,
): Suggestion[] {
    const remainingRoles = ROLES.filter((role) => !team.has(role));
    const enemyChampions = new Set(enemy.values());
    const allyChampions = new Set(team.values());

    // Work on a copy so callers never observe the temporary picks.
    const workingTeam = new Map(team);

    const suggestions: Suggestion[] = [];

    for (const championKey of Object.keys(dataset.championData)) {
        if (enemyChampions.has(championKey) || allyChampions.has(championKey)) continue;

        for (const role of remainingRoles) {
            if (workingTeam.has(role)) continue;
            if (
                (getStats(synergyMatchupDataset, championKey, role).games / 30) * 7 <
                config.minGames
            )
                continue;

            workingTeam.set(role, championKey);
            const draftResult = analyzeDraft(
                dataset,
                synergyMatchupDataset,
                workingTeam,
                enemy,
                config,
            );
            workingTeam.delete(role);

            suggestions.push({
                championKey,
                role,
                rating: draftResult.totalRating,
                winrate: draftResult.winrate,
                draftResult,
            });
        }
    }

    return suggestions.sort((a, b) => b.draftResult.winrate - a.draftResult.winrate);
}

export type BanSuggestion = {
    championKey: string;
    /** Role the champion would most likely be picked in by the enemy. */
    role: Role;
    /**
     * Rating the champion would add to the enemy draft. Higher means banning it
     * is more valuable.
     */
    rating: number;
    /** Ally win probability if the enemy got this champion. */
    winrate: number;
    draftResult: DraftResult;
};

/**
 * Champions worth banning: the ones that would hurt the ally team most if the
 * enemy picked them into one of their open roles. Most threatening first.
 *
 * Champions already picked by either team, or already banned, are skipped.
 */
export function getBanSuggestions(
    dataset: Dataset,
    synergyMatchupDataset: Dataset,
    team: Map<Role, string>,
    enemy: Map<Role, string>,
    config: AnalyzeDraftConfig,
    bans: readonly string[] = [],
): BanSuggestion[] {
    // Baseline from the enemy's point of view, so that `rating` measures what
    // the champion adds to *their* draft.
    const enemyBaseline = analyzeDraft(
        dataset,
        synergyMatchupDataset,
        enemy,
        team,
        config,
    );

    const enemySuggestions = getSuggestions(
        dataset,
        synergyMatchupDataset,
        enemy,
        team,
        config,
    );

    const banned = new Set(bans);
    const bestByChampion = new Map<string, BanSuggestion>();

    for (const suggestion of enemySuggestions) {
        if (banned.has(suggestion.championKey)) continue;

        const existing = bestByChampion.get(suggestion.championKey);
        // getSuggestions is sorted best-first for the enemy, so the first entry
        // for a champion is already its strongest role.
        if (existing !== undefined) continue;

        bestByChampion.set(suggestion.championKey, {
            championKey: suggestion.championKey,
            role: suggestion.role,
            rating: suggestion.draftResult.totalRating - enemyBaseline.totalRating,
            // The suggestion was computed from the enemy's point of view.
            winrate: 1 - suggestion.draftResult.winrate,
            draftResult: suggestion.draftResult,
        });
    }

    return [...bestByChampion.values()].sort((a, b) => b.rating - a.rating);
}
