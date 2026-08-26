import type { Role } from "../Role.js";

/**
 * Stats for a champion (in a role) playing against an enemy champion.
 *
 * DraftGap dataset v5 stores these nested as
 * `matchup[enemyRole][enemyChampionKey]`, and only carries
 * `championKey`/`wins`/`games` on the leaf. The positional fields are optional
 * so a raw v5 payload type-checks unchanged while producers that can afford
 * the extra bytes may denormalize them.
 */
export type ChampionMatchupData = {
    /** Key of the enemy champion this entry describes. */
    championKey: string;
    wins: number;
    games: number;

    role?: Role;
    enemyChampionKey?: string;
    enemyRole?: Role;
};
