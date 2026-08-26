import { describe, expect, it } from "vitest";
import type {
    BuildEntry,
    BuildsPayload,
    ItemDetail,
    StaticRunesResponse,
} from "../../api";
import {
    baseRating,
    bestEntry,
    buildGold,
    corePath,
    entryLabel,
    findEntry,
    fullBuild,
    levelPicks,
    matchupDelta,
    matchupEntry,
    recommendedFromRows,
    recommendedSecondary,
    runeBranch,
    runeSlotIndex,
    situationalItems,
    skillLetters,
    sumDelta,
} from "./build-helpers";

function entry(
    id: number | string,
    rating: number,
    extra: Partial<BuildEntry> = {},
): BuildEntry {
    return {
        id,
        name: typeof id === "string" ? id : `Item ${id}`,
        icon: null,
        rating,
        winrate: 0.5,
        winrateDelta: rating / 1000,
        wins: 500,
        games: 1000,
        matchups: [],
        ...extra,
    };
}

describe("item path", () => {
    it("takes the best item of each slot and never buys the same item twice", () => {
        const byOrder = [
            [entry(1, 10), entry(2, 5)],
            [entry(1, 12), entry(3, 4)],
            [entry(1, 9), entry(2, 8)],
        ];
        expect(corePath(byOrder).map((item) => item.id)).toEqual([1, 3, 2]);
    });

    it("honours an exclusion list, so boots are not bought twice", () => {
        const byOrder = [[entry(3009, 20), entry(4, 3)], [entry(5, 2)]];
        expect(corePath(byOrder, [3009]).map((item) => item.id)).toEqual([4, 5]);
    });

    it("drops a slot whose every option is already bought", () => {
        expect(corePath([[entry(1, 5)], [entry(1, 4)]]).map((item) => item.id)).toEqual(
            [1],
        );
    });

    it("lists late options the recommended path does not already buy", () => {
        const byOrder = [
            [entry(1, 10)],
            [entry(2, 9)],
            [entry(3, 8), entry(4, 12)],
            [entry(4, 11), entry(5, 1)],
        ];
        const late = situationalItems(byOrder, [1, 2, 3]);
        expect(late.map((item) => item.id)).toEqual([4, 5]);
    });
});

describe("fullBuild", () => {
    const items = (sets: BuildEntry[]): BuildsPayload["items"] => ({
        boots: [entry(3009, 15)],
        startingSets: [entry("1055_2003", 8)],
        sets,
        byOrder: [[entry(1, 10)], [entry(3009, 30), entry(2, 9)]],
    });

    it("assembles a build when the dataset has no complete sets, and says so", () => {
        const build = fullBuild(items([]));
        expect(build.reconstructed).toBe(true);
        expect(build.starter?.id).toBe("1055_2003");
        expect(build.boots?.id).toBe(3009);
        expect(build.path.map((item) => item.id)).toEqual([1, 2]);
    });

    it("prefers a real set when there is one", () => {
        const build = fullBuild(items([entry("1_2_3", 40)]));
        expect(build.reconstructed).toBe(false);
        expect(build.set?.id).toBe("1_2_3");
    });

    it("survives a payload with empty buckets", () => {
        const build = fullBuild({ boots: [], startingSets: [], sets: [], byOrder: [] });
        expect(build).toEqual({
            starter: null,
            boots: null,
            set: null,
            reconstructed: true,
            path: [],
        });
    });
});

describe("buildGold", () => {
    const catalogue = new Map<number, ItemDetail>([
        [1, { id: 1, gold: { total: 3000 } } as ItemDetail],
        [2, { id: 2, gold: { total: 2500 } } as ItemDetail],
        [1055, { id: 1055, gold: { total: 450 } } as ItemDetail],
    ]);

    it("adds up components rather than the set id", () => {
        const starter = entry("1055_1055", 1, {
            components: [
                { id: 1055, name: "a", icon: null },
                { id: 1055, name: "a", icon: null },
            ],
        });
        expect(buildGold([starter, entry(1, 1), entry(2, 1)], catalogue)).toBe(6400);
    });

    it("returns null when the catalogue is unavailable or knows nothing", () => {
        expect(buildGold([entry(1, 1)], null)).toBeNull();
        expect(buildGold([entry(99, 1)], catalogue)).toBeNull();
    });
});

describe("rune tree", () => {
    const runes: StaticRunesResponse = {
        version: "16.17.1",
        paths: [
            {
                id: 8400,
                key: "Resolve",
                name: "Résolution",
                icon: "resolve.png",
                slots: [
                    [
                        { id: 8437, slot: 0, index: 0 },
                        { id: 8439, slot: 0, index: 1 },
                    ],
                    [
                        { id: 8446, slot: 1, index: 0 },
                        { id: 8463, slot: 1, index: 1 },
                    ],
                ] as StaticRunesResponse["paths"][number]["slots"],
            },
            {
                id: 8200,
                key: "Sorcery",
                name: "Sorcellerie",
                icon: "sorcery.png",
                slots: [
                    [{ id: 8214, slot: 0, index: 0 }],
                    [{ id: 8224, slot: 1, index: 0 }],
                ] as StaticRunesResponse["paths"][number]["slots"],
            },
        ] as StaticRunesResponse["paths"],
        shardRows: [],
    };

    it("groups a flat list back into tree rows and finds the path", () => {
        const slots = runeSlotIndex(runes);
        const branch = runeBranch(
            [entry(8439, 20), entry(8446, 5), entry(8437, 12), entry(8463, 9)],
            slots,
            runes,
        );
        expect(branch.path?.key).toBe("Resolve");
        expect(branch.rows.map((row) => row.slot)).toEqual([0, 1]);
        expect(branch.rows[0].entries.map((rune) => rune.id)).toEqual([8439, 8437]);
        expect(recommendedFromRows(branch.rows)).toEqual([8439, 8463]);
    });

    it("keeps runes the catalogue does not know instead of dropping them", () => {
        const branch = runeBranch([entry(99999, 3)], runeSlotIndex(runes), runes);
        expect(branch.orphans.map((rune) => rune.id)).toEqual([99999]);
        expect(branch.path).toBeNull();
        expect(branch.rows).toEqual([]);
    });

    it("degrades to an empty index when the catalogue never loaded", () => {
        expect(runeSlotIndex(null).size).toBe(0);
        expect(runeBranch([entry(8439, 1)], new Map(), null).orphans).toHaveLength(1);
    });

    it("recommends two secondary runes from two different rows", () => {
        const rows = [
            { slot: 1, entries: [entry(1, 30), entry(2, 29)] },
            { slot: 2, entries: [entry(3, 20)] },
            { slot: 3, entries: [entry(4, 10)] },
        ];
        expect(recommendedSecondary(rows)).toEqual([1, 3]);
    });

    it("finds an entry anywhere in the branch", () => {
        const rows = [{ slot: 0, entries: [entry(8439, 1)] }];
        expect(findEntry(rows, 8439)?.id).toBe(8439);
        expect(findEntry(rows, "8439")?.id).toBe(8439);
        expect(findEntry(rows, undefined)).toBeNull();
        expect(findEntry(rows, 1)).toBeNull();
    });

    it("adds up the contributions of a setup, ignoring empty slots", () => {
        expect(sumDelta([entry(1, 10), null, entry(2, 20)])).toBeCloseTo(0.03, 12);
    });
});

describe("matchups", () => {
    const withMatchup = entry(3009, 9.5, {
        matchups: [
            {
                championKey: "122",
                name: "Darius",
                role: 0,
                rating: 8,
                wins: 400,
                games: 800,
            },
        ],
    });

    it("finds the matchup row and turns its rating into a win-probability", () => {
        const match = matchupEntry(withMatchup, "122");
        expect(match?.games).toBe(800);
        expect(matchupDelta(match)).toBeCloseTo(0.0115, 3);
        expect(matchupEntry(withMatchup, "64")).toBeNull();
        expect(matchupEntry(withMatchup, null)).toBeNull();
        expect(matchupDelta(null)).toBeNull();
    });

    it("recovers the generic rating by removing the matchup adjustment", () => {
        expect(baseRating(withMatchup)).toBeCloseTo(1.5, 12);
        expect(baseRating(entry(1, 4))).toBe(4);
    });
});

describe("skills", () => {
    it("splits a max order into slots and ignores noise", () => {
        expect(skillLetters("EQW")).toEqual(["E", "Q", "W"]);
        expect(skillLetters("q-w!e")).toEqual(["Q", "W", "E"]);
        expect(skillLetters(42)).toEqual([]);
    });

    it("ranks the options of every level", () => {
        const picks = levelPicks([[entry("Q", 1), entry("W", 5)], [entry("E", 2)], []]);
        expect(picks.map((pick) => pick.best?.id)).toEqual(["W", "E", undefined]);
        expect(picks[0].entries.map((option) => option.id)).toEqual(["W", "Q"]);
        expect(picks[2].best).toBeNull();
    });
});

describe("entry helpers", () => {
    it("names an entry even when the dataset has no name for it", () => {
        expect(entryLabel(entry(3009, 1))).toBe("Item 3009");
        expect(entryLabel({ ...entry(3009, 1), name: null })).toBe("#3009");
    });

    it("returns the best entry, or null for an empty bucket", () => {
        expect(bestEntry([entry(1, 5), entry(2, 4)])?.id).toBe(1);
        expect(bestEntry([])).toBeNull();
    });
});
