import type { Dataset } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";
import type { Stats } from "../models/Stats.js";

/**
 * Reads a sample out of a dataset. Missing entries read as `{wins: 0, games: 0}`
 * rather than throwing, which is what makes partial datasets usable.
 */
export function getStats(dataset: Dataset, championKey: string, role: Role): Stats;
export function getStats(
    dataset: Dataset,
    championKey: string,
    role: Role,
    type: "duo",
    role2: Role,
    championKey2: string,
): Stats;
export function getStats(
    dataset: Dataset,
    championKey: string,
    role: Role,
    type: "matchup",
    role2: Role,
    championKey2: string,
): Stats;
export function getStats(
    dataset: Dataset,
    championKey: string,
    role: Role,
    type?: "matchup" | "duo",
    matchupDuoRole?: Role,
    matchupDuoChampionKey?: string,
): Stats {
    if (!type) {
        return (
            dataset.championData[championKey]?.statsByRole[role] ?? {
                wins: 0,
                games: 0,
            }
        );
    }

    const role2 = matchupDuoRole!;
    const championKey2 = matchupDuoChampionKey!;

    if (type === "matchup") {
        return (
            dataset.championData[championKey]?.statsByRole[role]?.matchup[role2][
                championKey2
            ] ?? {
                wins: 0,
                games: 0,
            }
        );
    }

    return (
        dataset.championData[championKey]?.statsByRole[role].synergy[role2][
            championKey2
        ] ?? {
            wins: 0,
            games: 0,
        }
    );
}

/** Winrate of a champion in a role, 50% when it has never been played. */
export function getWinrate(dataset: Dataset, championKey: string, role: Role): number {
    const stats = getStats(dataset, championKey, role);
    return stats.games === 0 ? 0.5 : stats.wins / stats.games;
}
