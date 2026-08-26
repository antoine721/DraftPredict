import { afterEach, describe, expect, it } from "vitest";
import type { TestApp } from "../testing/harness.js";
import { createTestApp } from "../testing/harness.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

/** Aatrox — present in every Data Dragon snapshot. */
const AATROX = "266";

describe("GET /api/builds/:championKey", () => {
    it("returns items, runes, spells and skills resolved for rendering", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            url: `/api/builds/${AATROX}?role=top`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.champion).toMatchObject({ key: AATROX, name: "Aatrox" });
        expect(body.role).toBe(0);
        expect(body.source.provider).toBe("bundled-fixture");
        expect(body.source.offline).toBe(true);

        expect(body.items.boots.length).toBeGreaterThan(0);
        expect(body.items.byOrder.length).toBeGreaterThan(0);
        expect(body.runes.primary.length).toBeGreaterThan(0);
        expect(body.runes.shards.offense.length).toBeGreaterThan(0);
        expect(body.summonerSpells.length).toBeGreaterThan(0);
        expect(body.skills.order.length).toBeGreaterThan(0);
        expect(body.skills.levels.length).toBe(18);

        const boot = body.items.boots[0];
        expect(boot.name).toEqual(expect.any(String));
        expect(boot.icon).toContain("ddragon.leagueoflegends.com");
        expect(boot.games).toBeGreaterThan(0);
        expect(typeof boot.winrate).toBe("number");
        expect(typeof boot.winrateDelta).toBe("number");
    });

    it("sorts every bucket by rating, best first", async () => {
        harness = await createTestApp();

        const body = (
            await harness.app.inject({ url: `/api/builds/${AATROX}?role=0` })
        ).json();

        for (const bucket of [body.items.boots, body.runes.primary, body.summonerSpells]) {
            const ratings = bucket.map((entry: { rating: number }) => entry.rating);
            expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
        }
    });

    it("rates the build against the enemies given in vs", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            url: `/api/builds/${AATROX}?role=top&vs=64:1,157:2`,
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.matchups).toEqual([
            { championKey: "64", name: "Lee Sin", role: 1 },
            { championKey: "157", name: "Yasuo", role: 2 },
        ]);
        expect(body.items.boots[0].matchups).toHaveLength(2);
        expect(body.items.boots[0].matchups[0].games).toBeGreaterThan(0);
    });

    it("accepts a Data Dragon id and picks the champion's main role", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({ url: "/api/builds/Aatrox" });

        expect(response.statusCode).toBe(200);
        expect(response.json().champion.key).toBe(AATROX);
        expect(response.json().role).toBeGreaterThanOrEqual(0);
    });

    it("404s an unknown champion and 400s an unknown vs entry", async () => {
        harness = await createTestApp();

        const missing = await harness.app.inject({ url: "/api/builds/999999" });
        expect(missing.statusCode).toBe(404);
        expect(missing.json().error.code).toBe("UNKNOWN_CHAMPION");

        const badVs = await harness.app.inject({
            url: `/api/builds/${AATROX}?vs=999999`,
        });
        expect(badVs.statusCode).toBe(400);
        expect(badVs.json().error.code).toBe("UNKNOWN_CHAMPION");
    });

    it("rejects an unknown role name", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            url: `/api/builds/${AATROX}?role=carry`,
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
});
