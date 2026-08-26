import type {
    BuildMatchupData,
    EntityStats,
    FullBuildDataset,
    ItemsBuildData,
    PartialBuildDataset,
    Role,
    RunesBuildData,
    Skill,
    SkillOrder,
    SkillsBuildData,
    SummonerSpellsBuildData,
} from "@draftpredict/core";
import {
    BUILD_ITEM_ORDER_LENGTH,
    normalizeItemSetId,
    normalizeSummonerSpellSetId,
    ratingToWinrate,
    SKILL_ORDERS,
    SKILLS,
} from "@draftpredict/core";
import { loadStaticData } from "../static/load.js";
import type { StaticData } from "../static/types.js";
import { hashSigned, hashUnit } from "./rng.js";
import { DEFAULT_FIXTURE_SEED } from "./dataset.js";

/**
 * Deterministic build data (items, runes, summoner spells, skill orders) to go
 * with {@link generateFixtureDataset}.
 *
 * `analyzeBuild` compares a champion's per-entity winrate in the current patch
 * against the same entity in the 30-day window, and against every enemy in the
 * matchup list. That only produces finite numbers when all three carry the same
 * entities, so a single "plan" of ids is drawn first and then materialized
 * three times with different sample sizes.
 */

/** Champion levels a skill-level table covers. */
export const CHAMPION_LEVELS = 18;

export type FixtureBuildMatchup = {
    championKey: string;
    role: Role;
};

export type GenerateFixtureBuildDatasetOptions = {
    championKey: string;
    role: Role;
    seed?: number;
    /** Catalogues to draw item/rune ids from. Defaults to the bundled snapshot. */
    staticData?: StaticData;
    /** Enemy champions to produce matchup-specific build data for. */
    matchups?: readonly FixtureBuildMatchup[];
    /** Games in the current-patch sample. The 30-day sample is 5x this. */
    games?: number;
    /** Ratio between the 30-day and the current-patch sample. Default 5. */
    fullWindowRatio?: number;
};

export type FixtureBuildDatasets = {
    /** Current-patch build data — `analyzeBuild`'s first argument. */
    dataset: PartialBuildDataset;
    /** 30-day build data including matchups — `analyzeBuild`'s second argument. */
    fullDataset: FullBuildDataset;
};

/** The ids each build bucket is populated with. */
type BuildPlan = {
    primaryRunes: number[];
    secondaryRunes: number[];
    shards: { offense: number[]; flex: number[]; defense: number[] };
    boots: number[];
    itemsByOrder: number[][];
    startingSets: string[];
    sets: string[];
    summonerSpells: string[];
};

export function generateFixtureBuildDataset(
    options: GenerateFixtureBuildDatasetOptions,
): FixtureBuildDatasets {
    const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
    const staticData = options.staticData ?? loadStaticData();
    const games = options.games ?? 24_000;
    const ratio = options.fullWindowRatio ?? 5;
    const scope = `${seed}:${options.championKey}:${options.role}`;

    const plan = buildPlan(staticData, scope);
    const championRating = hashSigned(`${scope}:champion`) * 20;

    const dataset = materialize({
        championKey: options.championKey,
        role: options.role,
        scope,
        window: "patch",
        games,
        championRating,
        plan,
    });

    const fullDataset: FullBuildDataset = {
        ...materialize({
            championKey: options.championKey,
            role: options.role,
            scope,
            window: "full",
            games: Math.round(games * ratio),
            championRating,
            plan,
        }),
        matchups: (options.matchups ?? []).map((matchup) =>
            materializeMatchup({
                matchup,
                scope,
                games: Math.round((games * ratio) / 12),
                championRating,
                plan,
            }),
        ),
    };

    return { dataset, fullDataset };
}

// -------------------------------------------------------------------- plan ---

function buildPlan(staticData: StaticData, scope: string): BuildPlan {
    const paths = staticData.runePathList;
    const primaryPath = paths[pickIndex(`${scope}:primary-path`, paths.length)];
    const secondaryPath =
        paths[
            (pickIndex(`${scope}:secondary-path`, Math.max(1, paths.length - 1)) +
                paths.indexOf(primaryPath) +
                1) %
                Math.max(1, paths.length)
        ];

    const shardRows = staticData.statShardRows;

    const boots = sortedIds(
        staticData.purchasableItems.filter(
            (item) => item.tags.includes("Boots") && item.gold.total >= 800,
        ),
    ).slice(0, 6);

    const legendaries = sortedIds(
        staticData.purchasableItems.filter(
            (item) =>
                item.gold.total >= 2400 &&
                item.into.length === 0 &&
                !item.tags.includes("Boots") &&
                !item.consumed,
        ),
    );

    const starters = sortedIds(
        staticData.purchasableItems.filter(
            (item) => item.gold.total > 0 && item.gold.total <= 500 && !item.consumed,
        ),
    );

    const potionId = staticData.itemsById.has(2003) ? 2003 : (starters[0] ?? 1055);

    const itemsByOrder = Array.from({ length: BUILD_ITEM_ORDER_LENGTH }, (_, slot) =>
        deterministicSample(legendaries, `${scope}:items:${slot}`, 6),
    );

    const startingItems = deterministicSample(starters, `${scope}:starters`, 3);
    const startingSets = startingItems.map((id) =>
        normalizeItemSetId([id, potionId, potionId]),
    );

    const spellKeys = staticData.summonerSpellList
        .map((spell) => spell.key)
        .sort((a, b) => a - b);
    const flashKey = spellKeys.includes(4) ? 4 : (spellKeys[0] ?? 4);
    const partners = deterministicSample(
        spellKeys.filter((key) => key !== flashKey),
        `${scope}:spells`,
        4,
    );
    const summonerSpells = partners.map((key) =>
        normalizeSummonerSpellSetId(`${flashKey}_${key}`),
    );

    return {
        primaryRunes: primaryPath ? primaryPath.slots.flat().map((r) => r.id) : [],
        secondaryRunes: secondaryPath
            ? secondaryPath.slots
                  .slice(1)
                  .flat()
                  .map((r) => r.id)
            : [],
        shards: {
            offense: (shardRows[0] ?? []).map((shard) => shard.id),
            flex: (shardRows[1] ?? []).map((shard) => shard.id),
            defense: (shardRows[2] ?? []).map((shard) => shard.id),
        },
        boots,
        itemsByOrder,
        startingSets,
        sets: [],
        summonerSpells,
    };
}

function sortedIds(items: readonly { id: number }[]): number[] {
    return items.map((item) => item.id).sort((a, b) => a - b);
}

/** Picks `count` entries deterministically, keeping the source order. */
function deterministicSample<T>(
    values: readonly T[],
    salt: string,
    count: number,
): T[] {
    if (values.length <= count) return [...values];
    return [...values]
        .map((value, index) => ({ value, rank: hashUnit(`${salt}:${index}`) }))
        .sort((a, b) => a.rank - b.rank)
        .slice(0, count)
        .map((entry) => entry.value);
}

function pickIndex(salt: string, length: number): number {
    if (length <= 0) return 0;
    return Math.floor(hashUnit(salt) * length) % length;
}

// ------------------------------------------------------------- materialize ---

type MaterializeArgs = {
    championKey: string;
    role: Role;
    scope: string;
    window: "patch" | "full";
    games: number;
    championRating: number;
    plan: BuildPlan;
};

function materialize(args: MaterializeArgs): PartialBuildDataset {
    const { plan } = args;
    const wins = Math.round(args.games * ratingToWinrate(args.championRating));

    const runes: RunesBuildData = {
        primary: statsRecord(args, "rune-primary", plan.primaryRunes, 0.28),
        secondary: statsRecord(args, "rune-secondary", plan.secondaryRunes, 0.22),
        shards: {
            offense: statsRecord(args, "shard-offense", plan.shards.offense, 0.45),
            defense: statsRecord(args, "shard-defense", plan.shards.defense, 0.45),
            flex: statsRecord(args, "shard-flex", plan.shards.flex, 0.45),
        },
    };

    const items: ItemsBuildData = {
        boots: statsRecord(args, "boots", plan.boots, 0.25),
        statsByOrder: plan.itemsByOrder.map((ids, slot) =>
            statsRecord(args, `item-order-${slot}`, ids, 0.3),
        ),
        startingSets: statsRecord(args, "starting-set", plan.startingSets, 0.4),
        sets: statsRecord(args, "set", plan.sets, 0.3),
    };

    const summonerSpells: SummonerSpellsBuildData = statsRecord(
        args,
        "summoner-spells",
        plan.summonerSpells,
        0.4,
    );

    const skills: SkillsBuildData = {
        order: statsRecord(args, "skill-order", [...SKILL_ORDERS], 0.3) as Record<
            SkillOrder,
            EntityStats
        >,
        level: Array.from({ length: CHAMPION_LEVELS }, (_, level) =>
            statsRecord(args, `skill-level-${level}`, [...SKILLS], 0.4),
        ) as Record<Skill, EntityStats>[],
    };

    return {
        championKey: args.championKey,
        role: args.role,
        games: args.games,
        wins,
        runes,
        items,
        summonerSpells,
        skills,
    };
}

function materializeMatchup(args: {
    matchup: FixtureBuildMatchup;
    scope: string;
    games: number;
    championRating: number;
    plan: BuildPlan;
}): BuildMatchupData {
    const matchupBias =
        hashSigned(
            `${args.scope}:vs:${args.matchup.championKey}:${args.matchup.role}`,
        ) * 30;

    const base = materialize({
        championKey: args.matchup.championKey,
        role: args.matchup.role,
        scope: `${args.scope}:vs:${args.matchup.championKey}`,
        window: "full",
        games: args.games,
        championRating: args.championRating + matchupBias,
        plan: args.plan,
    });

    return base;
}

/**
 * Stats for every id in a bucket.
 *
 * An entity's strength is derived from the id alone (so it is identical in the
 * patch and 30-day samples), while its pick rate and the resulting sample size
 * scale with the window.
 */
function statsRecord(
    args: MaterializeArgs,
    bucket: string,
    ids: readonly (string | number)[],
    maxShare: number,
): Record<string, EntityStats> {
    const record: Record<string, EntityStats> = {};

    for (const id of ids) {
        const entitySalt = `${args.scope}:${bucket}:${id}`;
        const share = 0.04 + hashUnit(`${entitySalt}:share`) * maxShare;
        const games = Math.max(1, Math.round(args.games * share));
        const rating = args.championRating + hashSigned(`${entitySalt}:rating`) * 22;

        record[String(id)] = {
            games,
            wins: Math.round(games * ratingToWinrate(rating)),
        };
    }

    return record;
}
