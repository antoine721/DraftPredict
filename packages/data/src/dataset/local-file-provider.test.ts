import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Dataset, Rank, Region } from "@draftpredict/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateFixtureDataset } from "../fixtures/dataset.js";
import { loadStaticData } from "../static/load.js";
import { defaultResolvePaths, LocalFileProvider } from "./local-file-provider.js";
import type { DatasetParams } from "./types.js";
import { DatasetError } from "./types.js";

const staticData = loadStaticData();
const fixture: Dataset = generateFixtureDataset({
    champions: staticData.championList.slice(0, 6),
    seed: 2,
});

const params: DatasetParams = {
    rank: "GOLD" as Rank,
    region: "NA" as Region,
    patch: "16.17",
};

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "draftpredict-local-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function writeDataset(relativePath: string, gzip: boolean): void {
    const path = join(root, relativePath);
    mkdirSync(join(path, ".."), { recursive: true });
    const json = Buffer.from(JSON.stringify(fixture), "utf8");
    writeFileSync(path, gzip ? gzipSync(json) : json);
}

describe("LocalFileProvider", () => {
    it("loads the pipeline layout", async () => {
        writeDataset("patch/16.17/NA/GOLD.json", false);
        const provider = new LocalFileProvider({ root });

        expect(await provider.available()).toBe(true);
        const dataset = await provider.load(params);
        expect(Object.keys(dataset.championData)).toHaveLength(6);
    });

    it("prefers a gzipped file and decompresses it", async () => {
        writeDataset("patch/16.17/NA/GOLD.json.gz", true);
        const dataset = await new LocalFileProvider({ root }).load(params);
        expect(dataset.version).toBe(fixture.version);
    });

    it("falls back to flatter layouts", async () => {
        writeDataset("GOLD.json", false);
        await expect(
            new LocalFileProvider({ root }).load(params),
        ).resolves.toBeDefined();
    });

    it("loads a single pinned file whatever the params say", async () => {
        writeDataset("anything.json", false);
        const provider = new LocalFileProvider({ file: join(root, "anything.json") });

        expect(provider.candidatePaths(params)).toEqual([join(root, "anything.json")]);
        await expect(provider.load(params)).resolves.toBeDefined();
    });

    it("reports a missing dataset as not-found", async () => {
        const error = await new LocalFileProvider({ root })
            .load(params)
            .catch((e: unknown) => e);

        expect(DatasetError.is(error, "not-found")).toBe(true);
    });

    it("reports an unconfigured provider as unavailable", async () => {
        const provider = new LocalFileProvider();
        expect(await provider.available()).toBe(false);
        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "unavailable"),
        );
    });

    it("reports malformed files as invalid-payload", async () => {
        mkdirSync(join(root, "patch/16.17/NA"), { recursive: true });
        writeFileSync(join(root, "patch/16.17/NA/GOLD.json"), "{ not json");

        await expect(new LocalFileProvider({ root }).load(params)).rejects.toSatisfy(
            (error: unknown) => DatasetError.is(error, "invalid-payload"),
        );
    });

    it("searches specific paths before generic ones", () => {
        const paths = defaultResolvePaths(params, "/data");
        expect(paths[0]).toBe("/data/patch/16.17/NA/GOLD.json.gz");
        expect(paths[1]).toBe("/data/patch/16.17/NA/GOLD.json");
        expect(paths[paths.length - 1]).toBe("/data/GOLD.json");
    });
});
