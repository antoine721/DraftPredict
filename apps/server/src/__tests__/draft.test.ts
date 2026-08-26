import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { generateFixtureDataset } from "@draftpredict/data";
import type { TestApp } from "../testing/harness.js";
import { createTestApp, testStaticData } from "../testing/harness.js";

let harness: TestApp | undefined;
let championKeys: string[];

beforeAll(() => {
    const dataset = generateFixtureDataset({
        window: "patch",
        staticData: testStaticData(),
    });
    championKeys = Object.keys(dataset.championData);
});

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

function draft() {
    return {
        team: [
            [0, championKeys[0]],
            [1, championKeys[1]],
        ],
        enemy: [
            [0, championKeys[2]],
            [4, championKeys[3]],
        ],
        bans: { ally: [championKeys[4]], opponent: [] },
    };
}

describe("POST /api/draft/analyze", () => {
    it("returns the draft result, breakdowns, winrate by time and damage split", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/analyze",
            payload: draft(),
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.result.winrate).toBeGreaterThan(0);
        expect(body.result.winrate).toBeLessThan(1);
        expect(body.result).toHaveProperty("totalRating");

        // Two allies, two enemies, one duo per team, four matchups.
        expect(body.breakdown.allyChampions.entries).toHaveLength(2);
        expect(body.breakdown.allyDuos.entries).toHaveLength(1);
        expect(body.breakdown.matchups.entries).toHaveLength(4);
        expect(body.breakdown.allyChampions.entries[0].champions[0].name).toEqual(
            expect.any(String),
        );

        expect(body.winrateByTime).toHaveLength(5);
        expect(body.winrateByTime[0].duration).toBe(20);

        expect(body.damageDistribution.ally.total).toBeGreaterThan(0);
        expect(body.damageDistribution.opponent.total).toBeGreaterThan(0);

        // Provenance travels with every dataset-backed answer.
        expect(body.dataset.provider).toBe("bundled-fixture");
        expect(body.dataset.offline).toBe(true);

        // The wire format round-trips through core's serialization helpers.
        expect(body.state.ally).toEqual([
            [0, championKeys[0]],
            [1, championKeys[1]],
        ]);
    });

    it("honours a per-request analysis config", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/analyze",
            payload: {
                ...draft(),
                config: { riskLevel: "veryHigh", minGames: 0, ignoreChampionWinrates: true },
            },
        });

        expect(response.statusCode).toBe(200);
        // parseRiskLevel accepts camelCase at the API boundary.
        expect(response.json().config.riskLevel).toBe("very-high");
        expect(response.json().result.allyChampionRating.totalRating).toBe(0);
    });

    it("rejects a role outside 0-4", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/analyze",
            payload: { team: [[7, championKeys[0]]], enemy: [] },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
        expect(response.json().error.details[0].message).toContain("0 (top)");
    });

    it("rejects an unknown champion key", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/analyze",
            payload: { team: [[0, "999999"]], enemy: [] },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("UNKNOWN_CHAMPION");
        expect(response.json().error.details.championKeys).toEqual(["999999"]);
    });

    it("rejects a champion picked on both teams", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/analyze",
            payload: {
                team: [[0, championKeys[0]]],
                enemy: [[1, championKeys[0]]],
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("CHAMPION_ON_BOTH_TEAMS");
    });

    it("rejects the same role filled twice", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/analyze",
            payload: {
                team: [
                    [0, championKeys[0]],
                    [0, championKeys[1]],
                ],
                enemy: [],
            },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("DUPLICATE_ROLE");
    });
});

describe("POST /api/draft/suggestions", () => {
    it("covers every open ally role by default", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/suggestions",
            payload: { ...draft(), limit: 3 },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.roles.map((entry: { role: number }) => entry.role)).toEqual([
            2, 3, 4,
        ]);
        for (const entry of body.roles) {
            expect(entry.suggestions.length).toBeLessThanOrEqual(3);
            for (const suggestion of entry.suggestions) {
                expect(suggestion.role).toBe(entry.role);
                expect(suggestion.name).toEqual(expect.any(String));
                expect(suggestion.games).toBeGreaterThan(0);
            }
        }

        // Sorted best first, and deltas are relative to the current draft.
        const best = body.roles[0].suggestions;
        expect(best[0].winrate).toBeGreaterThanOrEqual(best[1].winrate);
        expect(best[0].winrateDelta).toBeCloseTo(
            best[0].winrate - body.baseline.winrate,
            10,
        );
    });

    it("can be restricted to specific roles", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/suggestions",
            payload: { ...draft(), roles: [2], limit: 2 },
        });

        expect(response.json().roles).toHaveLength(1);
        expect(response.json().roles[0].role).toBe(2);
    });
});

describe("POST /api/draft/bans", () => {
    it("ranks the champions that would hurt most", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/draft/bans",
            payload: { ...draft(), limit: 5 },
        });

        expect(response.statusCode).toBe(200);
        const bans = response.json().bans;

        expect(bans).toHaveLength(5);
        expect(bans[0].rating).toBeGreaterThanOrEqual(bans[1].rating);
        // Already-banned and already-picked champions are never suggested.
        const keys = bans.map((ban: { key: string }) => ban.key);
        expect(keys).not.toContain(championKeys[4]);
        expect(keys).not.toContain(championKeys[0]);
    });
});
