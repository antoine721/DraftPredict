import type { Role } from "../Role.js";

/**
 * Stats for a champion (in a role) playing alongside a team mate.
 *
 * Nested as `synergy[otherRole][otherChampionKey]` in DraftGap dataset v5; see
 * {@link ChampionMatchupData} for why the positional fields are optional.
 */
export type ChampionSynergyData = {
    /** Key of the team mate this entry describes. */
    championKey: string;
    wins: number;
    games: number;

    role?: Role;
    otherChampionKey?: string;
    otherRole?: Role;
};
