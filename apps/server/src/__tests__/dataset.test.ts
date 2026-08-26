import { afterEach, describe, expect, it } from "vitest";
import type { Dataset } from "@draftpredict/core";
import type { DatasetParams, DatasetProvider } from "@draftpredict/data";
import {
    BundledFixtureProvider,
    DatasetError,
    DatasetService,
    generateFixtureDataset,
} from "@draftpredict/data";
import type { TestApp } from "../testing/harness.js";
import { createTestApp, testStaticData } from "../testing/harness.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

/** A provider that always fails — the dev container's blocked bucket, in a class. */
class UnreachableProvider implements DatasetProvider {
    readonly name = "draftgap-remote";
    describe(): string {
        return "https://bucket.draftgap.com/datasets/v5 (unreachable)";
    }
    async available(): Promise<boolean> {
        return true;
    }
    async load(): Promise<Dataset> {
        throw new DatasetError("network", "bucket.draftgap.com is unreachable", {
            provider: this.name,
        });
    }
}

/** A provider standing in for datasets built by apps/pipeline. */
class LocalProvider implements DatasetProvider {
    readonly name = "local-file";
    describe(): string {
        return "/datasets (local)";
    }
    async available(): Promise<boolean> {
        return true;
    }
    async load(params: DatasetParams): Promise<Dataset> {
        return {
            ...generateFixtureDataset({
                window: params.window ?? "patch",
                staticData: testStaticData(),
            }),
            date: "2026-08-01",
        };
    }
}

describe("GET /api/dataset", () => {
    it("names the provider that actually served the data", async () => {
        harness = await createTestApp({
            datasetService: new DatasetService({
                providers: [new LocalProvider()],
                persist: false,
            }),
        });

        const response = await harness.app.inject({ url: "/api/dataset" });

        expect(response.statusCode).toBe(200);
        const meta = response.json().meta;
        expect(meta.provider).toBe("local-file");
        expect(meta.date).toBe("2026-08-01");
        // Real data: the UI must not label it as a demo.
        expect(meta.offline).toBe(false);
    });

    it("falls back to the bundled fixture and admits it is offline data", async () => {
        harness = await createTestApp({
            datasetService: new DatasetService({
                providers: [
                    new UnreachableProvider(),
                    new BundledFixtureProvider({ staticData: testStaticData() }),
                ],
                persist: false,
            }),
        });

        const response = await harness.app.inject({ url: "/api/dataset" });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.meta.provider).toBe("bundled-fixture");
        expect(body.meta.offline).toBe(true);
        expect(body.providers[0]).toContain("draftgap-remote");
        expect(body.providers[1]).toContain("bundled-fixture");
    });

    it("returns a 503 envelope when no provider can serve the request", async () => {
        harness = await createTestApp({
            datasetService: new DatasetService({
                providers: [new UnreachableProvider()],
                persist: false,
            }),
        });

        const response = await harness.app.inject({ url: "/api/dataset" });

        expect(response.statusCode).toBe(503);
        expect(response.json().error.code).toBe("DATASET_UNAVAILABLE");
    });

    it("omits the payload unless include=full is asked for", async () => {
        harness = await createTestApp();

        const meta = await harness.app.inject({ url: "/api/dataset" });
        expect(meta.json().dataset).toBeUndefined();

        const full = await harness.app.inject({ url: "/api/dataset?include=full" });
        expect(Object.keys(full.json().dataset.championData).length).toBeGreaterThan(
            100,
        );
    });

    it("rejects an unknown rank", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({ url: "/api/dataset?rank=WOOD" });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });
});
