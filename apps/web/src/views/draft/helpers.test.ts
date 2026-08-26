import { describe, expect, it } from "vitest";
import type {
    BanEntry,
    ContributionEntry,
    DamageDistribution,
    DraftBreakdown,
    SuggestionEntry,
} from "../../api/types";
import { emptyBoard } from "../../state";
import {
    collectFactors,
    damageShares,
    damageVerdict,
    durationVerdict,
    entryWinrate,
    factorLabel,
    factorReason,
    banReason,
    phaseLabel,
    slotSample,
    smallestSample,
    suggestionReason,
    swapBoard,
    topFactors,
    totalChampionSample,
} from "./helpers";

/**
 * The reasoning of the draft view.
 *
 * The property that matters most is the sign convention: the engine's totals
 * are ally-centric (`ally - enemy + allyDuo - enemyDuo + matchup`), so an
 * enemy contribution must come out negated. Every "green = good for you"
 * pixel on screen depends on it.
 */

function entry(
    champions: { key: string; name: string; role: 0 | 1 | 2 | 3 | 4 }[],
    rating: number,
    winrateDelta: number,
    wins = 100,
    games = 200,
): ContributionEntry {
    return {
        champions: champions.map((champion) => ({
            key: champion.key,
            id: champion.name,
            name: champion.name,
            icon: null,
            role: champion.role,
        })),
        rating,
        winrateDelta,
        wins,
        games,
    };
}

const BREAKDOWN: DraftBreakdown = {
    allyChampions: {
        totalRating: -21.9,
        entries: [
            entry([{ key: "266", name: "Aatrox", role: 0 }], -21.9, -0.031, 846, 1806),
        ],
    },
    enemyChampions: {
        totalRating: 12,
        entries: [
            entry([{ key: "122", name: "Darius", role: 0 }], 12, 0.017, 600, 1000),
        ],
    },
    allyDuos: {
        totalRating: 4,
        entries: [
            entry(
                [
                    { key: "266", name: "Aatrox", role: 0 },
                    { key: "64", name: "Lee Sin", role: 1 },
                ],
                4,
                0.006,
                342.05,
                684,
            ),
        ],
    },
    enemyDuos: {
        totalRating: 3,
        entries: [
            entry(
                [
                    { key: "122", name: "Darius", role: 0 },
                    { key: "157", name: "Yasuo", role: 2 },
                ],
                3,
                0.004,
                40,
                80,
            ),
        ],
    },
    matchups: {
        totalRating: -2,
        entries: [
            entry(
                [
                    { key: "266", name: "Aatrox", role: 0 },
                    { key: "122", name: "Darius", role: 0 },
                ],
                -2,
                -0.003,
                405.6,
                817,
            ),
        ],
    },
};

describe("collectFactors", () => {
    it("negates enemy contributions so green always means good for you", () => {
        const factors = collectFactors(BREAKDOWN);
        const enemyChampion = factors.find((factor) =>
            factor.id.includes("champion:opponent"),
        );
        const allyChampion = factors.find((factor) =>
            factor.id.includes("champion:ally"),
        );
        expect(enemyChampion?.rating).toBe(-12);
        expect(enemyChampion?.effect).toBeCloseTo(-0.017, 6);
        expect(allyChampion?.rating).toBe(-21.9);
        expect(allyChampion?.effect).toBeCloseTo(-0.031, 6);
    });

    it("keeps matchups on the ally side of the ledger", () => {
        const matchup = collectFactors(BREAKDOWN).find(
            (factor) => factor.kind === "matchup",
        );
        expect(matchup?.rating).toBe(-2);
    });

    it("sums to the engine's total rating", () => {
        const total = collectFactors(BREAKDOWN).reduce(
            (sum, factor) => sum + factor.rating,
            0,
        );
        // ally - enemy + allyDuo - enemyDuo + matchup
        expect(total).toBeCloseTo(-21.9 - 12 + 4 - 3 - 2, 6);
    });

    it("survives a missing breakdown", () => {
        expect(collectFactors(undefined)).toEqual([]);
    });
});

describe("topFactors", () => {
    it("splits helpful from harmful and orders each by magnitude", () => {
        const { positive, negative } = topFactors(collectFactors(BREAKDOWN), 5);
        expect(positive.map((factor) => factor.rating)).toEqual([4]);
        // Worst first: the biggest problem is the one to read.
        expect(negative.map((factor) => factor.rating)).toEqual([-21.9, -12, -3, -2]);
    });

    it("respects the requested count", () => {
        const { negative } = topFactors(collectFactors(BREAKDOWN), 2);
        expect(negative.map((factor) => factor.rating)).toEqual([-21.9, -12]);
    });
});

describe("labels and reasons", () => {
    it("names a solo champion, a duo and a matchup differently", () => {
        const factors = collectFactors(BREAKDOWN);
        const champion = factors.find((factor) => factor.kind === "champion")!;
        const duo = factors.find((factor) => factor.kind === "duo")!;
        const matchup = factors.find((factor) => factor.kind === "matchup")!;
        expect(factorLabel(champion)).toBe("Aatrox (Top)");
        expect(factorLabel(duo)).toBe("Aatrox (Top) + Lee Sin (Jungle)");
        expect(factorLabel(matchup)).toBe("Aatrox (Top) vs Darius (Top)");
    });

    it("marks an enemy champion or duo as theirs", () => {
        const factors = collectFactors(BREAKDOWN);
        const enemy = factors.find((factor) =>
            factor.id.includes("champion:opponent"),
        )!;
        const enemyDuo = factors.find((factor) => factor.id.includes("duo:opponent"))!;
        const matchup = factors.find((factor) => factor.kind === "matchup")!;
        expect(factorLabel(enemy)).toBe("Darius (Top) — adverse");
        expect(factorLabel(enemyDuo)).toBe("Darius (Top) + Yasuo (Mid) — adverse");
        // A matchup already names both sides in order.
        expect(factorLabel(matchup)).toBe("Aatrox (Top) vs Darius (Top)");
    });

    it("explains a matchup with its own sample", () => {
        const matchup = collectFactors(BREAKDOWN).find(
            (factor) => factor.kind === "matchup",
        )!;
        const reason = factorReason(matchup);
        expect(reason).toContain("Aatrox (Top) affronte Darius (Top)");
        expect(reason).toContain("817");
        expect(reason).toContain("49,6");
    });

    it("rounds the fractional wins of the Bayesian prior", () => {
        const duo = collectFactors(BREAKDOWN).find((factor) => factor.kind === "duo")!;
        expect(factorReason(duo)).toContain("342 victoires");
    });
});

describe("samples", () => {
    it("reports the smallest sample and what it comes from", () => {
        expect(smallestSample(BREAKDOWN)).toEqual({
            games: 80,
            label: "Darius (Top) + Yasuo (Mid) — adverse",
        });
    });

    it("adds up the champion samples of both teams", () => {
        expect(totalChampionSample(BREAKDOWN)).toBe(2806);
    });

    it("finds the numbers of one board slot", () => {
        expect(slotSample(BREAKDOWN, "ally", 0, "266")).toEqual({
            winrate: 846 / 1806,
            games: 1806,
        });
        expect(slotSample(BREAKDOWN, "ally", 1, "266")).toBeNull();
        expect(slotSample(BREAKDOWN, "opponent", 0, "122")?.games).toBe(1000);
    });

    it("returns null rather than dividing by zero", () => {
        expect(
            entryWinrate(entry([{ key: "1", name: "X", role: 0 }], 0, 0, 0, 0)),
        ).toBeNull();
    });
});

describe("swapBoard", () => {
    it("exchanges picks and bans", () => {
        const board = emptyBoard();
        board.ally[0] = "266";
        board.opponent[2] = "157";
        board.bans.ally = ["1"];
        board.bans.opponent = ["2", "3"];

        const swapped = swapBoard(board);
        expect(swapped.ally[2]).toBe("157");
        expect(swapped.ally[0]).toBeNull();
        expect(swapped.opponent[0]).toBe("266");
        expect(swapped.bans).toEqual({ ally: ["2", "3"], opponent: ["1"] });
        // The original is untouched.
        expect(board.ally[0]).toBe("266");
    });

    it("is its own inverse", () => {
        const board = emptyBoard();
        board.ally[3] = "22";
        board.bans.opponent = ["50"];
        expect(swapBoard(swapBoard(board))).toEqual(board);
    });
});

describe("damage", () => {
    const distribution: DamageDistribution = {
        magic: 0.456,
        physical: 1.352,
        true: 0.192,
        total: 2,
    };

    it("turns absolute damage into shares", () => {
        const shares = damageShares(distribution);
        expect(shares.magic).toBeCloseTo(0.228, 6);
        expect(shares.physical).toBeCloseTo(0.676, 6);
        expect(shares.trueDamage).toBeCloseTo(0.096, 6);
    });

    it("falls back to the sum when the total is missing", () => {
        const shares = damageShares({ magic: 1, physical: 1, true: 0, total: 0 });
        expect(shares.magic).toBeCloseTo(0.5, 6);
    });

    it("warns about one-dimensional damage", () => {
        expect(damageVerdict({ magic: 0, physical: 2, true: 0, total: 2 })).toContain(
            "physiques",
        );
        expect(damageVerdict({ magic: 2, physical: 0, true: 0, total: 2 })).toContain(
            "magiques",
        );
        expect(damageVerdict(undefined)).toBeNull();
    });
});

describe("durationVerdict", () => {
    it("calls a rising curve a late-game composition", () => {
        const verdict = durationVerdict([
            { duration: 20, winrate: 0.47 },
            { duration: 40, winrate: 0.52 },
        ]);
        expect(verdict?.tone).toBe("late");
        expect(verdict?.description).toContain("40");
    });

    it("calls a falling curve an early-game composition", () => {
        expect(
            durationVerdict([
                { duration: 20, winrate: 0.52 },
                { duration: 40, winrate: 0.47 },
            ])?.tone,
        ).toBe("early");
    });

    it("does not invent a trend out of noise", () => {
        expect(
            durationVerdict([
                { duration: 20, winrate: 0.5 },
                { duration: 40, winrate: 0.5005 },
            ])?.tone,
        ).toBe("flat");
        expect(durationVerdict([])).toBeNull();
    });
});

describe("suggestion and ban reasons", () => {
    const suggestion: SuggestionEntry = {
        key: "360",
        id: "Samira",
        name: "Samira",
        icon: null,
        role: 1,
        rating: 8.4,
        winrate: 0.512,
        winrateDelta: 0.0475,
        games: 8612,
    };

    it("states the gain, the baseline and the sample", () => {
        const reason = suggestionReason(suggestion, 0.4645, 0);
        expect(reason).toContain("Meilleur choix en Jungle");
        expect(reason).toContain("+4,8");
        expect(reason).toContain("46,5");
        expect(reason).toContain("8,6");
    });

    it("does not oversell a neutral pick", () => {
        const reason = suggestionReason(
            { ...suggestion, winrateDelta: 0.0001 },
            0.5,
            4,
        );
        expect(reason).toContain("ne change presque rien");
    });

    it("spells out what a ban is worth", () => {
        const ban: BanEntry = {
            key: "50",
            id: "Swain",
            name: "Swain",
            icon: null,
            role: 4,
            rating: 28.9,
            winrate: 0.4274,
            winrateLoss: 0.0411,
            games: 14451,
        };
        expect(banReason(ban)).toContain("Support");
        expect(banReason(ban)).toContain("4,1");
    });
});

describe("phaseLabel", () => {
    it("translates the League Client's sub-phases", () => {
        expect(phaseLabel("BAN_PICK")).toBe("Bans & picks");
        expect(phaseLabel("FINALIZATION")).toBe("Finalisation");
        expect(phaseLabel(null)).toBe("Sélection des champions");
        expect(phaseLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    });
});
