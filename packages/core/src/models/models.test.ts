import { describe, expect, it } from "vitest";
import { displayNameByRank, isRank, parseRank, RANKS } from "./Rank.js";
import { displayNameByRegion, isRegion, parseRegion, REGIONS } from "./Region.js";
import {
    displayNameByRole,
    getRoleFromString,
    isRole,
    riotPositionByRole,
    Role,
    ROLES,
} from "./Role.js";
import { displayNameByTeam, otherTeam, TEAMS } from "./Team.js";
import { emptyStats, winrate } from "./Stats.js";
import {
    emptyDamageProfile,
    normalizeDamageProfile,
    totalDamage,
} from "./dataset/ChampionDamageProfile.js";
import {
    defaultChampionRoleData,
    deleteChampionRoleDataMatchupSynergyData,
    timeBucketStartMinutes,
    TIME_BUCKET_COUNT,
} from "./dataset/ChampionRoleData.js";
import { defaultChampionData, getChampionName } from "./dataset/ChampionData.js";
import { DATASET_VERSION, emptyDataset, removeRankBias } from "./dataset/Dataset.js";
import { defaultConfig, getDefaultConfig } from "./user/Config.js";
import { winrateToRating } from "../rating/ratings.js";

describe("Role", () => {
    it("keeps the numeric values the dataset format depends on", () => {
        expect([...ROLES]).toEqual([0, 1, 2, 3, 4]);
        expect(Role.Top).toBe(0);
        expect(Role.Support).toBe(4);
    });

    it("exposes Riot's vocabulary as aliases of the same values", () => {
        expect(Role.UTILITY).toBe(Role.Support);
        expect(Role.MIDDLE).toBe(Role.Middle);
        expect(riotPositionByRole[Role.Support]).toBe("UTILITY");
    });

    it("names every role", () => {
        for (const role of ROLES) {
            expect(displayNameByRole[role]).toBeTruthy();
        }
    });

    it("parses the spellings that show up in the wild", () => {
        expect(getRoleFromString("TOP")).toBe(Role.Top);
        expect(getRoleFromString(" utility ")).toBe(Role.Support);
        expect(getRoleFromString("adc")).toBe(Role.Bottom);
        expect(getRoleFromString("jgl")).toBe(Role.Jungle);
        expect(getRoleFromString("coach")).toBeUndefined();
    });

    it("guards role values", () => {
        expect(isRole(0)).toBe(true);
        expect(isRole(4)).toBe(true);
        expect(isRole(5)).toBe(false);
        expect(isRole(-1)).toBe(false);
        expect(isRole("0")).toBe(false);
        expect(isRole(1.5)).toBe(false);
    });
});

describe("Team", () => {
    it("has two sides that name and invert each other", () => {
        expect([...TEAMS]).toEqual(["ally", "opponent"]);
        expect(otherTeam("ally")).toBe("opponent");
        expect(otherTeam("opponent")).toBe("ally");
        expect(displayNameByTeam.ally).toBe("Ally");
    });
});

describe("Rank", () => {
    it("lists every rank the datasets are published for", () => {
        expect(RANKS).toContain("ALL");
        expect(RANKS).toContain("EMERALD");
        expect(RANKS).toContain("PLATINUM_PLUS");
        expect(RANKS).toContain("DIAMOND_PLUS");
        expect(RANKS).toHaveLength(13);
    });

    it("names every rank", () => {
        for (const rank of RANKS) {
            expect(displayNameByRank[rank]).toBeTruthy();
        }
    });

    it("parses case-insensitively and rejects junk", () => {
        expect(parseRank("gold")).toBe("GOLD");
        expect(parseRank("platinum plus")).toBe("PLATINUM_PLUS");
        expect(parseRank("platinum-plus")).toBe("PLATINUM_PLUS");
        expect(parseRank("wood")).toBeUndefined();
        expect(isRank("IRON")).toBe(true);
        expect(isRank("iron")).toBe(false);
    });
});

describe("Region", () => {
    it("lists every serviced region", () => {
        expect(REGIONS).toContain("ALL");
        expect(REGIONS).toContain("EUW");
        expect(REGIONS).toContain("ME");
        expect(REGIONS).toHaveLength(18);
    });

    it("names every region", () => {
        for (const region of REGIONS) {
            expect(displayNameByRegion[region]).toBeTruthy();
        }
    });

    it("parses case-insensitively and rejects junk", () => {
        expect(parseRegion("euw")).toBe("EUW");
        expect(parseRegion(" kr ")).toBe("KR");
        expect(parseRegion("mars")).toBeUndefined();
        expect(isRegion("NA")).toBe(true);
    });
});

describe("Stats", () => {
    it("starts empty and calls an empty sample even", () => {
        expect(emptyStats()).toEqual({ wins: 0, games: 0 });
        expect(winrate({ wins: 0, games: 0 })).toBe(0.5);
        expect(winrate({ wins: 3, games: 4 })).toBe(0.75);
    });
});

describe("ChampionDamageProfile", () => {
    it("sums and normalizes", () => {
        const profile = { magic: 1, physical: 2, true: 1 };
        expect(totalDamage(profile)).toBe(4);
        expect(normalizeDamageProfile(profile)).toEqual({
            magic: 0.25,
            physical: 0.5,
            true: 0.25,
        });
    });

    it("normalizes an empty profile to zeroes rather than NaN", () => {
        expect(normalizeDamageProfile(emptyDamageProfile())).toEqual({
            magic: 0,
            physical: 0,
            true: 0,
        });
    });
});

describe("ChampionRoleData", () => {
    it("defaults to an empty sample with all five role maps", () => {
        const data = defaultChampionRoleData();
        expect(data.games).toBe(0);
        expect(Object.keys(data.matchup)).toEqual(["0", "1", "2", "3", "4"]);
        expect(Object.keys(data.synergy)).toEqual(["0", "1", "2", "3", "4"]);
        expect(data.statsByTime).toHaveLength(TIME_BUCKET_COUNT);
        expect(TIME_BUCKET_COUNT).toBe(7);
    });

    it("gives each duration bucket a 5 minute window from 20 minutes", () => {
        expect(timeBucketStartMinutes(0)).toBe(20);
        expect(timeBucketStartMinutes(6)).toBe(50);
    });

    it("can drop its matchup and synergy maps", () => {
        const data = defaultChampionRoleData();
        deleteChampionRoleDataMatchupSynergyData(data);
        expect(data.matchup).toEqual({});
        expect(data.synergy).toEqual({});
    });
});

describe("ChampionData", () => {
    it("defaults to an unplayed champion in every role", () => {
        const champion = defaultChampionData("266", "Aatrox", "Aatrox");
        expect(champion.key).toBe("266");
        expect(Object.keys(champion.statsByRole)).toHaveLength(5);
        expect(champion.statsByRole[0].games).toBe(0);
    });

    it("localises the name when a translation exists", () => {
        const champion = defaultChampionData("266", "Aatrox", "Aatrox");
        champion.i18n = { fr_FR: { name: "Aatrox FR" } };
        expect(getChampionName(champion)).toBe("Aatrox");
        expect(getChampionName(champion, "fr_FR")).toBe("Aatrox FR");
        expect(getChampionName(champion, "de_DE")).toBe("Aatrox");
    });
});

describe("Dataset", () => {
    it("declares the DraftGap v5 format", () => {
        expect(DATASET_VERSION).toBe("5");
        expect(emptyDataset().version).toBe("5");
        expect(emptyDataset().championData).toEqual({});
    });

    it("removeRankBias shifts every champion down by the dataset rating", () => {
        const dataset = emptyDataset();
        dataset.championData["1"] = defaultChampionData("1");
        dataset.championData["2"] = defaultChampionData("2");
        // Dataset-wide winrate is 600/1000 = 0.6.
        dataset.championData["1"].statsByRole[0].games = 500;
        dataset.championData["1"].statsByRole[0].wins = 350;
        dataset.championData["2"].statsByRole[0].games = 500;
        dataset.championData["2"].statsByRole[0].wins = 250;

        const rankRating = winrateToRating(0.6);
        removeRankBias(dataset);

        // The correction happens in rating space, not winrate space.
        expect(
            winrateToRating(dataset.championData["1"].statsByRole[0].wins / 500),
        ).toBeCloseTo(winrateToRating(0.7) - rankRating, 9);
        expect(
            winrateToRating(dataset.championData["2"].statsByRole[0].wins / 500),
        ).toBeCloseTo(winrateToRating(0.5) - rankRating, 9);
        // Both champions get worse, since the dataset was above 50% overall.
        expect(dataset.championData["1"].statsByRole[0].wins).toBeLessThan(350);
        expect(dataset.championData["2"].statsByRole[0].wins).toBeLessThan(250);
    });

    it("removeRankBias shifts each champion by the dataset rating", () => {
        const dataset = emptyDataset();
        dataset.championData["1"] = defaultChampionData("1");
        dataset.championData["1"].statsByRole[0].games = 1000;
        dataset.championData["1"].statsByRole[0].wins = 600;

        removeRankBias(dataset);
        // With a single champion, the rank rating equals its own rating.
        expect(dataset.championData["1"].statsByRole[0].wins).toBeCloseTo(500, 6);
        expect(winrateToRating(0.6)).toBeGreaterThan(0);
    });
});

describe("Config", () => {
    it("ships sane defaults", () => {
        expect(defaultConfig.riskLevel).toBe("medium");
        expect(defaultConfig.rank).toBe("PLATINUM_PLUS");
        expect(defaultConfig.region).toBe("ALL");
        expect(defaultConfig.ignoreChampionWinrates).toBe(false);
    });

    it("hands out a fresh copy each time", () => {
        const config = getDefaultConfig();
        config.minGames = 1;
        expect(getDefaultConfig().minGames).toBe(defaultConfig.minGames);
    });
});
