import { gzipSync } from "node:zlib";
import type { Dataset, Rank, Region } from "@draftpredict/core";
import { describe, expect, it, vi } from "vitest";
import { generateFixtureDataset } from "../fixtures/dataset.js";
import { loadStaticData } from "../static/load.js";
import {
    DraftGapRemoteProvider,
    defaultBuildUrl,
    DRAFTGAP_BUCKET_URL,
} from "./draftgap-provider.js";
import type { DatasetFetch } from "./draftgap-provider.js";
import type { DatasetParams } from "./types.js";
import { DatasetError } from "./types.js";

/**
 * bucket.draftgap.com is blocked in the dev container, so every test drives a
 * fake fetch serving a gzipped fixture — which is exactly the payload shape
 * the real bucket returns.
 */

const staticData = loadStaticData();
const fixture: Dataset = generateFixtureDataset({
    champions: staticData.championList.slice(0, 8),
    window: "patch",
    seed: 4,
});
const gzipped = gzipSync(Buffer.from(JSON.stringify(fixture), "utf8"));

const params: DatasetParams = {
    rank: "PLATINUM_PLUS" as Rank,
    region: "EUW" as Region,
};

function respond(body: Buffer, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    };
}

describe("DraftGapRemoteProvider", () => {
    it("builds the documented bucket url", () => {
        expect(defaultBuildUrl(params, DRAFTGAP_BUCKET_URL)).toBe(
            "https://bucket.draftgap.com/datasets/v5/current-patch.json",
        );
        expect(
            defaultBuildUrl({ ...params, window: "full" }, DRAFTGAP_BUCKET_URL),
        ).toBe("https://bucket.draftgap.com/datasets/v5/30-days.json");
        // The bucket publishes one combined dataset: rank, region and patch
        // are accepted but cannot change what is served.
        expect(
            defaultBuildUrl(
                { ...params, patch: "16.17", rank: "IRON", region: "KR" },
                DRAFTGAP_BUCKET_URL,
            ),
        ).toBe("https://bucket.draftgap.com/datasets/v5/current-patch.json");
    });

    it("downloads, gunzips and validates a dataset", async () => {
        const fetchImpl = vi.fn<DatasetFetch>(async () => respond(gzipped));
        const provider = new DraftGapRemoteProvider({ fetch: fetchImpl });

        const dataset = await provider.load(params);

        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(fetchImpl.mock.calls[0][0]).toBe(provider.urlFor(params));
        expect(Object.keys(dataset.championData)).toHaveLength(8);
        expect(dataset.version).toBe(fixture.version);
    });

    it("accepts an uncompressed payload too", async () => {
        const provider = new DraftGapRemoteProvider({
            fetch: async () => respond(Buffer.from(JSON.stringify(fixture), "utf8")),
        });
        await expect(provider.load(params)).resolves.toMatchObject({
            version: fixture.version,
        });
    });

    it("reports a 404 as not-found", async () => {
        const provider = new DraftGapRemoteProvider({
            fetch: async () => respond(Buffer.alloc(0), 404),
        });
        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "not-found"),
        );
    });

    it("reports other HTTP failures as network errors", async () => {
        const provider = new DraftGapRemoteProvider({
            fetch: async () => respond(Buffer.alloc(0), 503),
        });
        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "network"),
        );
    });

    it("wraps transport failures as network errors, never raw throws", async () => {
        const provider = new DraftGapRemoteProvider({
            fetch: async () => {
                throw new Error("blocked by egress policy");
            },
        });

        const error = await provider.load(params).catch((e: unknown) => e);
        expect(DatasetError.is(error, "network")).toBe(true);
        expect((error as DatasetError).provider).toBe("draftgap-remote");
        expect((error as DatasetError).message).toContain("blocked by egress policy");
    });

    it("times out", async () => {
        const provider = new DraftGapRemoteProvider({
            timeoutMs: 10,
            fetch: (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        const error = new Error("aborted");
                        error.name = "AbortError";
                        reject(error);
                    });
                }),
        });

        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "timeout"),
        );
    });

    it("honours an external abort signal", async () => {
        const controller = new AbortController();
        const provider = new DraftGapRemoteProvider({
            fetch: (_url, init) =>
                new Promise((_resolve, reject) => {
                    init?.signal?.addEventListener("abort", () => {
                        const error = new Error("aborted");
                        error.name = "AbortError";
                        reject(error);
                    });
                }),
        });

        const promise = provider.load({ ...params, signal: controller.signal });
        controller.abort();

        await expect(promise).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "aborted"),
        );
    });

    it("rejects an already-aborted request without fetching", async () => {
        const fetchImpl = vi.fn<DatasetFetch>(async () => respond(gzipped));
        const controller = new AbortController();
        controller.abort();

        await expect(
            new DraftGapRemoteProvider({ fetch: fetchImpl }).load({
                ...params,
                signal: controller.signal,
            }),
        ).rejects.toSatisfy((error: unknown) => DatasetError.is(error, "aborted"));
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects payloads that are not a dataset", async () => {
        const provider = new DraftGapRemoteProvider({
            fetch: async () =>
                respond(gzipSync(Buffer.from(JSON.stringify({ nope: true })))),
        });
        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "invalid-payload"),
        );
    });

    it("rejects corrupt gzip", async () => {
        const corrupt = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03]);
        const provider = new DraftGapRemoteProvider({
            fetch: async () => respond(corrupt),
        });

        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "invalid-payload"),
        );
    });

    it("refuses payloads over the size limit", async () => {
        const provider = new DraftGapRemoteProvider({
            maxBytes: 8,
            fetch: async () => respond(gzipped),
        });
        await expect(provider.load(params)).rejects.toSatisfy((error: unknown) =>
            DatasetError.is(error, "invalid-payload"),
        );
    });
});
