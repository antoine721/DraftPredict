import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigService } from "../config/service.js";
import { ConfigStore } from "../config/store.js";
import type { TestApp } from "../testing/harness.js";
import { FAKE_API_KEY, createTestApp } from "../testing/harness.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe("GET /api/config", () => {
    it("never returns the Riot API key", async () => {
        harness = await createTestApp({ env: { RIOT_API_KEY: FAKE_API_KEY } });

        const response = await harness.app.inject({ url: "/api/config" });

        expect(response.statusCode).toBe(200);
        expect(response.body).not.toContain(FAKE_API_KEY);

        const config = response.json().config;
        expect(config).not.toHaveProperty("riotApiKey");
        expect(config.hasRiotApiKey).toBe(true);
        expect(config.riotApiKeyPreview).toBe("RGAPI-****4444");
        expect(config.riotApiKeySource).toBe("env");
    });

    it("reports no key when none is configured", async () => {
        harness = await createTestApp();

        const config = (await harness.app.inject({ url: "/api/config" })).json()
            .config;

        expect(config.hasRiotApiKey).toBe(false);
        expect(config.riotApiKeyPreview).toBeNull();
        expect(config.riotApiKeySource).toBeNull();
    });
});

describe("POST /api/config", () => {
    it("rejects a key that is not shaped like a Riot key", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/config",
            payload: { riotApiKey: "not-a-key" },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("RIOT_KEY_INVALID");
    });

    it("persists a valid key 0600 and answers with the preview only", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/config",
            payload: { riotApiKey: FAKE_API_KEY, validateKey: false },
        });

        expect(response.statusCode).toBe(200);
        expect(response.body).not.toContain(FAKE_API_KEY);
        expect(response.json().config.hasRiotApiKey).toBe(true);
        expect(response.json().config.riotApiKeyPreview).toBe("RGAPI-****4444");

        const mode = statSync(harness.config.store.path).mode & 0o777;
        expect(mode).toBe(0o600);

        // Reading it back still keeps the secret server-side.
        const readBack = await harness.app.inject({ url: "/api/config" });
        expect(readBack.body).not.toContain(FAKE_API_KEY);
    });

    it("saves the key even when the live probe cannot reach Riot", async () => {
        const dir = mkdtempSync(join(tmpdir(), "draftpredict-probe-"));
        const config = new ConfigService({
            store: new ConfigStore({ dir }),
            env: {},
            probe: async () => {
                throw new Error("getaddrinfo ENOTFOUND api.riotgames.com");
            },
        });

        const { config: saved, probe } = await config.update({
            riotApiKey: FAKE_API_KEY,
        });

        expect(saved.hasRiotApiKey).toBe(true);
        expect(probe.attempted).toBe(true);
        expect(probe.ok).toBe(false);
        expect(probe.status).toBe("unreachable");

        rmSync(dir, { recursive: true, force: true });
    });

    it("refuses a key Riot explicitly rejects", async () => {
        harness = await createTestApp({
            config: new ConfigService({
                store: new ConfigStore({
                    dir: mkdtempSync(join(tmpdir(), "draftpredict-reject-")),
                }),
                env: {},
                probe: async () => ({
                    attempted: true,
                    ok: false,
                    status: "unauthorized" as const,
                    message: "Riot API: invalid or expired API key",
                }),
            }),
        });

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/config",
            payload: { riotApiKey: FAKE_API_KEY },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("RIOT_KEY_REJECTED");
    });

    it("updates settings and notifies listeners", async () => {
        harness = await createTestApp();
        const listener = vi.fn();
        harness.config.onChange(listener);

        const response = await harness.app.inject({
            method: "POST",
            url: "/api/config",
            payload: { rank: "diamond_plus", riskLevel: "VERY_LOW", minGames: 250 },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().config.rank).toBe("DIAMOND_PLUS");
        expect(response.json().config.riskLevel).toBe("very-low");
        expect(response.json().config.minGames).toBe(250);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});
