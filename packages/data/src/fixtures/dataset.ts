import type {
    ChampionData,
    ChampionRoleData,
    Dataset,
    ItemData,
    Role,
    RuneData,
    RunePathData,
    StatShardData,
    Stats,
    SummonerSpellData,
} from "@draftpredict/core";
import {
    DATASET_VERSION,
    defaultChampionRoleData,
    ratingToWinrate,
    ROLES,
    TIME_BUCKET_COUNT,
} from "@draftpredict/core";
import { loadStaticData } from "../static/load.js";
import type { StaticChampion, StaticData } from "../static/types.js";
import { championDamageProfile } from "./damage.js";
import type { RoleAffinity } from "./role-affinity.js";
import { championRoleAffinity, playedRoles } from "./role-affinity.js";
import type { Rng } from "./rng.js";
import { createRng, hashSigned } from "./rng.js";

/**
 * A deterministic, realistic-looking dataset over the real champion list.
 *
 * This is what makes DraftPredict work with no network at all: the same seed
 * always produces a byte-identical dataset, champions are played in the roles
 * their class tags suggest, sample sizes follow from how often each champion
 * is picked, and matchup/synergy winrates follow from the champions' relative
 * strength plus a stable per-pair bias.
 *
 * It is emphatically not real data — it is a stand-in that exercises every
 * code path in the engine and looks right on screen.
 */

/** Which sample a dataset represents: the current patch, or the 30-day window. */
export type DatasetWindow = "patch" | "full";

export const DEFAULT_FIXTURE_SEED = 20260826;

/** Games recorded per role. The 30-day window is ~5x the current patch. */
export const DEFAULT_GAMES_PER_ROLE: Record<DatasetWindow, number> = {
    patch: 240_000,
    full: 1_200_000,
};

/**
 * Fraction of a champion's games that land in each duration bucket
 * (20-25, 25-30, … 50+ minutes). Games shorter than 20 minutes are not
 * bucketed, which is why the weights sum to less than 1.
 */
const TIME_BUCKET_WEIGHTS: readonly number[] = [
    0.08, 0.19, 0.23, 0.19, 0.13, 0.07, 0.03,
];

export type GenerateFixtureDatasetOptions = {
    /** Same seed -> byte-identical dataset. */
    seed?: number;
    /** Champions to build the dataset over. Defaults to the bundled snapshot. */
    champions?: readonly StaticChampion[];
    /** Static data to draw champions and item/rune catalogues from. */
    staticData?: StaticData;
    /** `"full"` (default) includes matchup and synergy matrices. */
    window?: DatasetWindow;
    /** Total champion-games recorded per role. */
    gamesPerRole?: number;
    /** Dataset `version` field. Defaults to the DraftGap dataset version. */
    version?: string;
    /** Dataset `date` field. Fixed by default so output stays deterministic. */
    date?: string;
    /** Minimum role share for a champion to have data in that role. */
    roleThreshold?: number;
    /** Overrides the window default for matchup/synergy matrices. */
    includeMatchupSynergy?: boolean;
};

type ChampionProfile = {
    champion: StaticChampion;
    key: string;
    affinity: RoleAffinity;
    roles: Role[];
    /** Relative pick frequency, mean 1. */
    popularity: number;
    /** Strength in Elo-ish points, per role. */
    ratingByRole: Record<Role, number>;
    /** Positive = stronger the longer the game goes. */
    scaling: number;
    damageProfile: ReturnType<typeof championDamageProfile>;
};

/**
 * Builds a full synthetic {@link Dataset}.
 *
 * Cost is dominated by the matchup/synergy matrices; over the real 170-champion
 * list it runs in a few hundred milliseconds.
 */
export function generateFixtureDataset(
    options: GenerateFixtureDatasetOptions = {},
): Dataset {
    const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
    const window = options.window ?? "full";
    const includeMatchupSynergy = options.includeMatchupSynergy ?? window === "full";
    const gamesPerRole = options.gamesPerRole ?? DEFAULT_GAMES_PER_ROLE[window];

    // When the caller supplies its own champion list (tests, tools) we do not
    // pull in the bundled snapshot behind its back.
    const staticData =
        options.staticData ?? (options.champions ? undefined : loadStaticData());
    const champions = resolveChampions(options, staticData);

    // Phase 1: per-champion profiles. Deliberately independent of `window`, so
    // the patch and 30-day datasets describe the same imaginary metagame.
    const rng = createRng(seed);
    const profiles = champions.map((champion) => buildProfile(champion, rng, options));

    // Phase 2: sample sizes. A champion's share of a role is its popularity
    // weighted by how often it is played there.
    const roleTotals = totalsByRole(profiles);
    const gamesByChampionRole = new Map<string, Record<Role, number>>();
    for (const profile of profiles) {
        const games = {} as Record<Role, number>;
        for (const role of ROLES) {
            games[role] = profile.roles.includes(role)
                ? Math.max(
                      1,
                      Math.round(
                          (gamesPerRole * profile.popularity * profile.affinity[role]) /
                              roleTotals[role],
                      ),
                  )
                : 0;
        }
        gamesByChampionRole.set(profile.key, games);
    }

    const rosterByRole = buildRosters(profiles);
    const roleGameTotals = {} as Record<Role, number>;
    for (const role of ROLES) {
        roleGameTotals[role] = profiles.reduce(
            (sum, profile) => sum + gamesByChampionRole.get(profile.key)![role],
            0,
        );
    }

    // Phase 3: materialize.
    const championData: Record<string, ChampionData> = {};
    for (const profile of profiles) {
        championData[profile.key] = buildChampionData(profile, {
            seed,
            gamesByChampionRole,
            roleGameTotals,
            rosterByRole,
            includeMatchupSynergy,
        });
    }

    return {
        version: options.version ?? DATASET_VERSION,
        date: options.date ?? "2026-08-26",
        championData,
        itemData: buildItemData(staticData),
        runeData: buildRuneData(staticData),
        runePathData: buildRunePathData(staticData),
        statShardData: buildStatShardData(staticData),
        summonerSpellData: buildSummonerSpellData(staticData),
    };
}

/**
 * The patch dataset and the 30-day dataset `analyzeDraft` needs, generated
 * from one seed so they agree with each other.
 */
export function generateFixtureDatasetPair(
    options: GenerateFixtureDatasetOptions = {},
): { dataset: Dataset; fullDataset: Dataset } {
    const staticData = options.staticData ?? loadStaticData();
    return {
        dataset: generateFixtureDataset({ ...options, staticData, window: "patch" }),
        fullDataset: generateFixtureDataset({ ...options, staticData, window: "full" }),
    };
}

// ------------------------------------------------------------------ phases ---

function resolveChampions(
    options: GenerateFixtureDatasetOptions,
    staticData: StaticData | undefined,
): readonly StaticChampion[] {
    const champions = options.champions ?? staticData?.championList ?? [];

    // Sorting by numeric key makes iteration order independent of how the
    // caller obtained the list, which is what keeps output byte-stable.
    return [...champions].sort(
        (a, b) => parseInt(a.key, 10) - parseInt(b.key, 10) || a.id.localeCompare(b.id),
    );
}

function buildProfile(
    champion: StaticChampion,
    rng: Rng,
    options: GenerateFixtureDatasetOptions,
): ChampionProfile {
    const affinity = championRoleAffinity(champion, rng);
    const roles = playedRoles(affinity, options.roleThreshold ?? 0.1);

    // Pick rates are heavily skewed: a handful of champions get played an order
    // of magnitude more than the rest.
    const popularity = Math.exp(rng.normal() * 0.6);

    // Champion winrates in the live game sit in a narrow band — roughly 45% to
    // 55%, i.e. +-35 Elo — and drafts only swing a few points beyond that.
    // Wider spreads here would produce 15%-winrate drafts, which is not what
    // this fixture is for.
    const ratingByRole = {} as Record<Role, number>;
    const baseRating = rng.normal() * 9;
    for (const role of ROLES) {
        // Off-roles are worse than the champion's main role.
        const offRolePenalty = roles.includes(role) ? 0 : 18;
        ratingByRole[role] = clamp(
            baseRating + rng.normal() * 7 - offRolePenalty,
            -60,
            60,
        );
    }

    return {
        champion,
        key: champion.key,
        affinity,
        roles,
        popularity,
        ratingByRole,
        scaling: rng.normal() * 4,
        damageProfile: championDamageProfile(champion, rng),
    };
}

function totalsByRole(profiles: readonly ChampionProfile[]): Record<Role, number> {
    const totals = {} as Record<Role, number>;
    for (const role of ROLES) {
        totals[role] =
            profiles.reduce(
                (sum, profile) =>
                    profile.roles.includes(role)
                        ? sum + profile.popularity * profile.affinity[role]
                        : sum,
                0,
            ) || 1;
    }
    return totals;
}

function buildRosters(
    profiles: readonly ChampionProfile[],
): Record<Role, ChampionProfile[]> {
    const rosters = {} as Record<Role, ChampionProfile[]>;
    for (const role of ROLES) {
        rosters[role] = profiles.filter((profile) => profile.roles.includes(role));
    }
    return rosters;
}

type MaterializeContext = {
    seed: number;
    gamesByChampionRole: Map<string, Record<Role, number>>;
    roleGameTotals: Record<Role, number>;
    rosterByRole: Record<Role, ChampionProfile[]>;
    includeMatchupSynergy: boolean;
};

function buildChampionData(
    profile: ChampionProfile,
    context: MaterializeContext,
): ChampionData {
    const statsByRole = {} as Record<Role, ChampionRoleData>;
    const games = context.gamesByChampionRole.get(profile.key)!;

    for (const role of ROLES) {
        const roleData = defaultChampionRoleData();
        statsByRole[role] = roleData;

        if (games[role] <= 0) continue;

        roleData.games = games[role];
        roleData.wins = Math.round(
            roleData.games * ratingToWinrate(profile.ratingByRole[role]),
        );
        roleData.damageProfile = { ...profile.damageProfile };
        roleData.statsByTime = buildStatsByTime(profile, role, roleData.games);

        if (!context.includeMatchupSynergy) continue;

        fillMatchupsAndSynergies(profile, role, roleData, context);
    }

    return {
        id: profile.champion.id,
        key: profile.key,
        name: profile.champion.name,
        i18n: { en_US: { name: profile.champion.name } },
        statsByRole,
    };
}

function buildStatsByTime(
    profile: ChampionProfile,
    role: Role,
    games: number,
): Stats[] {
    const buckets: Stats[] = [];
    for (let i = 0; i < TIME_BUCKET_COUNT; i++) {
        const bucketGames = Math.round(games * (TIME_BUCKET_WEIGHTS[i] ?? 0));
        // Bucket 3 (35-40 min) is treated as the neutral point.
        const rating = profile.ratingByRole[role] + profile.scaling * (i - 3);
        buckets.push({
            games: bucketGames,
            wins: Math.round(bucketGames * ratingToWinrate(rating)),
        });
    }
    return buckets;
}

function fillMatchupsAndSynergies(
    profile: ChampionProfile,
    role: Role,
    roleData: ChampionRoleData,
    context: MaterializeContext,
): void {
    const ownGames = roleData.games;

    for (const otherRole of ROLES) {
        const roster = context.rosterByRole[otherRole];
        const roleTotal = context.roleGameTotals[otherRole] || 1;

        const matchups = roleData.matchup[otherRole];
        const synergies = roleData.synergy[otherRole];

        for (const other of roster) {
            const otherGames =
                context.gamesByChampionRole.get(other.key)![otherRole] / roleTotal;
            const pairGames = Math.round(ownGames * otherGames);
            if (pairGames < 1) continue;

            const matchupBias = pairBias(
                context.seed,
                "m",
                profile,
                role,
                other,
                otherRole,
            );
            matchups[other.key] = {
                championKey: other.key,
                games: pairGames,
                wins: Math.round(
                    pairGames *
                        ratingToWinrate(
                            profile.ratingByRole[role] -
                                other.ratingByRole[otherRole] +
                                matchupBias,
                        ),
                ),
            };

            // A champion cannot be its own team mate in the same role.
            if (otherRole === role) continue;

            const synergyBias =
                Math.abs(pairBias(context.seed, "s", profile, role, other, otherRole)) *
                0.6;
            synergies[other.key] = {
                championKey: other.key,
                games: pairGames,
                wins: Math.round(
                    pairGames *
                        ratingToWinrate(
                            profile.ratingByRole[role] +
                                other.ratingByRole[otherRole] +
                                synergyBias,
                        ),
                ),
            };
        }
    }
}

/**
 * Stable per-pair bias in Elo points.
 *
 * Derived from a hash of the (unordered) pair rather than the RNG stream, so
 * it does not depend on iteration order and is antisymmetric: whatever
 * advantage A has over B, B has the mirror disadvantage.
 */
function pairBias(
    seed: number,
    kind: "m" | "s",
    a: ChampionProfile,
    roleA: Role,
    b: ChampionProfile,
    roleB: Role,
): number {
    const aFirst =
        a.key === b.key ? roleA <= roleB : parseInt(a.key, 10) < parseInt(b.key, 10);
    const [firstKey, firstRole, secondKey, secondRole] = aFirst
        ? [a.key, roleA, b.key, roleB]
        : [b.key, roleB, a.key, roleA];

    const magnitude =
        hashSigned(
            `${seed}:${kind}:${firstKey}:${firstRole}:${secondKey}:${secondRole}`,
        ) * 14;

    return aFirst ? magnitude : -magnitude;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// ------------------------------------------------------------- catalogues ---

function buildItemData(staticData: StaticData | undefined): Record<number, ItemData> {
    if (!staticData) return {};
    const items: Record<number, ItemData> = {};
    for (const item of staticData.purchasableItems) {
        items[item.id] = { id: item.id, name: item.name, gold: item.gold.total };
    }
    return items;
}

function buildRuneData(staticData: StaticData | undefined): Record<number, RuneData> {
    if (!staticData) return {};
    const runes: Record<number, RuneData> = {};
    for (const rune of staticData.runesById.values()) {
        runes[rune.id] = {
            id: rune.id,
            key: rune.key,
            name: rune.name,
            icon: rune.icon,
            pathId: rune.path,
            slot: rune.slot,
            index: rune.index,
        };
    }
    return runes;
}

function buildRunePathData(
    staticData: StaticData | undefined,
): Record<number, RunePathData> {
    if (!staticData) return {};
    const paths: Record<number, RunePathData> = {};
    for (const path of staticData.runePathsById.values()) {
        paths[path.id] = {
            id: path.id,
            key: path.key,
            name: path.name,
            icon: path.icon,
        };
    }
    return paths;
}

function buildStatShardData(
    staticData: StaticData | undefined,
): Record<number, StatShardData> {
    if (!staticData) return {};
    const shards: Record<number, StatShardData> = {};
    for (const shard of staticData.statShardsById.values()) {
        shards[shard.id] = {
            id: shard.id,
            key: shard.key,
            name: shard.name,
            positions: shard.positions.map((position) => ({
                slot: position.slotIndex,
                index: position.index,
            })),
        };
    }
    return shards;
}

function buildSummonerSpellData(
    staticData: StaticData | undefined,
): Record<number, SummonerSpellData> {
    if (!staticData) return {};
    const spells: Record<number, SummonerSpellData> = {};
    for (const spell of staticData.summonerSpellList) {
        spells[spell.key] = { id: spell.id, key: spell.key, name: spell.name };
    }
    return spells;
}
