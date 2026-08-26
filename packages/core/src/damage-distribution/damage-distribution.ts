import type { ChampionDamageProfile } from "../models/dataset/ChampionDamageProfile.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";

/**
 * Sum of the damage profiles of a team's champions.
 *
 * Champions missing from the dataset contribute nothing rather than throwing,
 * so partial datasets stay usable.
 */
export function getTeamDamageDistribution(
    dataset: Dataset,
    team: Map<Role, string>,
): ChampionDamageProfile {
    const damageDistribution: ChampionDamageProfile = {
        magic: 0,
        physical: 0,
        true: 0,
    };

    for (const [role, championKey] of team.entries()) {
        const champion = dataset.championData[championKey];
        const championRoleData = champion?.statsByRole[role];
        if (!championRoleData) continue;

        damageDistribution.magic += championRoleData.damageProfile.magic;
        damageDistribution.physical += championRoleData.damageProfile.physical;
        damageDistribution.true += championRoleData.damageProfile.true;
    }

    return damageDistribution;
}

/** ARCHITECTURE-facing alias of {@link getTeamDamageDistribution}. */
export const getDamageDistribution = getTeamDamageDistribution;
