import type { ChampionData } from "../models/dataset/ChampionData.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";
import { ROLES } from "../models/Role.js";

/** A candidate assignment of champions to roles, with its likelihood. */
export type TeamComp = [Map<Role, string>, number];

/**
 * Every way the given champions can fill the five roles, most likely first.
 *
 * Champions carrying a `role` are pinned to it; the rest are permuted over the
 * remaining roles, weighted by how often each champion is played there.
 */
export function getTeamComps(
    champions: (ChampionData & { role?: Role })[],
): TeamComp[] {
    const existingTeam = new Map(
        champions.filter((c) => c.role !== undefined).map((c) => [c.role!, c.key]),
    );

    return getTeamCompsRecursive(
        [existingTeam, 1],
        champions.filter((c) => c.role === undefined),
    ).sort(([, a], [, b]) => b - a);
}

function getTeamCompsRecursive(
    [partialTeamComp, partialProbability]: TeamComp,
    champions: ChampionData[],
): TeamComp[] {
    if (champions.length === 0) {
        return [[partialTeamComp, partialProbability]];
    }

    const champion = champions[0];
    const remainingChampions = champions.slice(1);

    const totalGames = ROLES.reduce<number>(
        (a, b) => a + champion.statsByRole[b].games,
        0,
    );

    const combinations: TeamComp[] = [];
    for (const entry of Object.entries(champion.statsByRole)) {
        const role = Number(entry[0]) as Role;
        const roleData = entry[1];
        if (partialTeamComp.has(role)) {
            continue;
        }

        const roleProbability = roleData.games / totalGames;

        const newPartialTeamComp = new Map(partialTeamComp);
        newPartialTeamComp.set(role, champion.key);
        combinations.push(
            ...getTeamCompsRecursive(
                [newPartialTeamComp, partialProbability * roleProbability],
                remainingChampions,
            ),
        );
    }

    return combinations;
}

/**
 * Marginal probability of each champion playing each role, given every possible
 * team composition.
 */
export function predictRoleProbabilities(
    teamComps: TeamComp[],
): Map<string, Map<Role, number>> {
    const totalProbability = teamComps.reduce((sum, teamComp) => sum + teamComp[1], 0);

    const probabilities = new Map<string, Map<Role, number>>();

    for (const [championRoles, probability] of teamComps) {
        for (const [role, championKey] of championRoles) {
            if (!probabilities.has(championKey)) {
                probabilities.set(championKey, new Map());
            }

            const championProbabilities = probabilities.get(championKey)!;
            championProbabilities.set(
                role,
                (championProbabilities.get(role) ?? 0) + probability / totalProbability,
            );
        }
    }

    return probabilities;
}

/** DraftGap-compatible name for {@link predictRoleProbabilities}. */
export const predictRolesFromTeamComps = predictRoleProbabilities;

export type PredictRolesOptions = {
    /** Roles already known, e.g. from the League client. */
    knownRoles?: Map<Role, string>;
};

/**
 * Assigns the given champions to roles.
 *
 * Picks the single most likely full team composition, which guarantees that
 * each champion gets a distinct role — unlike taking each champion's argmax
 * independently. Champions with no games in any role fall back to filling the
 * remaining roles in order.
 */
export function predictRoles(
    dataset: Dataset,
    championKeys: readonly string[],
    options: PredictRolesOptions = {},
): Map<Role, string> {
    const knownRoles = options.knownRoles ?? new Map<Role, string>();
    const roleByChampion = new Map<string, Role>();
    for (const [role, championKey] of knownRoles) {
        roleByChampion.set(championKey, role);
    }

    const champions: (ChampionData & { role?: Role })[] = [];
    const unknownChampions: string[] = [];
    for (const championKey of championKeys) {
        const championData = dataset.championData[championKey];
        if (!championData) {
            unknownChampions.push(championKey);
            continue;
        }
        const role = roleByChampion.get(championKey);
        champions.push(role === undefined ? championData : { ...championData, role });
    }

    const teamComps = getTeamComps(champions);
    const best =
        teamComps.find(([, probability]) => Number.isFinite(probability)) ??
        teamComps[0];
    const result = new Map<Role, string>(best ? best[0] : knownRoles);

    // Champions the dataset has never seen still deserve a slot.
    for (const championKey of unknownChampions) {
        const role = ROLES.find((r) => !result.has(r));
        if (role === undefined) break;
        result.set(role, championKey);
    }

    return new Map(
        ROLES.filter((role) => result.has(role)).map((role) => [
            role,
            result.get(role)!,
        ]),
    );
}
