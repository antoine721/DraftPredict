import type { Role } from "../Role.js";
import type { Stats } from "../Stats.js";
import type { ChampionDamageProfile } from "./ChampionDamageProfile.js";
import type { ChampionMatchupData } from "./ChampionMatchupData.js";
import type { ChampionSynergyData } from "./ChampionSynergyData.js";

/** Number of game-duration buckets in {@link ChampionRoleData.statsByTime}. */
export const TIME_BUCKET_COUNT = 7;

/** Duration buckets are 5 minutes wide and start at 20 minutes. */
export const TIME_BUCKET_START_MINUTES = 20;
export const TIME_BUCKET_WIDTH_MINUTES = 5;

export type ChampionRoleData = {
    games: number;
    wins: number;
    matchup: Record<Role, Record<string, ChampionMatchupData>>;
    synergy: Record<Role, Record<string, ChampionSynergyData>>;
    damageProfile: ChampionDamageProfile;
    /** 7 buckets, 5 minutes wide, starting at 20 minutes. */
    statsByTime: Stats[];
};

export function defaultChampionRoleData(): ChampionRoleData {
    return {
        games: 0,
        wins: 0,
        matchup: [0, 1, 2, 3, 4].reduce(
            (acc, role) => ({ ...acc, [role]: {} }),
            {},
        ) as ChampionRoleData["matchup"],
        synergy: [0, 1, 2, 3, 4].reduce(
            (acc, role) => ({ ...acc, [role]: {} }),
            {},
        ) as ChampionRoleData["synergy"],
        damageProfile: {
            magic: 0,
            physical: 0,
            true: 0,
        },
        statsByTime: Array.from({ length: TIME_BUCKET_COUNT }, () => ({
            wins: 0,
            games: 0,
        })),
    };
}

/**
 * Strips the (very large) matchup and synergy maps in place. DraftGap does this
 * to the per-patch dataset, which only needs base winrates.
 */
export function deleteChampionRoleDataMatchupSynergyData(data: ChampionRoleData): void {
    data.matchup = {} as ChampionRoleData["matchup"];
    data.synergy = {} as ChampionRoleData["synergy"];
}

/** Lower bound (in minutes) of duration bucket `index`. */
export function timeBucketStartMinutes(index: number): number {
    return TIME_BUCKET_START_MINUTES + index * TIME_BUCKET_WIDTH_MINUTES;
}
