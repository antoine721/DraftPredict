/**
 * Parity suite: proves `@draftpredict/core` reproduces DraftGap's core exactly.
 *
 * The reference under `tests/reference/draftgap-core` is an unmodified MIT copy
 * of DraftGap's core package (© Vigo Vlugt) and is imported here by relative
 * path. Nothing in this file may modify it.
 *
 * Every assertion is made to a 1e-9 tolerance. In practice the ported code
 * performs the identical sequence of floating-point operations, so the results
 * are bit-identical; the tolerance only guards against harmless reassociation.
 *
 * DOCUMENTED DIFFERENCES between the port and the reference
 * ---------------------------------------------------------
 * 1. `getSuggestions` returns two extra fields per suggestion (`rating` and
 *    `winrate`, both read straight off `draftResult`) because the REST API and
 *    the web UI need them without walking into `draftResult`. The comparison
 *    below therefore checks the reference's fields and separately asserts the
 *    two extra fields are consistent with `draftResult`. Ordering, membership
 *    and every numeric value are identical.
 * 2. `getSuggestions` does its bookkeeping on a private copy of the `team` map
 *    instead of mutating the caller's map and restoring it. The reference
 *    always restored the map, so no observable result changes; the port is just
 *    side-effect free. This is asserted explicitly below.
 * 3. `analyzeDraftExtra` ignores its `enemy` argument in both implementations
 *    (kept for signature compatibility). The port marks it as unused.
 * 4. `getTeamDamageDistribution` skips champions missing from the dataset
 *    rather than throwing a TypeError. Parity is asserted on champions that are
 *    present, where the behaviour is identical.
 * No other behavioural differences exist.
 */

import { describe, expect, it } from "vitest";

import {
    analyzeChampion,
    analyzeChampions,
    analyzeDraft,
    analyzeDraftExtra,
    analyzeDuos,
    analyzeMatchups,
    getDraftResultWinrateByTime,
    getStats,
    getSuggestions,
    getTeamComps,
    getTeamDamageDistribution,
    predictRoleProbabilities,
    priorGamesByRiskLevel,
    ratingToWinrate,
    winrateToRating,
    type AnalyzeDraftConfig,
    type Role,
} from "@draftpredict/core";

import {
    analyzeChampion as refAnalyzeChampion,
    analyzeChampions as refAnalyzeChampions,
    analyzeDraft as refAnalyzeDraft,
    analyzeDuos as refAnalyzeDuos,
    analyzeMatchups as refAnalyzeMatchups,
} from "../reference/draftgap-core/draft/analysis";
import { getSuggestions as refGetSuggestions } from "../reference/draftgap-core/draft/suggestions";
import { analyzeDraftExtra as refAnalyzeDraftExtra } from "../reference/draftgap-core/draft/extra-analysis";
import { getStats as refGetStats } from "../reference/draftgap-core/draft/utils";
import refPredictRoles, {
    getTeamComps as refGetTeamComps,
} from "../reference/draftgap-core/role/role-predictor";
import { getTeamDamageDistribution as refGetTeamDamageDistribution } from "../reference/draftgap-core/damage-distribution/damage-distribution";
import {
    ratingToWinrate as refRatingToWinrate,
    winrateToRating as refWinrateToRating,
} from "../reference/draftgap-core/rating/ratings";
import { priorGamesByRiskLevel as refPriorGamesByRiskLevel } from "../reference/draftgap-core/risk/risk-level";
import type { RiskLevel } from "../reference/draftgap-core/risk/risk-level";

import { createParityDatasets, createRng, ROLES } from "./dataset-factory";

const TOLERANCE = 1e-9;

const RISK_LEVELS: RiskLevel[] = ["very-low", "low", "medium", "high", "very-high"];

// ------------------------------------------------------------- comparison ---

function closeEnough(actual: number, expected: number): boolean {
    if (Number.isNaN(actual) && Number.isNaN(expected)) return true;
    if (actual === expected) return true;
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
    const diff = Math.abs(actual - expected);
    return diff <= TOLERANCE || diff <= TOLERANCE * Math.abs(expected);
}

/**
 * Asserts `actual` matches `expected` numerically. Only keys present on
 * `expected` are inspected, so the port may add fields (see difference 1).
 */
function expectEquivalent(actual: unknown, expected: unknown, path = "$"): void {
    if (typeof expected === "number") {
        if (typeof actual !== "number" || !closeEnough(actual, expected)) {
            throw new Error(
                `${path}: expected ${String(expected)}, got ${String(actual)}`,
            );
        }
        return;
    }

    if (expected === null || typeof expected !== "object") {
        if (actual !== expected) {
            throw new Error(
                `${path}: expected ${String(expected)}, got ${String(actual)}`,
            );
        }
        return;
    }

    if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) {
            throw new Error(`${path}: expected an array, got ${typeof actual}`);
        }
        if (actual.length !== expected.length) {
            throw new Error(
                `${path}.length: expected ${expected.length}, got ${actual.length}`,
            );
        }
        for (let i = 0; i < expected.length; i++) {
            expectEquivalent(actual[i], expected[i], `${path}[${i}]`);
        }
        return;
    }

    if (expected instanceof Map) {
        if (!(actual instanceof Map)) {
            throw new Error(`${path}: expected a Map, got ${typeof actual}`);
        }
        if (actual.size !== expected.size) {
            throw new Error(
                `${path}.size: expected ${expected.size}, got ${actual.size}`,
            );
        }
        for (const [key, value] of expected) {
            if (!actual.has(key)) {
                throw new Error(`${path}: missing key ${String(key)}`);
            }
            expectEquivalent(actual.get(key), value, `${path}.get(${String(key)})`);
        }
        return;
    }

    if (typeof actual !== "object" || actual === null) {
        throw new Error(`${path}: expected an object, got ${typeof actual}`);
    }

    for (const [key, value] of Object.entries(expected)) {
        expectEquivalent(
            (actual as Record<string, unknown>)[key],
            value,
            `${path}.${key}`,
        );
    }
}

// ------------------------------------------------------------ scenarios -----

const datasets = createParityDatasets({ seed: 0xd4a17 });

type Scenario = {
    index: number;
    team: Map<Role, string>;
    enemy: Map<Role, string>;
    config: AnalyzeDraftConfig;
};

/**
 * 220 scenarios covering: empty teams, one-sided drafts, partial drafts, full
 * 5v5 drafts, zero-game champions, champions missing from the 30-day dataset,
 * both `ignoreChampionWinrates` settings and all five risk levels.
 */
function createScenarios(count: number): Scenario[] {
    const rng = createRng(0xbadca11);
    const keys = datasets.championKeys;
    const scenarios: Scenario[] = [];

    const drawTeam = (size: number, taken: Set<string>): Map<Role, string> => {
        const roles = rng.shuffle(ROLES).slice(0, size);
        const team = new Map<Role, string>();
        for (const role of roles.sort((a, b) => a - b)) {
            let championKey = rng.pick(keys);
            let guard = 0;
            while (taken.has(championKey) && guard++ < 50) {
                championKey = rng.pick(keys);
            }
            if (taken.has(championKey)) continue;
            taken.add(championKey);
            team.set(role, championKey);
        }
        return team;
    };

    for (let index = 0; index < count; index++) {
        const taken = new Set<string>();

        let teamSize: number;
        let enemySize: number;
        if (index < 8) {
            // Hand-picked degenerate shapes first.
            const shapes: [number, number][] = [
                [0, 0],
                [0, 5],
                [5, 0],
                [1, 0],
                [0, 1],
                [5, 5],
                [1, 1],
                [4, 5],
            ];
            [teamSize, enemySize] = shapes[index];
        } else {
            teamSize = rng.int(0, 5);
            enemySize = rng.int(0, 5);
        }

        const team = drawTeam(teamSize, taken);
        const enemy = drawTeam(enemySize, taken);

        // Guarantee the awkward champions show up regularly.
        if (index % 17 === 0 && datasets.zeroGameChampions.length > 0) {
            const role = ROLES.find((r) => !team.has(r));
            const championKey =
                datasets.zeroGameChampions[index % datasets.zeroGameChampions.length];
            if (role !== undefined && !taken.has(championKey)) {
                team.set(role, championKey);
                taken.add(championKey);
            }
        }
        if (index % 23 === 0 && datasets.missingFromFull.length > 0) {
            const role = ROLES.find((r) => !enemy.has(r));
            const championKey =
                datasets.missingFromFull[index % datasets.missingFromFull.length];
            if (role !== undefined && !taken.has(championKey)) {
                enemy.set(role, championKey);
                taken.add(championKey);
            }
        }

        scenarios.push({
            index,
            team,
            enemy,
            config: {
                ignoreChampionWinrates: rng.chance(0.3),
                riskLevel: RISK_LEVELS[index % RISK_LEVELS.length],
                minGames: rng.pick([0, 1, 100, 500, 2000, 10000]),
            },
        });
    }

    return scenarios;
}

const scenarios = createScenarios(220);

function describeScenario(scenario: Scenario): string {
    const fmt = (team: Map<Role, string>) =>
        [...team.entries()].map(([r, c]) => `${r}:${c}`).join(",") || "-";
    return (
        `#${scenario.index} ally=[${fmt(scenario.team)}] ` +
        `enemy=[${fmt(scenario.enemy)}] risk=${scenario.config.riskLevel} ` +
        `ignoreWr=${scenario.config.ignoreChampionWinrates} ` +
        `minGames=${scenario.config.minGames}`
    );
}

// ------------------------------------------------------------------ tests ---

describe("constants", () => {
    it("uses the same prior games per risk level", () => {
        expect(priorGamesByRiskLevel).toEqual(refPriorGamesByRiskLevel);
    });
});

describe("ratings", () => {
    it("matches the reference over the whole winrate range", () => {
        const rng = createRng(0x9e11);
        for (let i = 0; i < 2000; i++) {
            const winrate = rng.float(0.001, 0.999);
            expectEquivalent(
                winrateToRating(winrate),
                refWinrateToRating(winrate),
                `winrateToRating(${winrate})`,
            );

            const rating = rng.float(-1500, 1500);
            expectEquivalent(
                ratingToWinrate(rating),
                refRatingToWinrate(rating),
                `ratingToWinrate(${rating})`,
            );
        }
    });
});

describe("getStats", () => {
    it("reads the same samples as the reference", () => {
        const rng = createRng(0x57a75);
        const keys = datasets.championKeys;
        for (let i = 0; i < 3000; i++) {
            const championKey = rng.pick(keys);
            const championKey2 = rng.pick(keys);
            const role = rng.pick(ROLES);
            const role2 = rng.pick(ROLES);

            expectEquivalent(
                getStats(datasets.full, championKey, role),
                refGetStats(datasets.full, championKey, role),
                "base",
            );
            expectEquivalent(
                getStats(datasets.full, championKey, role, "duo", role2, championKey2),
                refGetStats(
                    datasets.full,
                    championKey,
                    role,
                    "duo",
                    role2,
                    championKey2,
                ),
                "duo",
            );
            expectEquivalent(
                getStats(
                    datasets.full,
                    championKey,
                    role,
                    "matchup",
                    role2,
                    championKey2,
                ),
                refGetStats(
                    datasets.full,
                    championKey,
                    role,
                    "matchup",
                    role2,
                    championKey2,
                ),
                "matchup",
            );
        }
    });
});

describe("analyzeChampion", () => {
    it("matches the reference for every champion and role", () => {
        for (const championKey of datasets.championKeys) {
            for (const role of ROLES) {
                for (const riskLevel of RISK_LEVELS) {
                    const priorGames = refPriorGamesByRiskLevel[riskLevel];
                    expectEquivalent(
                        analyzeChampion(
                            datasets.patch,
                            datasets.full,
                            role,
                            championKey,
                            priorGames,
                        ),
                        refAnalyzeChampion(
                            datasets.patch,
                            datasets.full,
                            role,
                            championKey,
                            priorGames,
                        ),
                        `${championKey}/${role}/${riskLevel}`,
                    );
                }
            }
        }
    });
});

describe("draft analysis", () => {
    it.each(scenarios.map((s) => [describeScenario(s), s] as const))(
        "matches the reference: %s",
        (_label, scenario) => {
            const { team, enemy, config } = scenario;
            const priorGames = refPriorGamesByRiskLevel[config.riskLevel];

            expectEquivalent(
                analyzeChampions(datasets.patch, datasets.full, team, priorGames),
                refAnalyzeChampions(datasets.patch, datasets.full, team, priorGames),
                "analyzeChampions",
            );

            expectEquivalent(
                analyzeDuos(datasets.full, team, priorGames),
                refAnalyzeDuos(datasets.full, team, priorGames),
                "analyzeDuos(ally)",
            );
            expectEquivalent(
                analyzeDuos(datasets.full, enemy, priorGames),
                refAnalyzeDuos(datasets.full, enemy, priorGames),
                "analyzeDuos(enemy)",
            );

            expectEquivalent(
                analyzeMatchups(datasets.full, team, enemy, priorGames),
                refAnalyzeMatchups(datasets.full, team, enemy, priorGames),
                "analyzeMatchups",
            );

            expectEquivalent(
                analyzeDraft(datasets.patch, datasets.full, team, enemy, config),
                refAnalyzeDraft(datasets.patch, datasets.full, team, enemy, config),
                "analyzeDraft",
            );
        },
    );
});

describe("suggestions", () => {
    it.each(scenarios.map((s) => [describeScenario(s), s] as const))(
        "matches the reference: %s",
        (_label, scenario) => {
            const { team, enemy, config } = scenario;

            const teamSnapshot = [...team.entries()];
            const actual = getSuggestions(
                datasets.patch,
                datasets.full,
                team,
                enemy,
                config,
            );

            // Difference 2: the port never mutates the caller's map.
            expect([...team.entries()]).toEqual(teamSnapshot);

            const expected = refGetSuggestions(
                datasets.patch,
                datasets.full,
                new Map(team),
                enemy,
                config,
            );

            expect(actual.length).toBe(expected.length);
            expect(actual.map((s) => `${s.championKey}/${s.role}`)).toEqual(
                expected.map((s) => `${s.championKey}/${s.role}`),
            );
            expectEquivalent(actual, expected, "getSuggestions");

            // Difference 1: the extra fields mirror `draftResult`.
            for (const suggestion of actual) {
                expect(suggestion.rating).toBe(suggestion.draftResult.totalRating);
                expect(suggestion.winrate).toBe(suggestion.draftResult.winrate);
            }
        },
    );
});

describe("winrate by time", () => {
    it.each(scenarios.map((s) => [describeScenario(s), s] as const))(
        "matches the reference: %s",
        (_label, scenario) => {
            const { team, enemy, config } = scenario;

            expectEquivalent(
                analyzeDraftExtra(datasets.patch, datasets.full, team, enemy, config),
                refAnalyzeDraftExtra(
                    datasets.patch,
                    datasets.full,
                    team,
                    enemy,
                    config,
                ),
                "analyzeDraftExtra(ally)",
            );
            expectEquivalent(
                analyzeDraftExtra(datasets.patch, datasets.full, enemy, team, config),
                refAnalyzeDraftExtra(
                    datasets.patch,
                    datasets.full,
                    enemy,
                    team,
                    config,
                ),
                "analyzeDraftExtra(enemy)",
            );

            // `getDraftResultWinrateByTime` is DraftPredict's presentation layer
            // on top of the reference's `analyzeDraftExtra`; verify it is exactly
            // that and nothing more.
            const draftResult = analyzeDraft(
                datasets.patch,
                datasets.full,
                team,
                enemy,
                config,
            );
            const byTime = getDraftResultWinrateByTime(
                datasets.patch,
                draftResult,
                team,
                enemy,
                config,
            );
            const allyExtra = refAnalyzeDraftExtra(
                datasets.patch,
                datasets.patch,
                team,
                enemy,
                config,
            );
            const enemyExtra = refAnalyzeDraftExtra(
                datasets.patch,
                datasets.patch,
                enemy,
                team,
                config,
            );

            expect(byTime.length).toBe(allyExtra.ratingByTime.length);
            byTime.forEach((bucket, i) => {
                expect(bucket.duration).toBe(20 + i * 5);
                expectEquivalent(
                    bucket.winrate,
                    refRatingToWinrate(
                        draftResult.totalRating +
                            allyExtra.ratingByTime[i].totalRating -
                            enemyExtra.ratingByTime[i].totalRating,
                    ),
                    `byTime[${i}].winrate`,
                );
            });
        },
    );
});

describe("role prediction", () => {
    it("matches the reference team-comp enumeration and probabilities", () => {
        const rng = createRng(0x201e5);
        for (let i = 0; i < 60; i++) {
            const keys = rng.shuffle(datasets.championKeys).slice(0, 5);
            const champions = keys.map((key) => datasets.patch.championData[key]);

            const actualComps = getTeamComps(champions);
            const expectedComps = refGetTeamComps(champions);

            expect(actualComps.length).toBe(expectedComps.length);
            expectEquivalent(
                actualComps.map(([comp, p]) => [[...comp.entries()], p]),
                expectedComps.map(([comp, p]) => [[...comp.entries()], p]),
                `teamComps[${i}]`,
            );

            expectEquivalent(
                predictRoleProbabilities(actualComps),
                refPredictRoles(expectedComps),
                `predictRoles[${i}]`,
            );
        }
    });
});

describe("damage distribution", () => {
    it("matches the reference", () => {
        for (const scenario of scenarios) {
            expectEquivalent(
                getTeamDamageDistribution(datasets.full, scenario.team),
                refGetTeamDamageDistribution(
                    datasets.full,
                    // Difference 4: the reference throws on champions missing
                    // from the dataset, so only compare on champions it has.
                    new Map(
                        [...scenario.team].filter(
                            ([, key]) => datasets.full.championData[key],
                        ),
                    ),
                ),
                `damage[${scenario.index}]`,
            );
        }
    });
});

describe("scenario coverage", () => {
    it("exercises the cases the suite claims to cover", () => {
        expect(scenarios.length).toBeGreaterThanOrEqual(200);

        const usedRiskLevels = new Set(scenarios.map((s) => s.config.riskLevel));
        expect([...usedRiskLevels].sort()).toEqual([...RISK_LEVELS].sort());

        expect(scenarios.some((s) => s.config.ignoreChampionWinrates)).toBe(true);
        expect(scenarios.some((s) => !s.config.ignoreChampionWinrates)).toBe(true);

        expect(scenarios.some((s) => s.team.size === 0 && s.enemy.size === 0)).toBe(
            true,
        );
        expect(scenarios.some((s) => s.team.size === 5 && s.enemy.size === 5)).toBe(
            true,
        );
        expect(
            scenarios.filter((s) => s.team.size > 0 && s.team.size < 5).length,
        ).toBeGreaterThan(20);

        const allChampions = scenarios.flatMap((s) => [
            ...s.team.values(),
            ...s.enemy.values(),
        ]);
        expect(
            allChampions.some((key) => datasets.zeroGameChampions.includes(key)),
        ).toBe(true);
        expect(allChampions.some((key) => datasets.missingFromFull.includes(key))).toBe(
            true,
        );

        // And the suggestion comparisons above were not all trivially empty.
        const suggestionCounts = scenarios
            .slice(0, 20)
            .map(
                (s) =>
                    getSuggestions(
                        datasets.patch,
                        datasets.full,
                        s.team,
                        s.enemy,
                        s.config,
                    ).length,
            );
        expect(Math.max(...suggestionCounts)).toBeGreaterThan(50);
    });
});
