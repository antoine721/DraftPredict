/**
 * Deterministic synthetic datasets for the parity suite.
 *
 * Everything here is seeded and dependency-free: the same seed always yields
 * byte-identical datasets, so a parity failure is reproducible from the seed
 * alone. The numbers are plausible rather than realistic — the point is to
 * exercise every branch of the engine (zero-game champions, missing champions
 * in the 30-day dataset, empty duration buckets), not to model the live game.
 */

import type {
    ChampionData,
    ChampionRoleData,
    Dataset,
    Role,
    Stats,
} from "@draftpredict/core";

export const ROLES: readonly Role[] = [0, 1, 2, 3, 4];

/** Number of duration buckets in `ChampionRoleData.statsByTime`. */
const TIME_BUCKETS = 7;

/**
 * mulberry32 — a 32-bit PRNG with a 2^32 period. Small, fast and, crucially,
 * exactly reproducible across engines.
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export type Rng = {
    /** Uniform in [0, 1). */
    next(): number;
    /** Uniform integer in [min, max]. */
    int(min: number, max: number): number;
    /** Uniform float in [min, max). */
    float(min: number, max: number): number;
    /** True with probability `p`. */
    chance(p: number): boolean;
    pick<T>(values: readonly T[]): T;
    /** A shuffled copy of `values`. */
    shuffle<T>(values: readonly T[]): T[];
};

export function createRng(seed: number): Rng {
    const next = mulberry32(seed);
    const rng: Rng = {
        next,
        int: (min, max) => min + Math.floor(next() * (max - min + 1)),
        float: (min, max) => min + next() * (max - min),
        chance: (p) => next() < p,
        pick: (values) => values[Math.floor(next() * values.length)],
        shuffle: (values) => {
            const copy = [...values];
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        },
    };
    return rng;
}

export type DatasetFactoryOptions = {
    seed?: number;
    championCount?: number;
    /**
     * Champions (by index) that have zero games everywhere, so the engine's
     * `games === 0 -> 0.5` paths get hit.
     */
    zeroGameChampionCount?: number;
};

export type ParityDatasets = {
    /** Per-patch dataset: base winrates only, ~7 days of games. */
    patch: Dataset;
    /** 30-day dataset: the matchup/synergy source, ~4x the games. */
    full: Dataset;
    championKeys: string[];
    /** Champions present in `patch` but deliberately absent from `full`. */
    missingFromFull: string[];
    /** Champions with zero games in every role, in both datasets. */
    zeroGameChampions: string[];
};

function emptyRoleRecord<T>(make: () => T): Record<Role, T> {
    return {
        0: make(),
        1: make(),
        2: make(),
        3: make(),
        4: make(),
    };
}

/**
 * Draws a win count for `games` games around `winrate`, with a bit of noise,
 * clamped so a sample can never have more wins than games.
 */
function drawWins(rng: Rng, games: number, winrate: number): number {
    if (games === 0) return 0;
    const noise = rng.float(-0.06, 0.06);
    const p = Math.min(0.95, Math.max(0.05, winrate + noise));
    return Math.min(games, Math.max(0, Math.round(games * p)));
}

type ChampionShape = {
    key: string;
    /** Share of the champion's games played in each role; sums to 1. */
    roleShare: number[];
    popularity: number;
    strength: number;
    zeroGames: boolean;
};

function createChampionShapes(rng: Rng, options: Required<DatasetFactoryOptions>) {
    const shapes: ChampionShape[] = [];
    const zeroGameIndices = new Set(
        rng
            .shuffle(Array.from({ length: options.championCount }, (_, i) => i))
            .slice(0, options.zeroGameChampionCount),
    );

    for (let i = 0; i < options.championCount; i++) {
        const primaryRole = i % 5;
        const roleShare = ROLES.map((role) => {
            if (role === primaryRole) return rng.float(0.55, 0.95);
            // Most champions are near-unplayed off-role, and some are exactly 0.
            return rng.chance(0.4) ? 0 : rng.float(0.001, 0.12);
        });
        const total = roleShare.reduce((a, b) => a + b, 0);

        shapes.push({
            key: String(i + 1),
            roleShare: roleShare.map((share) => share / total),
            popularity: rng.float(0.2, 3),
            strength: rng.float(0.44, 0.56),
            zeroGames: zeroGameIndices.has(i),
        });
    }

    return shapes;
}

function createRoleData(
    rng: Rng,
    shape: ChampionShape,
    role: Role,
    totalGames: number,
): ChampionRoleData {
    const games = shape.zeroGames ? 0 : Math.round(totalGames * shape.roleShare[role]);
    const wins = drawWins(rng, games, shape.strength);

    const statsByTime: Stats[] = Array.from({ length: TIME_BUCKETS }, () => {
        // Buckets are deliberately allowed to be empty.
        const bucketGames = games === 0 ? 0 : Math.round(games * rng.float(0, 0.3));
        return {
            games: bucketGames,
            wins: drawWins(rng, bucketGames, shape.strength),
        };
    });

    return {
        games,
        wins,
        matchup: emptyRoleRecord(() => ({})),
        synergy: emptyRoleRecord(() => ({})),
        damageProfile: {
            magic: rng.float(0, 1),
            physical: rng.float(0, 1),
            true: rng.float(0, 0.2),
        },
        statsByTime,
    };
}

function createChampionData(
    rng: Rng,
    shape: ChampionShape,
    totalGames: number,
): ChampionData {
    return {
        id: `Champion${shape.key}`,
        key: shape.key,
        name: `Champion ${shape.key}`,
        i18n: { en_US: { name: `Champion ${shape.key}` } },
        statsByRole: {
            0: createRoleData(rng, shape, 0, totalGames),
            1: createRoleData(rng, shape, 1, totalGames),
            2: createRoleData(rng, shape, 2, totalGames),
            3: createRoleData(rng, shape, 3, totalGames),
            4: createRoleData(rng, shape, 4, totalGames),
        },
    };
}

/**
 * Fills the complete matchup and synergy matrices: every (champion, role) pair
 * against/with every (other champion, other role) pair.
 */
function fillMatchupsAndSynergies(
    rng: Rng,
    dataset: Dataset,
    shapes: ChampionShape[],
): void {
    const keys = shapes.map((s) => s.key).filter((k) => dataset.championData[k]);

    for (const key of keys) {
        const champion = dataset.championData[key];
        for (const role of ROLES) {
            const roleData = champion.statsByRole[role];

            for (const otherKey of keys) {
                if (otherKey === key) continue;

                for (const otherRole of ROLES) {
                    // A champion never faces or partners itself in its own role.
                    const pairGames =
                        roleData.games === 0
                            ? 0
                            : Math.max(
                                  0,
                                  Math.round(roleData.games * rng.float(0, 0.05)),
                              );

                    if (rng.chance(0.25)) {
                        // Leave a quarter of the cells missing so the engine's
                        // "no data" fallbacks get exercised too.
                        continue;
                    }

                    roleData.matchup[otherRole][otherKey] = {
                        championKey: otherKey,
                        games: pairGames,
                        wins: drawWins(rng, pairGames, rng.float(0.4, 0.6)),
                    };

                    const synergyGames =
                        roleData.games === 0
                            ? 0
                            : Math.max(
                                  0,
                                  Math.round(roleData.games * rng.float(0, 0.05)),
                              );
                    roleData.synergy[otherRole][otherKey] = {
                        championKey: otherKey,
                        games: synergyGames,
                        wins: drawWins(rng, synergyGames, rng.float(0.4, 0.6)),
                    };
                }
            }
        }
    }
}

/**
 * Builds the pair of datasets the engine takes: a per-patch one and a 30-day
 * "full" one holding the matchup/synergy matrices.
 */
export function createParityDatasets(
    options: DatasetFactoryOptions = {},
): ParityDatasets {
    const resolved: Required<DatasetFactoryOptions> = {
        seed: options.seed ?? 0x5eed,
        championCount: options.championCount ?? 40,
        zeroGameChampionCount: options.zeroGameChampionCount ?? 3,
    };

    const rng = createRng(resolved.seed);
    const shapes = createChampionShapes(rng, resolved);
    const championKeys = shapes.map((s) => s.key);

    // Two champions are missing from the 30-day dataset (freshly released, in
    // effect), which is a branch `analyzeChampion` handles explicitly.
    const missingFromFull = championKeys.slice(-2);

    const patch: Dataset = {
        version: "5",
        date: "2026-01-08",
        championData: {},
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    };

    const full: Dataset = {
        version: "5",
        date: "2026-01-01",
        championData: {},
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    };

    for (const shape of shapes) {
        patch.championData[shape.key] = createChampionData(
            rng,
            shape,
            Math.round(6000 * shape.popularity),
        );
    }

    for (const shape of shapes) {
        if (missingFromFull.includes(shape.key)) continue;
        full.championData[shape.key] = createChampionData(
            rng,
            shape,
            Math.round(24000 * shape.popularity),
        );
    }

    fillMatchupsAndSynergies(rng, full, shapes);

    return {
        patch,
        full,
        championKeys,
        missingFromFull,
        zeroGameChampions: shapes.filter((s) => s.zeroGames).map((s) => s.key),
    };
}

/** Deep structural clone of a dataset (no `structuredClone` dependency). */
export function cloneDataset(dataset: Dataset): Dataset {
    return JSON.parse(JSON.stringify(dataset)) as Dataset;
}
