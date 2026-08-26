import { dirname, join } from "node:path";

import type { Dataset, Rank, Region } from "@draftpredict/core";

import { datasetOutputPath, writeJsonFile } from "../util/fs.js";
import type { BuildDatasetFile } from "./build-accumulator.js";
import type { AggregateCounters } from "./types.js";

/**
 * Sidecar written next to every dataset.
 *
 * A DraftGap v5 `Dataset` has room for a version and a date and nothing else,
 * and it must stay byte-compatible — so provenance (which shards, which
 * queues, how many matches, what was pruned) lives in its own file, which the
 * server and `verify` can read without parsing 50 MB of JSON.
 */
export type DatasetMeta = {
    generator: string;
    generatedAt: string;
    window: string;
    patch: string;
    rank: Rank;
    region: Region;
    date: string;
    matches: number;
    champions: number;
    minGames?: number;
    removeRankBias?: boolean;
    queues: Record<string, number>;
    patches: Record<string, number>;
    range: { from: string; to: string } | null;
    counters: AggregateCounters;
    shards: number;
    bytes: number;
    buildEntries?: number;
};

export const GENERATOR = "@draftpredict/pipeline";

export type WriteDatasetOptions = {
    dataset: Dataset;
    buildDataset?: BuildDatasetFile;
    /** Dataset root, laid out the way `LocalFileProvider` expects. */
    root?: string;
    /** Exact output file. Overrides `root`. */
    file?: string;
    window: string;
    patch: string;
    rank: Rank;
    region: Region;
    gzip?: boolean;
    pretty?: boolean;
    meta?: Partial<DatasetMeta>;
};

export type WriteDatasetResult = {
    datasetPath: string;
    metaPath: string;
    buildPath?: string;
    bytes: number;
    buildBytes?: number;
};

/**
 * Writes the dataset (gzipped JSON), its meta sidecar and, when present, the
 * build dataset — into `<root>/<window>/<patch>/<region>/<RANK>.json.gz`,
 * which is exactly where `LocalFileProvider` looks.
 */
export async function writeDatasetOutput(
    options: WriteDatasetOptions,
): Promise<WriteDatasetResult> {
    const gzip = options.gzip ?? true;
    const datasetPath =
        options.file ??
        datasetOutputPath({
            root: options.root ?? ".",
            window: options.window,
            patch: options.patch,
            region: options.region,
            rank: options.rank,
            gzip,
        });

    const bytes = await writeJsonFile(datasetPath, options.dataset, {
        gzip,
        pretty: options.pretty,
    });

    const meta: DatasetMeta = {
        generator: GENERATOR,
        generatedAt: new Date().toISOString(),
        window: options.window,
        patch: options.patch,
        rank: options.rank,
        region: options.region,
        date: options.dataset.date,
        matches: 0,
        champions: Object.keys(options.dataset.championData).length,
        queues: {},
        patches: {},
        range: null,
        counters: {
            linesRead: 0,
            matchesAccepted: 0,
            matchesRejected: 0,
            parseErrors: 0,
            rejectedBy: {
                malformed: 0,
                "wrong-map": 0,
                "wrong-queue": 0,
                "wrong-patch": 0,
                remake: 0,
                participants: 0,
                roles: 0,
            },
        },
        shards: 0,
        bytes,
        ...options.meta,
    };

    const metaPath = metaPathFor(datasetPath);
    await writeJsonFile(metaPath, meta, { gzip: false, pretty: true });

    let buildPath: string | undefined;
    let buildBytes: number | undefined;
    if (options.buildDataset) {
        buildPath = join(
            dirname(datasetPath),
            `${options.rank}.builds.json${gzip ? ".gz" : ""}`,
        );
        buildBytes = await writeJsonFile(buildPath, options.buildDataset, {
            gzip,
            pretty: options.pretty,
        });
    }

    return { datasetPath, metaPath, buildPath, bytes, buildBytes };
}

/** `PLATINUM_PLUS.json.gz` -> `PLATINUM_PLUS.meta.json`. */
export function metaPathFor(datasetPath: string): string {
    return datasetPath.replace(/\.json(\.gz)?$/, "") + ".meta.json";
}
