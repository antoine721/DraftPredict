import { afterEach, describe, expect, it } from "vitest";
import type { TestApp } from "../testing/harness.js";
import { createTestApp } from "../testing/harness.js";
import { FakeLcuWatcher, champSelectState } from "../testing/fake-watcher.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe("LCU REST routes", () => {
    it("reports a disabled integration without a watcher", async () => {
        harness = await createTestApp();

        const status = await harness.app.inject({ url: "/api/lcu/status" });

        expect(status.statusCode).toBe(200);
        expect(status.json()).toMatchObject({
            enabled: false,
            connected: false,
            inChampSelect: false,
            summoner: null,
        });

        const champSelect = await harness.app.inject({ url: "/api/lcu/champ-select" });
        expect(champSelect.json().inChampSelect).toBe(false);
        expect(champSelect.json().state).toBeNull();
        // The payload keeps the same keys in and out of champ select, so
        // clients can type updatedAt as always present.
        expect(champSelect.json()).toHaveProperty("updatedAt", null);
        expect(champSelect.json()).toHaveProperty("analysis", null);
        expect(champSelect.json()).toHaveProperty("suggestions", null);

        const summoner = await harness.app.inject({ url: "/api/lcu/summoner" });
        expect(summoner.statusCode).toBe(404);
        expect(summoner.json().error.code).toBe("LCU_NO_SUMMONER");
    });

    it("resolves the logged-in account without a Riot API key", async () => {
        const watcher = new FakeLcuWatcher();
        harness = await createTestApp({
            lcuWatcher: watcher.asWatcher(),
            startLcu: true,
        });

        // Not connected yet: the UI needs a clear "no account detected".
        const before = await harness.app.inject({ url: "/api/account/me" });
        expect(before.statusCode).toBe(404);
        expect(before.json().error.code).toBe("LCU_NO_SUMMONER");

        watcher.connect({
            puuid: "puuid-me",
            gameName: "Moi",
            tagLine: "EUW",
            summonerLevel: 340,
        });

        const me = await harness.app.inject({ url: "/api/account/me" });
        expect(me.statusCode).toBe(200);
        expect(me.json()).toMatchObject({
            puuid: "puuid-me",
            gameName: "Moi",
            tagLine: "EUW",
            summonerLevel: 340,
            source: "lcu",
        });
        // No key was configured, yet this answered: that is the whole point.
        const config = await harness.app.inject({ url: "/api/config" });
        expect(config.json().config.hasRiotApiKey).toBe(false);
    });

    it("says so plainly when the client integration is disabled", async () => {
        harness = await createTestApp();

        const me = await harness.app.inject({ url: "/api/account/me" });

        expect(me.statusCode).toBe(409);
        expect(me.json().error.code).toBe("LCU_DISABLED");
    });

    it("exposes the connected summoner and the live champ select", async () => {
        const watcher = new FakeLcuWatcher();
        harness = await createTestApp({
            lcuWatcher: watcher.asWatcher(),
            startLcu: true,
            lcuDebounceMs: 5,
        });

        watcher.connect({
            puuid: "puuid-1",
            gameName: "Moi",
            tagLine: "EUW",
            summonerLevel: 340,
        });

        const status = await harness.app.inject({ url: "/api/lcu/status" });
        expect(status.json()).toMatchObject({
            enabled: true,
            connected: true,
            summoner: { puuid: "puuid-1", gameName: "Moi", tagLine: "EUW" },
        });

        const summoner = await harness.app.inject({ url: "/api/lcu/summoner" });
        expect(summoner.statusCode).toBe(200);
        expect(summoner.json().puuid).toBe("puuid-1");

        watcher.pushChampSelect(champSelectState({ ally: [[0, "266"]], opponent: [] }));
        await waitForChampSelect(harness);

        const champSelect = await harness.app.inject({ url: "/api/lcu/champ-select" });
        expect(champSelect.json().inChampSelect).toBe(true);
        expect(champSelect.json().state.ally).toEqual([[0, "266"]]);
        expect(champSelect.json().analysis.result.winrate).toBeGreaterThan(0);

        watcher.endChampSelect();
        const after = await harness.app.inject({ url: "/api/lcu/champ-select" });
        expect(after.json().inChampSelect).toBe(false);
    });
});

async function waitForChampSelect(harness: TestApp): Promise<void> {
    const deadline = Date.now() + 5000;
    while (harness.app.ctx.lcu.getCurrent() === null) {
        if (Date.now() > deadline) throw new Error("champ select never arrived");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}
