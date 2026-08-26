import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Dataset, Rank, Region } from "@draftpredict/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFixtureDataset } from "../fixtures/dataset.js";
import { loadStaticData } from "../static/load.js";
import { createDatasetService } from "./factory.js";
import { BundledFixtureProvider } from "./fixture-provider.js";
import { DatasetService } from "./service.js";
import type { DatasetEntry } from "./service.js";
import type { DatasetParams, DatasetProvider } from "./types.js";
import { DatasetError, datasetCacheKey, NoProviderAvailableError } from "./types.js";

const staticData = loadStaticData();
const champions = staticData.championList.slice(0, 6);

const params: DatasetParams = {
    rank: "PLATINUM_PLUS" as Rank,
    region: "EUW" as Region,
};

function fixture(seed: number): Dataset {
    return generateFixtureDataset({ champions, seed, window: "patch" });
}

/** A provider whose behaviour each test dictates. */
function stubProvider(
    name: string,
    load: (params: DatasetParams) => Promise<Dataset>,
    available = true,
): DatasetProvider & { calls: DatasetParams[] } {
    const calls: DatasetParams[] = [];
    return {
        name,
        calls,
        describe: () => `stub ${name}`,
        available: async () => available,
        load: async (p) => {
            calls.push(p);
            return load(p);
        },
    };
}

function failing(name: string, code: "network" | "not-found" = "network") {
    return stubProvider(name, async () => {
        throw new DatasetError(code, `${name} is down`, { provider: name });
    });
}

function clock(start = 1_000_000) {
    let now = start;
    return { now: () => now, advance: (ms: number) => (now += ms) };
}

let cacheDir: string;

beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "draftpredict-cache-"));
});

afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
});

describe("DatasetService provider chain", () => {
    it("uses the first provider that succeeds", async () => {
        const first = failing("first");
        const second = stubProvider("second", async () => fixture(1));
        const third = stubProvider("third", async () => fixture(2));

        const service = new DatasetService({
            providers: [first, second, third],
            persist: false,
        });

        const entry = await service.getEntry(params);

        expect(entry.provider).toBe("second");
        expect(entry.source).toBe("provider");
        expect(third.calls).toHaveLength(0);
    });

    it("skips providers that report themselves unavailable", async () => {
        const offline = stubProvider("offline", async () => fixture(1), false);
        const fallback = stubProvider("fallback", async () => fixture(2));

        const service = new DatasetService({
            providers: [offline, fallback],
            persist: false,
        });

        expect((await service.getEntry(params)).provider).toBe("fallback");
        expect(offline.calls).toHaveLength(0);
    });

    it("throws NoProviderAvailableError listing every failure", async () => {
        const service = new DatasetService({
            providers: [failing("a"), failing("b", "not-found")],
            persist: false,
            allowStale: false,
        });

        const error = await service.get(params).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(NoProviderAvailableError);
        expect(
            (error as NoProviderAvailableError).failures.map((f) => f.provider),
        ).toEqual(["a", "b"]);
        expect((error as NoProviderAvailableError).message).toContain("a, b");
    });

    it("emits an error event per failing provider but still resolves", async () => {
        const errors: string[] = [];
        const service = new DatasetService({
            providers: [failing("a"), stubProvider("b", async () => fixture(1))],
            persist: false,
        });
        service.on("error", (event) => errors.push(event.provider));

        await service.get(params);
        expect(errors).toEqual(["a"]);
    });

    it("ends in a fixture provider that cannot fail", async () => {
        const service = createDatasetService({
            remote: false,
            persist: false,
            fixtureOptions: { generatorOptions: { champions } },
        });

        expect(service.describeProviders()).toHaveLength(1);
        const dataset = await service.get(params);
        expect(Object.keys(dataset.championData)).toHaveLength(champions.length);
    });
});

describe("DatasetService caching", () => {
    it("serves repeat requests from memory without touching the provider", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], persist: false });

        const first = await service.getEntry(params);
        const second = await service.getEntry(params);

        expect(provider.calls).toHaveLength(1);
        expect(second.source).toBe("memory");
        expect(second.dataset).toBe(first.dataset);
    });

    it("reloads once the ttl expires", async () => {
        const time = clock();
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({
            providers: [provider],
            persist: false,
            ttlMs: 1000,
            now: time.now,
        });

        await service.get(params);
        time.advance(999);
        await service.get(params);
        expect(provider.calls).toHaveLength(1);

        time.advance(2);
        await service.get(params);
        expect(provider.calls).toHaveLength(2);
    });

    it("persists to disk and reads back from there after a restart", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], cacheDir });

        await service.get(params);
        expect(existsSync(join(cacheDir, `${datasetCacheKey(params)}.json`))).toBe(
            true,
        );

        // A fresh service shares the cache directory but not the memory tier.
        const restarted = new DatasetService({ providers: [provider], cacheDir });
        const entry = await restarted.getEntry(params);

        expect(entry.source).toBe("disk");
        expect(entry.provider).toBe("disk-cache");
        expect(provider.calls).toHaveLength(1);
    });

    it("survives a corrupt disk cache entry", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], cacheDir });
        await service.get(params);

        const { writeFileSync } = await import("node:fs");
        writeFileSync(join(cacheDir, `${datasetCacheKey(params)}.json`), "{ broken");

        const restarted = new DatasetService({ providers: [provider], cacheDir });
        expect((await restarted.getEntry(params)).source).toBe("provider");
    });

    it("serves a stale copy when every provider goes down", async () => {
        const time = clock();
        let healthy = true;
        const provider = stubProvider("p", async () => {
            if (!healthy) throw new DatasetError("network", "offline");
            return fixture(1);
        });

        const stale: DatasetEntry[] = [];
        const service = new DatasetService({
            providers: [provider],
            persist: false,
            ttlMs: 100,
            now: time.now,
        });
        service.on("stale", (entry) => stale.push(entry));

        await service.get(params);
        healthy = false;
        time.advance(500);

        const entry = await service.getEntry(params);
        expect(entry.source).toBe("stale");
        expect(stale).toHaveLength(1);
    });

    it("refresh bypasses both cache tiers", async () => {
        let seed = 1;
        const provider = stubProvider("p", async () => fixture(seed));
        const service = new DatasetService({ providers: [provider], cacheDir });

        await service.get(params);
        seed = 2;
        await service.get(params);
        expect(provider.calls).toHaveLength(1);

        await service.refresh(params);
        expect(provider.calls).toHaveLength(2);
        // And the refreshed copy is what the next read gets.
        expect((await service.getEntry(params)).source).toBe("memory");
    });

    it("invalidate and clear drop cached entries", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], cacheDir });

        await service.get(params);
        service.invalidate(params);
        expect(service.memoryKeys()).toEqual([]);
        expect(existsSync(join(cacheDir, `${datasetCacheKey(params)}.json`))).toBe(
            false,
        );

        await service.get(params);
        service.clear();
        expect(service.memoryKeys()).toEqual([]);
        expect(provider.calls).toHaveLength(2);
    });
});

describe("DatasetService single-flight", () => {
    it("collapses concurrent loads of the same dataset into one", async () => {
        let resolveLoad: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => (resolveLoad = resolve));
        const provider = stubProvider("p", async () => {
            await gate;
            return fixture(1);
        });

        const service = new DatasetService({ providers: [provider], persist: false });

        const requests = [
            service.get(params),
            service.get(params),
            service.get(params),
        ];
        expect(service.pendingCount).toBe(1);

        resolveLoad!();
        const datasets = await Promise.all(requests);

        expect(provider.calls).toHaveLength(1);
        expect(datasets[0]).toBe(datasets[1]);
        expect(datasets[1]).toBe(datasets[2]);
        expect(service.pendingCount).toBe(0);
    });

    it("does not collapse different params", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], persist: false });

        await Promise.all([
            service.get(params),
            service.get({ ...params, rank: "IRON" as Rank }),
            service.get({ ...params, window: "full" }),
        ]);

        expect(provider.calls).toHaveLength(3);
        expect(service.memoryKeys()).toHaveLength(3);
    });

    it("retries after a failed load rather than caching the failure", async () => {
        let attempts = 0;
        const provider = stubProvider("p", async () => {
            attempts += 1;
            if (attempts === 1) throw new DatasetError("network", "flaky");
            return fixture(1);
        });
        const service = new DatasetService({
            providers: [provider],
            persist: false,
            allowStale: false,
        });

        await expect(service.get(params)).rejects.toBeInstanceOf(
            NoProviderAvailableError,
        );
        await expect(service.get(params)).resolves.toBeDefined();
    });
});

describe("DatasetService events and pairs", () => {
    it("emits updated only when a provider actually produced data", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], persist: false });

        const updated = vi.fn();
        const loaded = vi.fn();
        service.on("updated", updated);
        service.on("loaded", loaded);

        await service.get(params);
        await service.get(params); // memory hit

        expect(updated).toHaveBeenCalledOnce();
        expect(loaded).toHaveBeenCalledTimes(2);
        expect(updated.mock.calls[0][0]).toMatchObject({
            provider: "p",
            source: "provider",
        });
    });

    it("keeps running when a listener throws", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], persist: false });

        service.on("loaded", () => {
            throw new Error("listener exploded");
        });
        const second = vi.fn();
        service.on("loaded", second);

        await expect(service.get(params)).resolves.toBeDefined();
        expect(second).toHaveBeenCalledOnce();
    });

    it("unsubscribes", async () => {
        const provider = stubProvider("p", async () => fixture(1));
        const service = new DatasetService({ providers: [provider], persist: false });

        const listener = vi.fn();
        const off = service.on("loaded", listener);
        off();

        await service.get(params);
        expect(listener).not.toHaveBeenCalled();
    });

    it("loads the patch and 30-day pair analyzeDraft needs", async () => {
        const provider = new BundledFixtureProvider({
            generatorOptions: { champions },
        });
        const service = new DatasetService({ providers: [provider], persist: false });

        const { dataset, fullDataset } = await service.getPair(params);

        expect(dataset).not.toBe(fullDataset);
        expect(service.memoryKeys().sort()).toEqual([
            "full_PLATINUM_PLUS_EUW_latest",
            "patch_PLATINUM_PLUS_EUW_latest",
        ]);
        // Only the 30-day dataset carries matchup samples.
        const first = Object.values(fullDataset.championData)[0];
        expect(Object.keys(first.statsByRole[0].matchup[0]).length).toBeGreaterThan(0);
    });
});

describe("BundledFixtureProvider", () => {
    it("is always available and deterministic per params", async () => {
        const provider = new BundledFixtureProvider({
            generatorOptions: { champions },
        });

        expect(await provider.available()).toBe(true);
        const a = await provider.load(params);
        const b = await provider.load({ ...params });
        expect(a).toBe(b); // memoized

        const other = new BundledFixtureProvider({
            generatorOptions: { champions },
        });
        expect(JSON.stringify(await other.load(params))).toBe(JSON.stringify(a));
    });

    it("gives different ranks different numbers", async () => {
        const provider = new BundledFixtureProvider({
            generatorOptions: { champions },
        });

        const platinum = await provider.load(params);
        const iron = await provider.load({ ...params, rank: "IRON" as Rank });

        expect(JSON.stringify(platinum)).not.toBe(JSON.stringify(iron));
    });
});
