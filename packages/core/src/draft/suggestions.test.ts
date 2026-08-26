import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "../models/Role.js";
import { makeDataset, makeTeam, setSynergy } from "../testing/fixtures.js";
import type { Dataset } from "../models/dataset/Dataset.js";
import type { AnalyzeDraftConfig } from "./analysis.js";
import { analyzeDraft } from "./analysis.js";
import { getBanSuggestions, getSuggestions } from "./suggestions.js";

let patch: Dataset;
let full: Dataset;

const config: AnalyzeDraftConfig = {
    ignoreChampionWinrates: false,
    riskLevel: "medium",
    minGames: 0,
};

beforeEach(() => {
    // Four champions, all Top/Jungle capable, with clearly different strengths.
    const spec = (key: string, top: number, jungle: number) => ({
        key,
        roles: {
            [Role.Top]: { games: 1000, wins: top },
            [Role.Jungle]: { games: 1000, wins: jungle },
        },
    });

    patch = makeDataset([
        spec("1", 600, 500),
        spec("2", 500, 620),
        spec("3", 450, 450),
        spec("4", 520, 480),
    ]);
    full = makeDataset([
        spec("1", 6000, 5000),
        spec("2", 5000, 6200),
        spec("3", 4500, 4500),
        spec("4", 5200, 4800),
    ]);
    for (const champion of Object.values(full.championData)) {
        for (const role of [Role.Top, Role.Jungle]) {
            champion.statsByRole[role].games = 10000;
        }
    }

    setSynergy(full, "1", Role.Top, "2", Role.Jungle, { games: 4000, wins: 2400 });
    setSynergy(full, "2", Role.Jungle, "1", Role.Top, { games: 4000, wins: 2400 });
});

describe("getSuggestions", () => {
    it("suggests every free champion in every open role, best first", () => {
        const suggestions = getSuggestions(patch, full, new Map(), new Map(), config);

        // 4 champions x 5 roles.
        expect(suggestions).toHaveLength(20);
        for (let i = 1; i < suggestions.length; i++) {
            expect(suggestions[i - 1].draftResult.winrate).toBeGreaterThanOrEqual(
                suggestions[i].draftResult.winrate,
            );
        }
        // Champion 2 in the jungle is the single strongest pick.
        expect(suggestions[0]).toMatchObject({ championKey: "2", role: Role.Jungle });
    });

    it("exposes rating and winrate straight off the draft result", () => {
        const suggestions = getSuggestions(patch, full, new Map(), new Map(), config);
        for (const suggestion of suggestions) {
            expect(suggestion.rating).toBe(suggestion.draftResult.totalRating);
            expect(suggestion.winrate).toBe(suggestion.draftResult.winrate);
        }
    });

    it("skips champions already picked by either team", () => {
        const team = makeTeam([[Role.Top, "1"]]);
        const enemy = makeTeam([[Role.Jungle, "2"]]);
        const suggestions = getSuggestions(patch, full, team, enemy, config);

        const keys = new Set(suggestions.map((s) => s.championKey));
        expect(keys.has("1")).toBe(false);
        expect(keys.has("2")).toBe(false);
        expect(keys).toEqual(new Set(["3", "4"]));
    });

    it("only fills open roles", () => {
        const team = makeTeam([
            [Role.Top, "1"],
            [Role.Jungle, "2"],
        ]);
        const suggestions = getSuggestions(patch, full, team, new Map(), config);
        const roles = new Set(suggestions.map((s) => s.role));
        expect(roles.has(Role.Top)).toBe(false);
        expect(roles.has(Role.Jungle)).toBe(false);
        expect(roles).toEqual(new Set([Role.Middle, Role.Bottom, Role.Support]));
    });

    it("applies minGames against the 30-day sample scaled to one patch", () => {
        // 10000 games over 30 days is 10000/30*7 = 2333 games per patch.
        expect(
            getSuggestions(patch, full, new Map(), new Map(), {
                ...config,
                minGames: 2000,
            }).length,
        ).toBe(8);
        expect(
            getSuggestions(patch, full, new Map(), new Map(), {
                ...config,
                minGames: 3000,
            }),
        ).toEqual([]);
    });

    it("does not mutate the team it is given", () => {
        const team = makeTeam([[Role.Top, "1"]]);
        const before = [...team.entries()];
        getSuggestions(patch, full, team, new Map(), config);
        expect([...team.entries()]).toEqual(before);
    });

    it("reports the draft that would result from taking the suggestion", () => {
        const enemy = makeTeam([[Role.Top, "3"]]);
        const suggestions = getSuggestions(patch, full, new Map(), enemy, config);
        const best = suggestions[0];

        const expected = analyzeDraft(
            patch,
            full,
            makeTeam([[best.role, best.championKey]]),
            enemy,
            config,
        );
        expect(best.draftResult.totalRating).toBeCloseTo(expected.totalRating, 12);
    });

    it("prefers the champion that synergises with the existing pick", () => {
        const team = makeTeam([[Role.Top, "1"]]);
        const jungleSuggestions = getSuggestions(
            patch,
            full,
            team,
            new Map(),
            config,
        ).filter((s) => s.role === Role.Jungle);

        expect(jungleSuggestions[0].championKey).toBe("2");
    });
});

describe("getBanSuggestions", () => {
    it("ranks the champions that would most help the enemy", () => {
        const bans = getBanSuggestions(patch, full, new Map(), new Map(), config);

        expect(bans.map((b) => b.championKey)).toEqual(["2", "1", "4", "3"]);
        for (let i = 1; i < bans.length; i++) {
            expect(bans[i - 1].rating).toBeGreaterThanOrEqual(bans[i].rating);
        }
        // The strongest threat is champion 2 in the jungle.
        expect(bans[0].role).toBe(Role.Jungle);
    });

    it("reports the ally winrate if the enemy got the champion", () => {
        const bans = getBanSuggestions(patch, full, new Map(), new Map(), config);
        for (const ban of bans) {
            expect(ban.winrate).toBeCloseTo(1 - ban.draftResult.winrate, 12);
        }
        // Letting the enemy have the strongest champion is bad for us. (Weak
        // champions bottom out at 50%: the enemy would rather take an unplayed
        // role, which is worth nothing to either side.)
        expect(bans[0].winrate).toBeLessThan(0.5);
        expect(Math.max(...bans.map((b) => b.winrate))).toBeLessThanOrEqual(0.5);
    });

    it("skips champions that are already banned or picked", () => {
        const bans = getBanSuggestions(
            patch,
            full,
            makeTeam([[Role.Top, "1"]]),
            makeTeam([[Role.Jungle, "2"]]),
            config,
            ["3"],
        );
        expect(bans.map((b) => b.championKey)).toEqual(["4"]);
    });

    it("returns nothing when there is nothing left to ban", () => {
        const bans = getBanSuggestions(patch, full, new Map(), new Map(), config, [
            "1",
            "2",
            "3",
            "4",
        ]);
        expect(bans).toEqual([]);
    });
});
