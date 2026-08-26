import {
    ROLES,
    defaultChampionData,
    emptyDataset,
    type Dataset,
    type Role,
} from "@draftpredict/core";

/**
 * Test-only dataset builders.
 *
 * Not exported from `src/index.ts` and not emitted into `dist` — role
 * inference is the only thing in this package that needs a dataset, and these
 * two helpers are all its tests need.
 */

/** How many games a champion has in each role. Missing roles get zero. */
export type RoleGames = Partial<Record<Role, number>>;

/**
 * Builds a dataset where every champion has the given games per role.
 *
 * `predictRoles` only looks at `statsByRole[role].games`, so nothing else has
 * to be filled in for role inference to behave exactly as it does in
 * production.
 */
export function makeRoleDataset(champions: Record<string, RoleGames>): Dataset {
    const dataset = emptyDataset("5", "2026-08-01");
    for (const [key, games] of Object.entries(champions)) {
        const champion = defaultChampionData(key, `champion-${key}`, `Champion ${key}`);
        for (const role of ROLES) {
            const count = games[role] ?? 0;
            champion.statsByRole[role].games = count;
            champion.statsByRole[role].wins = Math.round(count / 2);
        }
        dataset.championData[key] = champion;
    }
    return dataset;
}
