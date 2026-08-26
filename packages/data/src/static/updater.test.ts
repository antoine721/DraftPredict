import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStaticDataCache, loadStaticData, SNAPSHOT_FILES } from "./load.js";
import { getBundledDDragonRoot } from "../util/paths.js";
import { StaticDataUpdater } from "./updater.js";
import type { StaticDataFetch } from "./updater.js";

/**
 * The dev container blocks ddragon.leagueoflegends.com outright, so every test
 * here drives a fake fetch. That is not a workaround — it is the contract: the
 * updater must never be the reason the app fails.
 */

const bundleDir = join(getBundledDDragonRoot(), "16.17.1");

function bundledFile(name: string): string {
    return readFileSync(join(bundleDir, name), "utf8");
}

function okResponse(body: string) {
    return { ok: true, status: 200, text: async () => body };
}

/** Serves the bundled snapshot back under whatever version is requested. */
function createFakeDDragon(versions: string[]): {
    fetch: StaticDataFetch;
    calls: string[];
} {
    const calls: string[] = [];
    const fetchImpl: StaticDataFetch = async (url) => {
        calls.push(url);
        if (url.endsWith("/api/versions.json")) {
            return okResponse(JSON.stringify(versions));
        }
        for (const name of [
            SNAPSHOT_FILES.champions,
            SNAPSHOT_FILES.items,
            SNAPSHOT_FILES.runes,
            SNAPSHOT_FILES.summonerSpells,
        ]) {
            if (url.endsWith(`/${name}`)) return okResponse(bundledFile(name));
        }
        return {
            ok: false,
            status: 404,
            statusText: "Not Found",
            text: async () => "",
        };
    };
    return { fetch: fetchImpl, calls };
}

let cacheDir: string;

beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "draftpredict-static-"));
    clearStaticDataCache();
});

afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
    clearStaticDataCache();
});

describe("StaticDataUpdater", () => {
    it("downloads a newer patch and makes it the one that loads", async () => {
        const { fetch, calls } = createFakeDDragon(["99.1.1", "16.17.1"]);
        const updater = new StaticDataUpdater({ cacheDir, fetch });

        const result = await updater.update();

        expect(result.status).toBe("updated");
        expect(result).toMatchObject({ version: "99.1.1" });
        expect(calls).toHaveLength(5); // versions.json + 4 data files
        expect(updater.listCachedVersions()).toEqual(["99.1.1"]);
        expect(existsSync(join(cacheDir, "99.1.1", SNAPSHOT_FILES.meta))).toBe(true);

        const staticData = loadStaticData({ cacheDir });
        expect(staticData.version).toBe("99.1.1");
        expect(staticData.source).toBe("cache");
        expect(staticData.championsById.get("Zed")?.key).toBe("238");
        // The CDN urls follow the patch that was loaded.
        expect(staticData.imageUrl.championSquare("Zed")).toContain("/cdn/99.1.1/");
    });

    it("does nothing when the bundled snapshot is already current", async () => {
        const { fetch, calls } = createFakeDDragon(["16.17.1"]);
        const updater = new StaticDataUpdater({ cacheDir, fetch });

        expect(await updater.update()).toEqual({
            status: "up-to-date",
            version: "16.17.1",
        });
        expect(calls).toEqual([
            "https://ddragon.leagueoflegends.com/api/versions.json",
        ]);
    });

    it("falls back to the bundle when the host is unreachable", async () => {
        const blocked: StaticDataFetch = async () => {
            throw new Error("getaddrinfo EAI_AGAIN ddragon.leagueoflegends.com");
        };
        const warn = vi.fn();
        const updater = new StaticDataUpdater({
            cacheDir,
            fetch: blocked,
            logger: {
                debug: vi.fn(),
                info: vi.fn(),
                warn,
                error: vi.fn(),
            },
        });

        const result = await updater.update();

        expect(result.status).toBe("failed");
        expect(result).toMatchObject({ reason: "no-version" });
        expect(warn).toHaveBeenCalled();
        expect(loadStaticData({ cacheDir }).version).toBe("16.17.1");
    });

    it("leaves no half-written snapshot behind when a file fails midway", async () => {
        let served = 0;
        const flaky: StaticDataFetch = async (url) => {
            if (url.endsWith("/api/versions.json")) {
                return okResponse(JSON.stringify(["99.2.0"]));
            }
            served += 1;
            if (served > 1) throw new Error("connection reset");
            return okResponse(bundledFile(SNAPSHOT_FILES.champions));
        };

        const updater = new StaticDataUpdater({ cacheDir, fetch: flaky });
        const result = await updater.update();

        expect(result.status).toBe("failed");
        expect(existsSync(join(cacheDir, "99.2.0"))).toBe(false);
        expect(updater.listCachedVersions()).toEqual([]);
        expect(loadStaticData({ cacheDir }).version).toBe("16.17.1");
    });

    it("reports a bad HTTP status as a failure rather than throwing", async () => {
        const notFound: StaticDataFetch = async (url) =>
            url.endsWith("/api/versions.json")
                ? okResponse(JSON.stringify(["99.3.0"]))
                : {
                      ok: false,
                      status: 403,
                      statusText: "Forbidden",
                      text: async () => "",
                  };

        const result = await new StaticDataUpdater({
            cacheDir,
            fetch: notFound,
        }).update();
        expect(result).toMatchObject({ status: "failed", reason: "download-failed" });
    });

    it("shares one download between concurrent callers", async () => {
        const { fetch, calls } = createFakeDDragon(["99.4.0"]);
        const updater = new StaticDataUpdater({ cacheDir, fetch });

        const [a, b] = await Promise.all([updater.update(), updater.update()]);

        expect(a).toBe(b);
        expect(calls).toHaveLength(5);
    });

    it("prunes old downloads", async () => {
        const first = createFakeDDragon(["99.5.0"]);
        await new StaticDataUpdater({
            cacheDir,
            fetch: first.fetch,
            keepVersions: 1,
        }).update();

        const second = createFakeDDragon(["99.6.0"]);
        await new StaticDataUpdater({
            cacheDir,
            fetch: second.fetch,
            keepVersions: 1,
        }).update();

        expect(
            new StaticDataUpdater({
                cacheDir,
                fetch: second.fetch,
            }).listCachedVersions(),
        ).toEqual(["99.6.0"]);
    });

    it("loads the freshest data available in one call", async () => {
        const { fetch } = createFakeDDragon(["99.7.0"]);
        const updater = new StaticDataUpdater({ cacheDir, fetch });

        const { staticData, update } = await updater.updateAndLoad();

        expect(update.status).toBe("updated");
        expect(staticData.version).toBe("99.7.0");
    });
});
