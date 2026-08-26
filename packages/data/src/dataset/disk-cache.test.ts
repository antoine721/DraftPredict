import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiskCache } from "./disk-cache.js";

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "draftpredict-disk-"));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function clock(start = 5_000) {
    let now = start;
    return { now: () => now, advance: (ms: number) => (now += ms) };
}

describe("DiskCache", () => {
    it("round-trips a value", () => {
        const cache = new DiskCache({ dir });
        cache.write("patch_GOLD_EUW", { hello: "world" });

        expect(cache.read<{ hello: string }>("patch_GOLD_EUW")?.value).toEqual({
            hello: "world",
        });
        expect(cache.sizeBytes()).toBeGreaterThan(0);
    });

    it("round-trips asynchronously too", async () => {
        const cache = new DiskCache({ dir });
        await cache.writeAsync("k", [1, 2, 3]);

        expect((await cache.readAsync<number[]>("k"))?.value).toEqual([1, 2, 3]);
        expect(cache.read<number[]>("k")?.value).toEqual([1, 2, 3]);
    });

    it("expires entries but can still return them as stale", async () => {
        const time = clock();
        const cache = new DiskCache({ dir, ttlMs: 100, now: time.now });
        cache.write("k", "v");

        time.advance(101);
        expect(cache.read("k")).toBeUndefined();
        expect(cache.read("k", { allowStale: true })?.value).toBe("v");
        expect((await cache.readAsync("k", { allowStale: true }))?.value).toBe("v");
    });

    it("keeps cache keys safe as file names", () => {
        const cache = new DiskCache({ dir });
        expect(cache.pathFor("full/../etc/passwd")).toBe(
            join(dir, "full-..-etc-passwd.json"),
        );
    });

    it("drops an entry it cannot parse", () => {
        const cache = new DiskCache({ dir });
        cache.write("k", "v");
        writeFileSync(cache.pathFor("k"), "{{{");

        expect(cache.read("k")).toBeUndefined();
        expect(existsSync(cache.pathFor("k"))).toBe(false);
    });

    it("returns undefined for a missing entry", () => {
        expect(new DiskCache({ dir }).read("nope")).toBeUndefined();
    });

    it("deletes and clears", () => {
        const cache = new DiskCache({ dir });
        cache.write("a", 1);
        cache.write("b", 2);

        cache.delete("a");
        expect(cache.read("a")).toBeUndefined();

        cache.clear();
        expect(readdirSync(dir).filter((n) => n.endsWith(".json"))).toEqual([]);
    });

    it("never throws when the directory cannot be written", async () => {
        // A regular file where the cache expects a directory: writes fail with
        // ENOTDIR, which is the closest portable stand-in for a read-only home.
        const blocked = join(dir, "not-a-directory");
        writeFileSync(blocked, "");

        const warn = vi.fn();
        const cache = new DiskCache({
            dir: blocked,
            logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() },
        });

        expect(() => cache.write("k", "v")).not.toThrow();
        await expect(cache.writeAsync("k", "v")).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalled();
        expect(cache.read("k")).toBeUndefined();
        expect(cache.sizeBytes()).toBe(0);
    });
});
