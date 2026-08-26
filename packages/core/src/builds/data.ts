import type {
    BuildMatchupData,
    EntityStats,
    FullBuildDataset,
    ItemsBuildData,
    PartialBuildDataset,
    RunesBuildData,
    SkillsBuildData,
    SummonerSpellsBuildData,
} from "../models/build/BuildDataset.js";
import type { Role } from "../models/Role.js";

/**
 * Pure constructors and normalizers for build datasets.
 *
 * DraftGap builds these by fetching from lolalytics; DraftPredict keeps that
 * I/O in `@draftpredict/data` and `apps/pipeline`, so this module only holds
 * the shape/normalisation rules that both sides must agree on.
 */

/** Number of item slots tracked in a build order. */
export const BUILD_ITEM_ORDER_LENGTH = 5;

export function emptyRunesBuildData(): RunesBuildData {
    return {
        primary: {},
        secondary: {},
        shards: { offense: {}, defense: {}, flex: {} },
    };
}

export function emptyItemsBuildData(
    orderLength = BUILD_ITEM_ORDER_LENGTH,
): ItemsBuildData {
    return {
        boots: {},
        startingSets: {},
        sets: {},
        statsByOrder: Array.from({ length: orderLength }, () => ({})),
    };
}

export function emptySummonerSpellsBuildData(): SummonerSpellsBuildData {
    return {};
}

export function emptySkillsBuildData(levels = 0): SkillsBuildData {
    return {
        order: {} as SkillsBuildData["order"],
        level: Array.from({ length: levels }, () => ({})) as SkillsBuildData["level"],
    };
}

export function emptyPartialBuildDataset(
    championKey: string,
    role: Role,
): PartialBuildDataset {
    return {
        championKey,
        role,
        wins: 0,
        games: 0,
        runes: emptyRunesBuildData(),
        items: emptyItemsBuildData(),
        summonerSpells: emptySummonerSpellsBuildData(),
        skills: emptySkillsBuildData(),
    };
}

export function emptyFullBuildDataset(
    championKey: string,
    role: Role,
    matchups: BuildMatchupData[] = [],
): FullBuildDataset {
    return {
        ...emptyPartialBuildDataset(championKey, role),
        matchups,
    };
}

/**
 * Canonical id for a set of items (starting items, full sets): the numeric ids
 * sorted ascending and joined with "_", so ordering never creates duplicates.
 */
export function normalizeItemSetId(itemIds: readonly (number | string)[]): string {
    return [...itemIds]
        .map((id) => (typeof id === "number" ? id : parseInt(id, 10)))
        .sort((a, b) => a - b)
        .join("_");
}

/**
 * Canonical id for a summoner spell pair. DraftGap sorts the raw string parts
 * lexicographically, which this reproduces exactly.
 */
export function normalizeSummonerSpellSetId(spellSetId: string): string {
    return spellSetId.split("_").sort().join("_");
}

/** Turns a winrate percentage plus a game count into a whole-game sample. */
export function statsFromWinratePercentage(
    winratePercentage: number,
    games: number,
): EntityStats {
    return {
        wins: Math.round(games * (winratePercentage / 100)),
        games,
    };
}

/** Champion keys this build dataset has matchup data for. */
export function getBuildMatchupChampionKeys(dataset: FullBuildDataset): Set<string> {
    return new Set(dataset.matchups.map((m) => m.championKey));
}

/** A copy of `dataset` whose matchups are restricted to the given champions. */
export function filterBuildMatchups(
    dataset: FullBuildDataset,
    championKeys: Iterable<string>,
): FullBuildDataset {
    const wanted = new Set(championKeys);
    return {
        ...dataset,
        matchups: dataset.matchups.filter((m) => wanted.has(m.championKey)),
    };
}
