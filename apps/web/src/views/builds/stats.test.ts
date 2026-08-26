import { describe, expect, it } from "vitest";
import {
    analyzeDuos,
    analyzeMatchups,
    defaultChampionData,
    priorGamesByRiskLevel,
    ratingToWinrate as coreRatingToWinrate,
    winrateToRating as coreWinrateToRating,
    type Dataset,
    type Role,
} from "@draftpredict/core";
import {
    PRIOR_GAMES_BY_RISK,
    buildChampionRoleIndex,
    damageKind,
    durationSeries,
    encodeVersus,
    estimateTiers,
    isThinSample,
    matchupRow,
    matchupRows,
    normalizeDamage,
    partnerRole,
    playableRoles,
    ratingToWinrate,
    sampleTier,
    sampleWinrate,
    shrinkWinrate,
    synergyRow,
    synergyRows,
    tierFromScore,
    tierOf,
    wilsonInterval,
    winrateToRating,
} from "./stats";

/**
 * The champion screen re-implements four engine formulas so the bundle can
 * stay free of `@draftpredict/core` at runtime. These tests exist to make sure
 * the copy never drifts: every one of them compares against the real engine.
 */

const TOP: Role = 0;
const JUNGLE: Role = 1;
const BOTTOM: Role = 3;
const UTILITY: Role = 4;

function emptyDataset(): Dataset {
    return {
        version: "5",
        date: "2026-08-26",
        championData: {},
        itemData: {},
        runeData: {},
        runePathData: {},
        statShardData: {},
        summonerSpellData: {},
    };
}

function withChampion(
    dataset: Dataset,
    key: string,
    role: Role,
    stats: { wins: number; games: number },
): Dataset {
    const champion =
        dataset.championData[key] ??
        defaultChampionData(key, `C${key}`, `Champion ${key}`);
    champion.statsByRole[role].games = stats.games;
    champion.statsByRole[role].wins = stats.wins;
    dataset.championData[key] = champion;
    return dataset;
}

function link(
    dataset: Dataset,
    kind: "matchup" | "synergy",
    a: [string, Role],
    b: [string, Role],
    stats: { wins: number; games: number },
): void {
    dataset.championData[a[0]].statsByRole[a[1]][kind][b[1]][b[0]] = {
        championKey: b[0],
        wins: stats.wins,
        games: stats.games,
    };
}

/** Two laners with a lopsided matchup and a bot-lane duo. */
function sampleDataset(): Dataset {
    const dataset = emptyDataset();
    withChampion(dataset, "1", TOP, { wins: 5400, games: 10000 });
    withChampion(dataset, "2", TOP, { wins: 4700, games: 9000 });
    withChampion(dataset, "3", JUNGLE, { wins: 2600, games: 5000 });
    withChampion(dataset, "4", BOTTOM, { wins: 3100, games: 6000 });
    withChampion(dataset, "5", UTILITY, { wins: 2000, games: 4000 });

    link(dataset, "matchup", ["1", TOP], ["2", TOP], { wins: 700, games: 1200 });
    link(dataset, "matchup", ["2", TOP], ["1", TOP], { wins: 480, games: 1180 });
    link(dataset, "matchup", ["1", TOP], ["3", JUNGLE], { wins: 260, games: 500 });
    link(dataset, "matchup", ["3", JUNGLE], ["1", TOP], { wins: 230, games: 510 });

    link(dataset, "synergy", ["4", BOTTOM], ["5", UTILITY], { wins: 900, games: 1500 });
    link(dataset, "synergy", ["5", UTILITY], ["4", BOTTOM], { wins: 880, games: 1490 });
    return dataset;
}

describe("rating helpers mirror the engine", () => {
    it("agrees with @draftpredict/core to the last bit", () => {
        for (let rating = -800; rating <= 800; rating += 13) {
            expect(ratingToWinrate(rating)).toBe(coreRatingToWinrate(rating));
        }
        for (let winrate = 0.05; winrate < 0.95; winrate += 0.017) {
            expect(winrateToRating(winrate)).toBe(coreWinrateToRating(winrate));
        }
    });

    it("uses the engine's prior sample sizes", () => {
        expect(PRIOR_GAMES_BY_RISK).toEqual(priorGamesByRiskLevel);
    });
});

describe("matchupRow", () => {
    it("reproduces analyzeMatchups for the same pairing", () => {
        const dataset = sampleDataset();
        const prior = PRIOR_GAMES_BY_RISK.medium;
        const expected = analyzeMatchups(
            dataset,
            new Map([[TOP, "1"]]),
            new Map([[TOP, "2"]]),
            prior,
        ).matchupResults[0];

        const row = matchupRow(dataset, "1", TOP, "2", TOP, prior);
        expect(row.rating).toBeCloseTo(expected.rating, 12);
        expect(row.games).toBeCloseTo(expected.games, 12);
        expect(row.winrateDelta).toBeCloseTo(
            ratingToWinrate(expected.rating) - 0.5,
            12,
        );
    });

    it("rates an unknown pairing as neutral instead of guessing", () => {
        const dataset = sampleDataset();
        const row = matchupRow(dataset, "1", TOP, "4", BOTTOM, 1000);
        expect(row.games).toBe(0);
        expect(row.rating).toBeCloseTo(0, 12);
        expect(row.winrateDelta).toBeCloseTo(0, 12);
    });

    it("keeps the raw sample untouched next to the shrunk rating", () => {
        const dataset = sampleDataset();
        const row = matchupRow(dataset, "1", TOP, "2", TOP, 1000);
        // (700 + (1180 - 480)) / 2 wins over (1200 + 1180) / 2 games.
        expect(row.wins).toBe(700);
        expect(row.games).toBe(1190);
        expect(row.winrate).toBeCloseTo(700 / 1190, 12);
    });
});

describe("synergyRow", () => {
    it("reproduces analyzeDuos for the same pair", () => {
        const dataset = sampleDataset();
        const prior = PRIOR_GAMES_BY_RISK.high;
        const expected = analyzeDuos(
            dataset,
            new Map([
                [BOTTOM, "4"],
                [UTILITY, "5"],
            ]),
            prior,
        ).duoResults[0];

        const row = synergyRow(dataset, "4", BOTTOM, "5", UTILITY, prior);
        expect(row.rating).toBeCloseTo(expected.rating, 12);
        expect(row.games).toBeCloseTo(expected.games, 12);
    });
});

describe("matchupRows / synergyRows", () => {
    it("sweeps every enemy in the matrix, best first", () => {
        const dataset = sampleDataset();
        const rows = matchupRows(dataset, "1", TOP, 1000);
        expect(rows.map((row) => row.championKey).sort()).toEqual(["2", "3"]);
        expect(rows[0].rating).toBeGreaterThanOrEqual(rows[1].rating);
    });

    it("restricts the sweep to the roles asked for", () => {
        const dataset = sampleDataset();
        expect(matchupRows(dataset, "1", TOP, 1000, [TOP])).toHaveLength(1);
    });

    it("never pairs a champion with its own role in a duo", () => {
        const dataset = sampleDataset();
        const rows = synergyRows(dataset, "4", BOTTOM, 1000);
        expect(rows.every((row) => row.role !== BOTTOM)).toBe(true);
        expect(rows.map((row) => row.championKey)).toEqual(["5"]);
    });

    it("returns nothing when the matrix was stripped from the patch window", () => {
        const dataset = emptyDataset();
        withChampion(dataset, "1", TOP, { wins: 10, games: 20 });
        dataset.championData["1"].statsByRole[TOP].matchup =
            {} as Dataset["championData"][string]["statsByRole"][Role]["matchup"];
        expect(matchupRows(dataset, "1", TOP, 1000)).toEqual([]);
        expect(matchupRows(dataset, "999", TOP, 1000)).toEqual([]);
    });
});

describe("samples", () => {
    it("falls back to 50 % rather than dividing by zero", () => {
        expect(sampleWinrate({ wins: 0, games: 0 })).toBe(0.5);
        expect(sampleWinrate({ wins: 3, games: 4 })).toBe(0.75);
    });

    it("pulls a small sample towards the prior and leaves a big one alone", () => {
        expect(shrinkWinrate({ wins: 7, games: 11 }, 1000)).toBeCloseTo(0.5015, 4);
        expect(shrinkWinrate({ wins: 60_000, games: 100_000 }, 1000)).toBeCloseTo(
            0.599,
            4,
        );
        expect(shrinkWinrate({ wins: 0, games: 0 }, 1000)).toBe(0.5);
        expect(shrinkWinrate({ wins: 0, games: 0 }, 0)).toBe(0.5);
    });

    it("gives a wide interval to 11 games and a narrow one to 10 000", () => {
        const thin = wilsonInterval({ wins: 7, games: 11 });
        const thick = wilsonInterval({ wins: 6400, games: 10_000 });
        expect(thin.half).toBeGreaterThan(0.2);
        expect(thick.half).toBeLessThan(0.01);
        expect(thin.low).toBeGreaterThanOrEqual(0);
        expect(thin.high).toBeLessThanOrEqual(1);
        expect(wilsonInterval({ wins: 0, games: 0 })).toEqual({
            low: 0,
            high: 1,
            half: 0.5,
        });
    });

    it("grades sample sizes in four steps", () => {
        expect(sampleTier(0)).toBe("none");
        expect(sampleTier(11)).toBe("thin");
        expect(sampleTier(400)).toBe("fair");
        expect(sampleTier(5000)).toBe("solid");
        expect(isThinSample(11)).toBe(true);
        expect(isThinSample(400)).toBe(false);
    });
});

describe("damage profile", () => {
    it("normalises to shares and names the dominant channel", () => {
        const profile = normalizeDamage({ magic: 1, physical: 3, true: 0 });
        expect(profile.physical).toBeCloseTo(0.75, 12);
        expect(damageKind({ magic: 1, physical: 3, true: 0 })).toBe("physical");
        expect(damageKind({ magic: 8, physical: 1, true: 1 })).toBe("magic");
        expect(damageKind({ magic: 5, physical: 4, true: 1 })).toBe("mixed");
    });

    it("survives a champion with no recorded damage", () => {
        expect(normalizeDamage({ magic: 0, physical: 0, true: 0 })).toEqual({
            magic: 0,
            physical: 0,
            true: 0,
        });
        expect(damageKind({ magic: 0, physical: 0, true: 0 })).toBe("mixed");
    });
});

describe("champion role index", () => {
    it("rates every played role and computes shares that add up", () => {
        const dataset = sampleDataset();
        withChampion(dataset, "1", JUNGLE, { wins: 500, games: 1000 });
        const index = buildChampionRoleIndex(dataset, 1000);

        expect(index.roleTotals[TOP]).toBe(19_000);
        const rows = index.byChampion.get("1")!;
        expect(rows.map((row) => row.role)).toEqual([TOP, JUNGLE]);
        expect(rows[0].pickrate).toBeCloseTo(10_000 / 19_000, 12);
        expect(rows[0].roleShare).toBeCloseTo(10_000 / 11_000, 12);
        expect(rows[0].winrate).toBeCloseTo(0.54, 12);
        expect(rows[0].adjustedWinrate).toBeCloseTo(5900 / 11_000, 12);
        expect(rows[0].rating).toBeCloseTo(winrateToRating(5900 / 11_000), 12);
    });

    it("skips roles nobody plays", () => {
        const index = buildChampionRoleIndex(sampleDataset(), 1000);
        expect(index.byChampion.get("3")!.map((row) => row.role)).toEqual([JUNGLE]);
        expect(index.byRole.get(UTILITY)).toHaveLength(1);
    });

    it("hides off-meta roles from the role selector", () => {
        const dataset = sampleDataset();
        withChampion(dataset, "1", UTILITY, { wins: 6, games: 12 });
        const index = buildChampionRoleIndex(dataset, 1000);
        const roles = playableRoles(index.byChampion.get("1")!);
        expect(roles.map((row) => row.role)).toEqual([TOP]);
    });
});

describe("tier estimate", () => {
    it("puts the strongest, most-played champion of a role on top", () => {
        const dataset = emptyDataset();
        for (let i = 0; i < 20; i += 1) {
            withChampion(dataset, `${100 + i}`, TOP, {
                wins: Math.round(1000 * (0.46 + i * 0.005)),
                games: 1000,
            });
        }
        const index = buildChampionRoleIndex(dataset, 1000);
        const tiers = estimateTiers(index);
        const best = tierOf(tiers, "119", TOP)!;
        const worst = tierOf(tiers, "100", TOP)!;
        const order = ["S", "A", "B", "C", "D"];
        expect(best.score).toBeGreaterThan(worst.score);
        expect(order.indexOf(best.tier)).toBeLessThan(order.indexOf(worst.tier));
    });

    it("refuses to tier a champion with fewer than 100 games", () => {
        const dataset = emptyDataset();
        withChampion(dataset, "1", TOP, { wins: 8, games: 12 });
        withChampion(dataset, "2", TOP, { wins: 900, games: 1800 });
        withChampion(dataset, "3", TOP, { wins: 700, games: 1500 });
        const tiers = estimateTiers(buildChampionRoleIndex(dataset, 1000));
        expect(tierOf(tiers, "1", TOP)).toBeNull();
        expect(tierOf(tiers, "2", TOP)).not.toBeNull();
    });

    it("maps scores onto tiers monotonically", () => {
        expect(tierFromScore(2)).toBe("S");
        expect(tierFromScore(1)).toBe("A");
        expect(tierFromScore(0)).toBe("B");
        expect(tierFromScore(-0.8)).toBe("C");
        expect(tierFromScore(-3)).toBe("D");
    });
});

describe("duration series", () => {
    it("labels the seven buckets from 20 minutes, the last one open-ended", () => {
        const points = durationSeries(
            Array.from({ length: 7 }, (_unused, index) => ({
                wins: 50 + index,
                games: 100,
            })),
        );
        expect(points.map((point) => point.label)).toEqual([
            "20-25",
            "25-30",
            "30-35",
            "35-40",
            "40-45",
            "45-50",
            "50+",
        ]);
        expect(points[0].winrate).toBeCloseTo(0.5, 12);
        expect(points[6].adjustedWinrate).toBeLessThan(points[6].winrate);
    });

    it("returns nothing at all when the dataset has no buckets", () => {
        expect(durationSeries(undefined)).toEqual([]);
    });
});

describe("small helpers", () => {
    it("pairs bot with support and nothing else", () => {
        expect(partnerRole(BOTTOM)).toBe(UTILITY);
        expect(partnerRole(UTILITY)).toBe(BOTTOM);
        expect(partnerRole(TOP)).toBeNull();
    });

    it("encodes the vs query the builds route expects", () => {
        expect(encodeVersus([])).toBeUndefined();
        expect(encodeVersus([["122", TOP]])).toBe("122:0");
        expect(
            encodeVersus([
                ["122", TOP],
                ["64", JUNGLE],
            ]),
        ).toBe("122:0,64:1");
    });
});
