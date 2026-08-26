import { afterEach, describe, expect, it } from "vitest";
import type { TestApp } from "../testing/harness.js";
import { createTestApp } from "../testing/harness.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe("GET /api/health", () => {
    it("reports the dataset provider, static data version, LCU and Riot key state", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({ url: "/api/health" });

        expect(response.statusCode).toBe(200);
        const body = response.json();

        expect(body.status).toBe("ok");
        expect(body.staticData.version).toMatch(/^\d+\.\d+/);
        expect(body.staticData.source).toBe("bundled");
        expect(body.staticData.champions).toBeGreaterThan(100);

        expect(body.dataset.available).toBe(true);
        expect(body.dataset.provider).toBe("bundled-fixture");
        // The offline fixture must never be presented as live data.
        expect(body.dataset.offline).toBe(true);
        expect(body.dataset.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.dataset.providers).toEqual([
            expect.stringContaining("bundled-fixture"),
        ]);

        expect(body.lcu.enabled).toBe(false);
        expect(body.lcu.connected).toBe(false);
        expect(body.riot.configured).toBe(false);
        expect(body.riot.platform).toBe("euw1");
        expect(body.web.served).toBe(false);
    });

    it("says a Riot key is configured without ever echoing it", async () => {
        harness = await createTestApp({
            env: { RIOT_API_KEY: "RGAPI-secret-key-value-0000-1111-2222" },
        });

        const response = await harness.app.inject({ url: "/api/health" });

        expect(response.json().riot.configured).toBe(true);
        expect(response.body).not.toContain("RGAPI-secret");
    });

    it("answers a typed 404 envelope for unknown API routes", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({ url: "/api/nope" });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe("NOT_FOUND");
    });
});
