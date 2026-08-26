import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SeenIdSet } from "./seen-ids.js";

describe("SeenIdSet", () => {
    let directory: string;
    let path: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "draftpredict-seen-"));
        path = join(directory, "seen-matches.txt");
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("survives a restart", async () => {
        const first = await SeenIdSet.open(path);
        await first.add("EUW1_1");
        await first.add("EUW1_2");
        await first.close();

        const second = await SeenIdSet.open(path);
        expect(second.size).toBe(2);
        expect(second.has("EUW1_1")).toBe(true);
        expect(second.has("EUW1_3")).toBe(false);

        // A known id is never re-collected.
        expect(await second.add("EUW1_1")).toBe(false);
        expect(await second.add("EUW1_3")).toBe(true);
        await second.close();

        const third = await SeenIdSet.open(path);
        expect(third.toArray().sort()).toEqual(["EUW1_1", "EUW1_2", "EUW1_3"]);
    });

    it("keeps ids that were flushed before a crash", async () => {
        // `flushEvery: 2` stands in for the buffer: two ids reach the disk,
        // the third is still buffered when the process disappears.
        const set = await SeenIdSet.open(path, 2);
        await set.add("A");
        await set.add("B");
        await set.add("C");
        // No close() — simulate a hard kill.

        const reopened = await SeenIdSet.open(path);
        expect(reopened.has("A")).toBe(true);
        expect(reopened.has("B")).toBe(true);
        expect(reopened.has("C")).toBe(false);
    });

    it("stores one id per line", async () => {
        const set = await SeenIdSet.open(path);
        await set.addMany(["A", "B", "A"]);
        await set.flush();
        expect(await readFile(path, "utf8")).toBe("A\nB\n");
        expect(set.size).toBe(2);
    });

    it("starts empty when there is no file", async () => {
        const set = await SeenIdSet.open(join(directory, "nested", "seen.txt"));
        expect(set.size).toBe(0);
        await set.add("A");
        await set.close();
        expect(
            (await SeenIdSet.open(join(directory, "nested", "seen.txt"))).size,
        ).toBe(1);
    });
});
