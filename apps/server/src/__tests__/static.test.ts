import { afterEach, describe, expect, it } from "vitest";
import type { TestApp } from "../testing/harness.js";
import { createTestApp } from "../testing/harness.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe("static data routes", () => {
    it("serves a compact champion summary with icons", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({ url: "/api/static/summary" });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.counts.champions).toBe(body.champions.length);

        const champion = body.champions[0];
        expect(Object.keys(champion).sort()).toEqual([
            "icon",
            "id",
            "key",
            "name",
            "tags",
            "title",
        ]);
        expect(champion.icon).toContain("ddragon.leagueoflegends.com");
    });

    it("sets a strong ETag and answers 304 when the client already has it", async () => {
        harness = await createTestApp();

        const first = await harness.app.inject({ url: "/api/static/summary" });
        const etag = first.headers.etag;

        expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/);
        expect(first.headers["cache-control"]).toContain("max-age=");

        const second = await harness.app.inject({
            url: "/api/static/summary",
            headers: { "if-none-match": String(etag) },
        });

        expect(second.statusCode).toBe(304);
        expect(second.body).toBe("");
    });

    it("exposes items, runes and summoner spells", async () => {
        harness = await createTestApp();

        const items = await harness.app.inject({ url: "/api/static/items" });
        const runes = await harness.app.inject({ url: "/api/static/runes" });
        const spells = await harness.app.inject({ url: "/api/static/summoner-spells" });

        expect(items.json().items.length).toBeGreaterThan(50);
        expect(runes.json().paths.length).toBeGreaterThan(3);
        expect(runes.json().shardRows).toHaveLength(3);
        expect(spells.json().summonerSpells.length).toBeGreaterThan(5);
    });

    it("searches champions by fuzzy name", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            url: "/api/static/search?q=mf&limit=3",
        });

        expect(response.statusCode).toBe(200);
        const results = response.json().results;
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe("Miss Fortune");
    });
});
