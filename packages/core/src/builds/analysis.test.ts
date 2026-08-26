import { describe, expect, it } from "vitest";
import type { AnalyzeDraftConfig } from "../draft/analysis.js";
import type {
    FullBuildDataset,
    PartialBuildDataset,
} from "../models/build/BuildDataset.js";
import { Role } from "../models/Role.js";
import { analyzeBuild, analyzeBuilds } from "./analysis.js";
import {
    emptyFullBuildDataset,
    emptyPartialBuildDataset,
    normalizeItemSetId,
    normalizeSummonerSpellSetId,
    statsFromWinratePercentage,
} from "./data.js";
import { getItemStats } from "./item-analysis.js";
import { getRuneStatsMap } from "./rune-analysis.js";
import { getSkillLevelStats, getSkillOrderStats } from "./skill-analysis.js";
import { getSummonerSpellStats } from "./summoner-spell-analysis.js";

const config: AnalyzeDraftConfig = {
    ignoreChampionWinrates: false,
    riskLevel: "medium",
    minGames: 0,
};

function populate<T extends PartialBuildDataset>(dataset: T, scale: number): T {
    dataset.games = 1000 * scale;
    dataset.wins = 500 * scale;

    dataset.runes.primary = { "8005": { games: 600 * scale, wins: 330 * scale } };
    dataset.runes.secondary = { "8009": { games: 300 * scale, wins: 150 * scale } };
    dataset.runes.shards.offense = {
        "5008": { games: 900 * scale, wins: 460 * scale },
    };
    dataset.runes.shards.defense = {
        "5011": { games: 800 * scale, wins: 400 * scale },
    };
    dataset.runes.shards.flex = { "5008": { games: 700 * scale, wins: 350 * scale } };

    dataset.items.boots = { "3006": { games: 500 * scale, wins: 280 * scale } };
    dataset.items.statsByOrder = [
        { "6672": { games: 400 * scale, wins: 230 * scale } },
        { "3031": { games: 380 * scale, wins: 200 * scale } },
        {},
        {},
        {},
    ];
    dataset.items.startingSets = {
        "1055_2003": { games: 700 * scale, wins: 360 * scale },
    };

    dataset.summonerSpells = {
        Flash_Ignite: { games: 600 * scale, wins: 330 * scale },
    };

    dataset.skills.order = {
        QWE: { games: 500 * scale, wins: 270 * scale },
        QEW: { games: 200 * scale, wins: 95 * scale },
    } as unknown as PartialBuildDataset["skills"]["order"];
    dataset.skills.level = [
        { Q: { games: 800 * scale, wins: 420 * scale } },
        { W: { games: 700 * scale, wins: 350 * scale } },
    ] as unknown as PartialBuildDataset["skills"]["level"];

    return dataset;
}

function makeDatasets(): [PartialBuildDataset, FullBuildDataset] {
    const partial = populate(emptyPartialBuildDataset("1", Role.Middle), 1);
    const full = populate(emptyFullBuildDataset("1", Role.Middle), 4);
    full.matchups = [
        {
            ...populate(emptyPartialBuildDataset("2", Role.Middle), 1),
            championKey: "2",
            role: Role.Middle,
        },
    ];
    return [partial, full];
}

describe("analyzeBuild", () => {
    it("rates every entity present in the patch build data", () => {
        const [partial, full] = makeDatasets();
        const result = analyzeBuild(partial, full, config);

        expect(Object.keys(result.runes.primary)).toEqual(["8005"]);
        expect(Object.keys(result.runes.secondary)).toEqual(["8009"]);
        expect(Object.keys(result.runes.shards.offense)).toEqual(["5008"]);
        expect(Object.keys(result.runes.shards.defense)).toEqual(["5011"]);
        expect(Object.keys(result.runes.shards.flex)).toEqual(["5008"]);

        expect(Object.keys(result.items.boots)).toEqual(["3006"]);
        expect(result.items.statsByOrder).toHaveLength(5);
        expect(Object.keys(result.items.statsByOrder[0])).toEqual(["6672"]);
        expect(Object.keys(result.items.startingSets)).toEqual(["1055_2003"]);
        // DraftGap leaves full item sets unrated.
        expect(result.items.sets).toEqual({});

        expect(Object.keys(result.summonerSpells)).toEqual(["Flash_Ignite"]);
        expect(Object.keys(result.skills.order)).toEqual(["QWE", "QEW"]);
        expect(result.skills.levels).toHaveLength(2);
    });

    it("produces finite ratings that sum base plus matchups", () => {
        const [partial, full] = makeDatasets();
        const result = analyzeBuild(partial, full, config);

        const entity = result.runes.primary["8005"];
        expect(Number.isFinite(entity.totalRating)).toBe(true);
        expect(entity.totalRating).toBeCloseTo(
            entity.baseResult.rating + entity.matchupResult.totalRating,
            12,
        );
        expect(entity.matchupResult.matchupResults).toHaveLength(1);
    });

    it("prefers the better of two skill orders", () => {
        const [partial, full] = makeDatasets();
        const result = analyzeBuild(partial, full, config);
        // QWE wins 54%, QEW 47.5%.
        expect(result.skills.order.QWE.baseResult.rating).toBeGreaterThan(
            result.skills.order.QEW.baseResult.rating,
        );
    });

    it("is exported under the ARCHITECTURE name too", () => {
        expect(analyzeBuilds).toBe(analyzeBuild);
    });
});

describe("build stat getters", () => {
    it("read every entity family, with a zero fallback", () => {
        const [partial] = makeDatasets();

        expect(getItemStats(partial, { type: "boots", id: 3006 })).toEqual({
            games: 500,
            wins: 280,
        });
        expect(getItemStats(partial, { type: 0, id: 6672 })).toEqual({
            games: 400,
            wins: 230,
        });
        expect(
            getItemStats(partial, { type: "startingSets", id: "1055_2003" }),
        ).toEqual({ games: 700, wins: 360 });
        expect(getItemStats(partial, { type: "sets", id: "nope" })).toEqual({
            games: 0,
            wins: 0,
        });
        expect(getItemStats(partial, { type: 4, id: 1 })).toEqual({
            games: 0,
            wins: 0,
        });

        expect(getRuneStatsMap(partial.runes, "shard-flex")).toBe(
            partial.runes.shards.flex,
        );
        expect(getSummonerSpellStats(partial, "Flash_Ignite")).toEqual({
            games: 600,
            wins: 330,
        });
        expect(getSummonerSpellStats(partial, "missing")).toEqual({
            games: 0,
            wins: 0,
        });
        expect(getSkillOrderStats(partial, "WQE")).toEqual({ games: 0, wins: 0 });
        expect(getSkillLevelStats(partial, { level: 0, skill: "Q" })).toEqual({
            games: 800,
            wins: 420,
        });
        expect(getSkillLevelStats(partial, { level: 9, skill: "Q" })).toEqual({
            games: 0,
            wins: 0,
        });
    });
});

describe("build data helpers", () => {
    it("normalizes item set ids by sorted numeric id", () => {
        expect(normalizeItemSetId([2003, 1055])).toBe("1055_2003");
        expect(normalizeItemSetId(["2003", "1055"])).toBe("1055_2003");
        expect(normalizeItemSetId([1055])).toBe("1055");
        expect(normalizeItemSetId([])).toBe("");
    });

    it("normalizes summoner spell sets so order does not matter", () => {
        expect(normalizeSummonerSpellSetId("Ignite_Flash")).toBe("Flash_Ignite");
        expect(normalizeSummonerSpellSetId("Flash_Ignite")).toBe("Flash_Ignite");
    });

    it("converts a winrate percentage into whole games", () => {
        expect(statsFromWinratePercentage(55, 200)).toEqual({ wins: 110, games: 200 });
        expect(statsFromWinratePercentage(52.5, 7)).toEqual({ wins: 4, games: 7 });
        expect(statsFromWinratePercentage(0, 0)).toEqual({ wins: 0, games: 0 });
    });

    it("builds empty datasets with the right shape", () => {
        const partial = emptyPartialBuildDataset("1", Role.Top);
        expect(partial.items.statsByOrder).toHaveLength(5);
        expect(partial.runes.shards).toEqual({ offense: {}, defense: {}, flex: {} });
        expect(emptyFullBuildDataset("1", Role.Top).matchups).toEqual([]);
    });
});
