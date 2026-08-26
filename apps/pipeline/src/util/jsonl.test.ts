import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { JsonlShardWriter, listShardFiles, readJsonlFile, readJsonlFiles } from "./jsonl.js";

async function collect<T>(files: string[]): Promise<T[]> {
    const values: T[] = [];
    for await (const { value } of readJsonlFiles<T>(files)) values.push(value);
    return values;
}

describe("JsonlShardWriter", () => {
    let directory: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "draftpredict-jsonl-"));
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    it("rotates shards and reads them back in order", async () => {
        const writer = new JsonlShardWriter({ dir: directory, maxLines: 3, gzip: false });
        for (let index = 0; index < 7; index += 1) await writer.write({ index });
        await writer.close();

        const files = listShardFiles(directory);
        expect(files.map((file) => file.split("/").pop())).toEqual([
            "matches-000000.jsonl",
            "matches-000001.jsonl",
            "matches-000002.jsonl",
        ]);
        expect(await collect<{ index: number }>(files)).toEqual(
            Array.from({ length: 7 }, (_, index) => ({ index })),
        );
        expect(writer.lines).toBe(7);
    });

    it("gzips shards transparently", async () => {
        const writer = new JsonlShardWriter({ dir: directory, gzip: true });
        await writer.write({ hello: "world" });
        await writer.close();

        const files = listShardFiles(directory);
        expect(files[0].endsWith(".jsonl.gz")).toBe(true);
        expect(await collect(files)).toEqual([{ hello: "world" }]);
    });

    it("appends to the shard a previous run stopped in", async () => {
        const first = new JsonlShardWriter({ dir: directory, gzip: true });
        await first.write({ n: 1 });
        await first.write({ n: 2 });
        await first.close();

        const resumed = new JsonlShardWriter({
            dir: directory,
            gzip: true,
            startIndex: 0,
            startLines: 2,
        });
        await resumed.write({ n: 3 });
        await resumed.close();

        expect(listShardFiles(directory)).toHaveLength(1);
        expect(await collect(listShardFiles(directory))).toEqual([
            { n: 1 },
            { n: 2 },
            { n: 3 },
        ]);
    });

    it("skips a truncated last line instead of failing the run", async () => {
        const writer = new JsonlShardWriter({ dir: directory, gzip: false });
        await writer.write({ n: 1 });
        await writer.close();

        const file = listShardFiles(directory)[0];
        await appendFile(file, '{"n": 2', "utf8"); // killed mid-write

        const errors: string[] = [];
        const values: unknown[] = [];
        for await (const { value } of readJsonlFile(file, {
            onError: (error, context) => errors.push(`${context.line}: ${error.message}`),
        })) {
            values.push(value);
        }

        expect(values).toEqual([{ n: 1 }]);
        expect(errors).toHaveLength(1);
    });

    it("ignores unrelated files in the shard directory", async () => {
        const writer = new JsonlShardWriter({ dir: directory, gzip: false });
        await writer.write({ n: 1 });
        await writer.close();
        await appendFile(join(directory, "state.json"), "{}", "utf8");

        expect(listShardFiles(directory)).toHaveLength(1);
    });
});
