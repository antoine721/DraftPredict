import type { Role } from "@draftpredict/core";
import {
    analyzeDraft,
    getStats,
    getSuggestions,
    getTeamDamageDistribution,
    predictRoles,
    ROLES,
    winrate,
} from "@draftpredict/core";
import { describe, expect, it } from "vitest";
import { loadStaticData } from "../static/load.js";
import {
    DEFAULT_FIXTURE_SEED,
    generateFixtureDataset,
    generateFixtureDatasetPair,
} from "./dataset.js";
import { championRoleAffinity, playedRoles } from "./role-affinity.js";
import { createRng } from "./rng.js";

const staticData = loadStaticData();
const config = {
    ignoreChampionWinrates: false,
    riskLevel: "medium" as const,
    minGames: 100,
};

const key = (id: string) => staticData.championsById.get(id)!.key;

describe("generateFixtureDataset", () => {
    it("is byte-identical for the same seed and different for another", () => {
        const a = JSON.stringify(generateFixtureDataset({ staticData, seed: 7 }));
        const b = JSON.stringify(generateFixtureDataset({ staticData, seed: 7 }));
        const c = JSON.stringify(generateFixtureDataset({ staticData, seed: 8 }));

        expect(a).toBe(b);
        expect(a).not.toBe(c);
    });

    it("generates the full 30-day dataset in well under two seconds", () => {
        const started = Date.now();
        generateFixtureDataset({ staticData, window: "full", seed: 3 });
        expect(Date.now() - started).toBeLessThan(2000);
    });

    it("covers the whole real champion roster", () => {
        const dataset = generateFixtureDataset({ staticData, window: "patch" });
        expect(Object.keys(dataset.championData)).toHaveLength(
            staticData.championList.length,
        );

        const zed = dataset.championData[key("Zed")];
        expect(zed.id).toBe("Zed");
        expect(zed.name).toBe("Zed");
        expect(zed.i18n.en_US.name).toBe("Zed");
        expect(Object.keys(zed.statsByRole)).toEqual(["0", "1", "2", "3", "4"]);
    });

    it("keeps every sample internally consistent", () => {
        const dataset = generateFixtureDataset({
            staticData,
            window: "full",
            seed: 11,
        });

        for (const champion of Object.values(dataset.championData)) {
            for (const role of ROLES) {
                const data = champion.statsByRole[role];
                expect(data.wins).toBeGreaterThanOrEqual(0);
                expect(data.wins).toBeLessThanOrEqual(data.games);
                expect(data.statsByTime).toHaveLength(7);
                for (const bucket of data.statsByTime) {
                    expect(bucket.wins).toBeLessThanOrEqual(bucket.games);
                }
                const damage = data.damageProfile;
                expect(
                    damage.magic + damage.physical + damage.true,
                ).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it("puts champions in the roles their class tags imply", () => {
        const dataset = generateFixtureDataset({ staticData, window: "patch" });
        const gamesIn = (id: string, role: Role) =>
            getStats(dataset, key(id), role).games;

        // Marksmen bottom, supports support, junglers jungle.
        expect(gamesIn("Jinx", 3)).toBeGreaterThan(gamesIn("Jinx", 0));
        expect(gamesIn("Thresh", 4)).toBeGreaterThan(gamesIn("Thresh", 2));
        expect(gamesIn("LeeSin", 1)).toBeGreaterThan(gamesIn("LeeSin", 3));
        expect(gamesIn("Darius", 0)).toBeGreaterThan(gamesIn("Darius", 4));
    });

    it("keeps overall winrates in a believable band", () => {
        const dataset = generateFixtureDataset({
            staticData,
            window: "patch",
            seed: 5,
        });

        const played = Object.values(dataset.championData)
            .flatMap((champion) => ROLES.map((role) => champion.statsByRole[role]))
            .filter((data) => data.games > 2000);

        expect(played.length).toBeGreaterThan(50);
        for (const data of played) {
            expect(winrate(data)).toBeGreaterThan(0.3);
            expect(winrate(data)).toBeLessThan(0.7);
        }

        const overall =
            played.reduce((sum, d) => sum + d.wins, 0) /
            played.reduce((sum, d) => sum + d.games, 0);
        expect(overall).toBeGreaterThan(0.45);
        expect(overall).toBeLessThan(0.55);
    });

    it("only fills matchup and synergy matrices for the 30-day window", () => {
        const { dataset, fullDataset } = generateFixtureDatasetPair({ staticData });
        const zed = key("Zed");

        // The patch dataset keeps the role maps present but empty, exactly as
        // DraftGap does — the engine indexes into them unconditionally.
        expect(dataset.championData[zed].statsByRole[2].matchup[0]).toEqual({});
        expect(
            Object.keys(fullDataset.championData[zed].statsByRole[2].matchup[0]).length,
        ).toBeGreaterThan(10);

        // A champion never has synergy data with its own role.
        expect(fullDataset.championData[zed].statsByRole[2].synergy[2]).toEqual({});
        expect(
            Object.keys(fullDataset.championData[zed].statsByRole[2].synergy[3]).length,
        ).toBeGreaterThan(10);
    });

    it("makes matchups roughly antisymmetric", () => {
        const dataset = generateFixtureDataset({ staticData, window: "full", seed: 2 });
        const zed = key("Zed");
        const ahri = key("Ahri");

        const zedVsAhri = getStats(dataset, zed, 2, "matchup", 2, ahri);
        const ahriVsZed = getStats(dataset, ahri, 2, "matchup", 2, zed);

        expect(zedVsAhri.games).toBeGreaterThan(0);
        expect(ahriVsZed.games).toBeGreaterThan(0);
        // Whatever edge one has, the other has the mirror of it.
        expect(winrate(zedVsAhri) + winrate(ahriVsZed)).toBeCloseTo(1, 1);
    });

    it("carries the item, rune and spell catalogues from the snapshot", () => {
        const dataset = generateFixtureDataset({ staticData, window: "patch" });

        expect(dataset.itemData[3153]?.name).toBe("Blade of The Ruined King");
        expect(dataset.itemData[3153]?.gold).toBe(3200);
        expect(dataset.runeData[8112]?.pathId).toBe(8100);
        expect(dataset.runePathData[8100]?.key).toBe("Domination");
        expect(dataset.summonerSpellData[4]?.id).toBe("SummonerFlash");
        expect(dataset.statShardData[5008]?.positions).toHaveLength(2);
    });

    it("accepts a caller-supplied champion list without loading the snapshot", () => {
        const champions = staticData.championList.slice(0, 12);
        const dataset = generateFixtureDataset({ champions, seed: 1 });

        expect(Object.keys(dataset.championData)).toHaveLength(12);
        expect(dataset.itemData).toEqual({});
    });
});

describe("fixture datasets drive the engine", () => {
    const { dataset, fullDataset } = generateFixtureDatasetPair({
        staticData,
        seed: 42,
    });

    const team = new Map<Role, string>([
        [0, key("Darius")],
        [1, key("LeeSin")],
        [2, key("Zed")],
        [3, key("Jinx")],
        [4, key("Thresh")],
    ]);
    const enemy = new Map<Role, string>([
        [0, key("Garen")],
        [1, key("Elise")],
        [2, key("Ahri")],
        [3, key("Caitlyn")],
        [4, key("Leona")],
    ]);

    it("produces a finite, plausible draft winrate", () => {
        const result = analyzeDraft(dataset, fullDataset, team, enemy, config);

        expect(Number.isFinite(result.totalRating)).toBe(true);
        expect(result.winrate).toBeGreaterThan(0.2);
        expect(result.winrate).toBeLessThan(0.8);
        expect(result.allyChampionRating.championResults).toHaveLength(5);
        expect(result.matchupRating.matchupResults.length).toBeGreaterThan(0);
    });

    it("produces suggestions for every open role", () => {
        const partial = new Map<Role, string>([[0, key("Darius")]]);
        const suggestions = getSuggestions(
            dataset,
            fullDataset,
            partial,
            enemy,
            config,
        );

        expect(suggestions.length).toBeGreaterThan(50);
        for (const suggestion of suggestions.slice(0, 20)) {
            expect(Number.isFinite(suggestion.rating)).toBe(true);
            expect(staticData.championsByKey.has(suggestion.championKey)).toBe(true);
        }
    });

    it("keeps random drafts inside a believable winrate band", () => {
        const rng = createRng(9);
        const keys = staticData.championList.map((champion) => champion.key);
        const winrates: number[] = [];

        for (let i = 0; i < 120; i++) {
            const picked = new Set<string>();
            const pick = () => {
                let candidate = rng.pick(keys);
                while (picked.has(candidate)) candidate = rng.pick(keys);
                picked.add(candidate);
                return candidate;
            };
            const blue = new Map<Role, string>(ROLES.map((role) => [role, pick()]));
            const red = new Map<Role, string>(ROLES.map((role) => [role, pick()]));
            winrates.push(
                analyzeDraft(dataset, fullDataset, blue, red, config).winrate,
            );
        }

        const mean = winrates.reduce((sum, w) => sum + w, 0) / winrates.length;
        expect(mean).toBeGreaterThan(0.46);
        expect(mean).toBeLessThan(0.54);
        expect(Math.min(...winrates)).toBeGreaterThan(0.25);
        expect(Math.max(...winrates)).toBeLessThan(0.75);
    });

    it("predicts the obvious roles of a full team", () => {
        const predicted = predictRoles(fullDataset, [...team.values()]);
        expect(predicted.get(3)).toBe(key("Jinx"));
        expect(predicted.get(4)).toBe(key("Thresh"));
        expect(new Set(predicted.values()).size).toBe(5);
    });

    it("gives every team a damage distribution", () => {
        const damage = getTeamDamageDistribution(fullDataset, team);
        expect(damage.magic + damage.physical + damage.true).toBeCloseTo(5, 0);
    });
});

describe("role affinity", () => {
    it("normalizes to a probability distribution", () => {
        const rng = createRng(DEFAULT_FIXTURE_SEED);
        for (const champion of staticData.championList.slice(0, 40)) {
            const affinity = championRoleAffinity(champion, rng);
            const total = ROLES.reduce((sum, role) => sum + affinity[role], 0);
            expect(total).toBeCloseTo(1, 10);
            expect(playedRoles(affinity).length).toBeGreaterThan(0);
        }
    });

    it("always keeps at least the most likely role", () => {
        const affinity = { 0: 0.02, 1: 0.02, 2: 0.03, 3: 0.02, 4: 0.91 } as Record<
            Role,
            number
        >;
        expect(playedRoles(affinity, 0.95)).toEqual([4]);
    });
});
