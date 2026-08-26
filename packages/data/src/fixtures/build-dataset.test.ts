import type { Role } from "@draftpredict/core";
import { analyzeBuild, SKILL_ORDERS } from "@draftpredict/core";
import { describe, expect, it } from "vitest";
import { loadStaticData } from "../static/load.js";
import { CHAMPION_LEVELS, generateFixtureBuildDataset } from "./build-dataset.js";

const staticData = loadStaticData();
const config = {
    ignoreChampionWinrates: false,
    riskLevel: "medium" as const,
    minGames: 100,
};

const zed = staticData.championsById.get("Zed")!.key;
const ahri = staticData.championsById.get("Ahri")!.key;
const yasuo = staticData.championsById.get("Yasuo")!.key;

const build = () =>
    generateFixtureBuildDataset({
        championKey: zed,
        role: 2 as Role,
        staticData,
        matchups: [
            { championKey: ahri, role: 2 as Role },
            { championKey: yasuo, role: 2 as Role },
        ],
    });

describe("generateFixtureBuildDataset", () => {
    it("is deterministic", () => {
        expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
    });

    it("fills every bucket the build analysis reads", () => {
        const { dataset, fullDataset } = build();

        expect(dataset.championKey).toBe(zed);
        expect(dataset.role).toBe(2);
        expect(dataset.games).toBeGreaterThan(0);
        expect(dataset.wins).toBeLessThanOrEqual(dataset.games);

        expect(Object.keys(dataset.runes.primary).length).toBeGreaterThan(5);
        expect(Object.keys(dataset.runes.secondary).length).toBeGreaterThan(5);
        expect(Object.keys(dataset.runes.shards.offense)).toEqual([
            "5005",
            "5007",
            "5008",
        ]);
        expect(Object.keys(dataset.items.boots).length).toBeGreaterThan(0);
        expect(dataset.items.statsByOrder).toHaveLength(5);
        expect(Object.keys(dataset.items.startingSets).length).toBeGreaterThan(0);
        expect(Object.keys(dataset.summonerSpells).length).toBeGreaterThan(0);
        expect(Object.keys(dataset.skills.order).sort()).toEqual(
            [...SKILL_ORDERS].sort(),
        );
        expect(dataset.skills.level).toHaveLength(CHAMPION_LEVELS);

        expect(fullDataset.games).toBeGreaterThan(dataset.games);
        expect(fullDataset.matchups).toHaveLength(2);
        expect(fullDataset.matchups.map((m) => m.championKey)).toEqual([ahri, yasuo]);
    });

    it("uses real item and rune ids from the snapshot", () => {
        const { dataset } = build();

        for (const runeId of Object.keys(dataset.runes.primary)) {
            expect(staticData.runesById.has(Number(runeId))).toBe(true);
        }
        for (const itemId of Object.keys(dataset.items.boots)) {
            const item = staticData.itemsById.get(Number(itemId));
            expect(item?.tags).toContain("Boots");
        }
        for (const spellSet of Object.keys(dataset.summonerSpells)) {
            const keys = spellSet.split("_").map(Number);
            expect(keys).toHaveLength(2);
            for (const key of keys) {
                expect(staticData.summonerSpellsById.has(key)).toBe(true);
            }
        }
    });

    it("keeps the patch and 30-day samples aligned so ratings stay finite", () => {
        const { dataset, fullDataset } = build();
        const result = analyzeBuild(dataset, fullDataset, config);

        const ratings = [
            ...Object.values(result.runes.primary),
            ...Object.values(result.runes.secondary),
            ...Object.values(result.runes.shards.offense),
            ...Object.values(result.items.boots),
            ...result.items.statsByOrder.flatMap((slot) => Object.values(slot)),
            ...Object.values(result.items.startingSets),
            ...Object.values(result.summonerSpells),
            ...Object.values(result.skills.order),
            ...result.skills.levels.flatMap((level) => Object.values(level)),
        ];

        expect(ratings.length).toBeGreaterThan(50);
        for (const rating of ratings) {
            expect(Number.isFinite(rating.totalRating)).toBe(true);
            expect(Number.isFinite(rating.baseResult.rating)).toBe(true);
            expect(rating.matchupResult.matchupResults).toHaveLength(2);
        }
    });

    it("produces a meaningful spread so a best build can be picked", () => {
        const { dataset, fullDataset } = build();
        const result = analyzeBuild(dataset, fullDataset, config);

        const keystones = Object.entries(result.runes.primary).sort(
            (a, b) => b[1].totalRating - a[1].totalRating,
        );
        expect(keystones[0][1].totalRating).toBeGreaterThan(
            keystones[keystones.length - 1][1].totalRating,
        );
    });

    it("works with no matchups at all", () => {
        const { dataset, fullDataset } = generateFixtureBuildDataset({
            championKey: zed,
            role: 2 as Role,
            staticData,
        });

        expect(fullDataset.matchups).toEqual([]);
        const result = analyzeBuild(dataset, fullDataset, config);
        for (const rating of Object.values(result.summonerSpells)) {
            expect(Number.isFinite(rating.totalRating)).toBe(true);
            expect(rating.matchupResult.totalRating).toBe(0);
        }
    });
});
