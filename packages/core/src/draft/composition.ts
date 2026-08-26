import type { ChampionDamageProfile } from "../models/dataset/ChampionDamageProfile.js";
import { normalizeDamageProfile } from "../models/dataset/ChampionDamageProfile.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";
import type { Stats } from "../models/Stats.js";
import { getTeamDamageDistribution } from "../damage-distribution/damage-distribution.js";
import { getStats } from "./utils.js";

export type TeamCompositionChampion = {
    role: Role;
    championKey: string;
    wins: number;
    games: number;
    winrate: number;
    damageProfile: ChampionDamageProfile;
};

export type TeamComposition = {
    champions: TeamCompositionChampion[];
    /** Summed damage profile of the team. */
    damageDistribution: ChampionDamageProfile;
    /** Same, rescaled so the three channels sum to 1 (all-zero when empty). */
    damageDistributionShare: ChampionDamageProfile;
    /** Summed wins/games of the picked champions. */
    totalStats: Stats;
    /** Games-weighted average winrate of the picked champions. */
    averageWinrate: number;
    /** Roles that still need a pick. */
    openRoles: Role[];
    isComplete: boolean;
};

/**
 * UI-facing summary of one team: per-champion stats, the team's damage split
 * and how well the picked champions do on average.
 *
 * Pure aggregation of dataset values — it makes no draft-strength claim; use
 * `analyzeDraft` for that.
 */
export function getTeamComposition(
    dataset: Dataset,
    team: Map<Role, string>,
): TeamComposition {
    const champions: TeamCompositionChampion[] = [];

    let totalWins = 0;
    let totalGames = 0;

    for (const role of [0, 1, 2, 3, 4] as Role[]) {
        const championKey = team.get(role);
        if (championKey === undefined) continue;

        const stats = getStats(dataset, championKey, role);
        const damageProfile = dataset.championData[championKey]?.statsByRole[role]
            ?.damageProfile ?? { magic: 0, physical: 0, true: 0 };

        totalWins += stats.wins;
        totalGames += stats.games;

        champions.push({
            role,
            championKey,
            wins: stats.wins,
            games: stats.games,
            winrate: stats.games === 0 ? 0.5 : stats.wins / stats.games,
            damageProfile: { ...damageProfile },
        });
    }

    const damageDistribution = getTeamDamageDistribution(dataset, team);
    const openRoles = ([0, 1, 2, 3, 4] as Role[]).filter((role) => !team.has(role));

    return {
        champions,
        damageDistribution,
        damageDistributionShare: normalizeDamageProfile(damageDistribution),
        totalStats: { wins: totalWins, games: totalGames },
        averageWinrate: totalGames === 0 ? 0.5 : totalWins / totalGames,
        openRoles,
        isComplete: openRoles.length === 0,
    };
}
