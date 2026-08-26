import type { Role } from "../Role";
import type { ChampionRoleData } from "./ChampionRoleData";
import { defaultChampionRoleData } from "./ChampionRoleData";

export type ChampionData = {
    /** Data Dragon id, e.g. "MonkeyKing". */
    id: string;
    /** Numeric champion key as a string, e.g. "62". */
    key: string;
    name: string;
    i18n: Record<string, { name: string }>;
    statsByRole: Record<Role, ChampionRoleData>;
};

export function defaultChampionData(
    key: string,
    id = key,
    name = id,
): ChampionData {
    return {
        id,
        key,
        name,
        i18n: {},
        statsByRole: {
            0: defaultChampionRoleData(),
            1: defaultChampionRoleData(),
            2: defaultChampionRoleData(),
            3: defaultChampionRoleData(),
            4: defaultChampionRoleData(),
        },
    };
}

/** Localised champion name, falling back to the default name. */
export function getChampionName(champion: ChampionData, language?: string): string {
    if (!language) return champion.name;
    return champion.i18n?.[language]?.name ?? champion.name;
}
