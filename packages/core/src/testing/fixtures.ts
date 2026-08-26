/**
 * Tiny hand-written dataset builders used by this package's unit tests.
 *
 * Test-only: excluded from the build (see `packages/core/tsconfig.json`).
 * Realistic fixture generation lives in `@draftpredict/data`.
 */

import type { ChampionData } from "../models/dataset/ChampionData.js";
import type { ChampionRoleData } from "../models/dataset/ChampionRoleData.js";
import { defaultChampionRoleData } from "../models/dataset/ChampionRoleData.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import { DATASET_VERSION } from "../models/dataset/Dataset.js";
import type { Role } from "../models/Role.js";
import { ROLES } from "../models/Role.js";
import type { Stats } from "../models/Stats.js";

export type RoleSpec = Partial<Stats> & {
    damageProfile?: Partial<ChampionRoleData["damageProfile"]>;
    statsByTime?: Stats[];
};

export type ChampionSpec = {
    key: string;
    id?: string;
    name?: string;
    roles?: Partial<Record<Role, RoleSpec>>;
};

export function makeRoleData(spec: RoleSpec = {}): ChampionRoleData {
    const data = defaultChampionRoleData();
    data.games = spec.games ?? 0;
    data.wins = spec.wins ?? 0;
    if (spec.damageProfile) {
        data.damageProfile = { ...data.damageProfile, ...spec.damageProfile };
    }
    if (spec.statsByTime) {
        data.statsByTime = spec.statsByTime.map((s) => ({ ...s }));
    }
    return data;
}

export function makeChampion(spec: ChampionSpec): ChampionData {
    const statsByRole = {} as Record<Role, ChampionRoleData>;
    for (const role of ROLES) {
        statsByRole[role] = makeRoleData(spec.roles?.[role]);
    }

    return {
        id: spec.id ?? `Champion${spec.key}`,
        key: spec.key,
        name: spec.name ?? `Champion ${spec.key}`,
        i18n: {},
        statsByRole,
    };
}

export function makeDataset(champions: ChampionSpec[]): Dataset {
    const championData: Record<string, ChampionData> = {};
    for (const spec of champions) {
        championData[spec.key] = makeChampion(spec);
    }

    return {
        version: DATASET_VERSION,
        date: "2026-01-01",
        championData,
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    };
}

export function setMatchup(
    dataset: Dataset,
    championKey: string,
    role: Role,
    enemyChampionKey: string,
    enemyRole: Role,
    stats: Stats,
): void {
    dataset.championData[championKey].statsByRole[role].matchup[enemyRole][
        enemyChampionKey
    ] = { championKey: enemyChampionKey, ...stats };
}

export function setSynergy(
    dataset: Dataset,
    championKey: string,
    role: Role,
    otherChampionKey: string,
    otherRole: Role,
    stats: Stats,
): void {
    dataset.championData[championKey].statsByRole[role].synergy[otherRole][
        otherChampionKey
    ] = { championKey: otherChampionKey, ...stats };
}

export function makeTeam(entries: [Role, string][]): Map<Role, string> {
    return new Map(entries);
}
