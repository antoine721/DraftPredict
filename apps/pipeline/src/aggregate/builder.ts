import type { Dataset } from "@draftpredict/core";
import type { StaticData } from "@draftpredict/data";

import { DEFAULT_QUEUES } from "../constants.js";
import { listShardFiles, readJsonlFiles } from "../util/jsonl.js";
import type { PipelineLogger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import type { BuildDatasetFile } from "./build-accumulator.js";
import { BuildDatasetAccumulator } from "./build-accumulator.js";
import { DatasetAccumulator } from "./dataset-accumulator.js";
import { extractMatch, type ExtractOptions } from "./extract.js";
import type { ItemClassifier } from "./items.js";
import { itemClassifierFromStaticData, permissiveItemClassifier } from "./items.js";
import type { AggregateCounters, MatchRecord } from "./types.js";
import { emptyAggregateCounters } from "./types.js";

export type BuildDatasetOptions = {
    /** Shard files to read. Takes precedence over `shardDir`. */
    files?: readonly string[];
    /** Directory holding `matches-*.jsonl[.gz]` shards. */
    shardDir?: string;
    /** Shard file prefix. Default "matches". */
    shardPrefix?: string;

    staticData?: StaticData;
    /** Queue ids to keep. Default `[420, 440]`. */
    queues?: readonly number[];
    /** Keep only this patch — required for a `patch`-window dataset. */
    patch?: string;
    /** Dataset `date`. Defaults to today. */
    date?: string;
    /** Prune matchup/synergy entries below this many games. */
    minGames?: number;
    /** Shift winrates so the average champion sits at 50%. */
    removeRankBias?: boolean;
    /** Also aggregate the item/rune/spell/skill build dataset. Default `true`. */
    builds?: boolean;
    /** Record per-lane-opponent build data. Default `true`. */
    buildMatchups?: boolean;
    /** Minimum games for a champion/role build entry to be kept. */
    minBuildGames?: number;

    logger?: PipelineLogger;
    /** Called every `progressEvery` matches. */
    onProgress?: (counters: AggregateCounters) => void;
    progressEvery?: number;
    signal?: AbortSignal;
};

export type BuildDatasetResult = {
    dataset: Dataset;
    buildDataset?: BuildDatasetFile;
    counters: AggregateCounters;
    /** Shard files that were read, in order. */
    files: string[];
    /** Patches seen in the input, with their match counts. */
    patches: Record<string, number>;
    /** Queues seen in the input, with their match counts. */
    queues: Record<string, number>;
    /** Epoch ms of the oldest and newest match. */
    range: { from: number; to: number } | null;
};

/**
 * Streams raw shards into a dataset.
 *
 * The whole point of the shard format is that this function never holds more
 * than one match at a time: files are read line by line, each line is reduced
 * to a {@link MatchRecord} and folded into the accumulators, and the record is
 * dropped again.
 */
export async function buildDatasetFromShards(
    options: BuildDatasetOptions,
): Promise<BuildDatasetResult> {
    const logger = options.logger ?? silentLogger;
    const files =
        options.files && options.files.length > 0
            ? [...options.files]
            : listShardFiles(options.shardDir ?? ".", options.shardPrefix ?? "matches");

    if (files.length === 0) {
        throw new Error(
            `No shard files found in ${options.shardDir ?? "(no directory given)"}`,
        );
    }

    const classifier: ItemClassifier = options.staticData
        ? itemClassifierFromStaticData(options.staticData)
        : permissiveItemClassifier;

    const withBuilds = options.builds ?? true;
    const extractOptions: ExtractOptions = {
        queues: options.queues ?? DEFAULT_QUEUES,
        patch: options.patch,
        classifier,
        skipBuilds: !withBuilds,
    };

    const dataset = new DatasetAccumulator({
        staticData: options.staticData,
        date: options.date,
    });
    const builds = withBuilds
        ? new BuildDatasetAccumulator({
              date: options.date,
              matchups: options.buildMatchups ?? true,
          })
        : undefined;

    const counters = emptyAggregateCounters();
    const patches: Record<string, number> = {};
    const queues: Record<string, number> = {};
    let range: { from: number; to: number } | null = null;
    const progressEvery = Math.max(1, options.progressEvery ?? 5000);

    const lines = readJsonlFiles<unknown>(files, {
        onError: (error, context) => {
            counters.parseErrors += 1;
            logger.warn(`skipping ${context.file}:${context.line}: ${error.message}`);
        },
    });

    for await (const { value } of lines) {
        if (options.signal?.aborted) {
            logger.warn("aggregation aborted; writing what has been read so far");
            break;
        }

        counters.linesRead += 1;
        const result = extractMatch(value, extractOptions);
        if (!result.ok) {
            counters.matchesRejected += 1;
            counters.rejectedBy[result.reason] += 1;
            continue;
        }

        const record: MatchRecord = result.record;
        counters.matchesAccepted += 1;
        patches[record.patch] = (patches[record.patch] ?? 0) + 1;
        queues[String(record.queueId)] = (queues[String(record.queueId)] ?? 0) + 1;
        range = range
            ? {
                  from: Math.min(range.from, record.gameCreation),
                  to: Math.max(range.to, record.gameCreation),
              }
            : { from: record.gameCreation, to: record.gameCreation };

        dataset.add(record);
        builds?.add(record);

        if (counters.linesRead % progressEvery === 0) {
            options.onProgress?.({ ...counters });
            logger.debug(
                `read ${counters.linesRead} lines, ${counters.matchesAccepted} matches`,
            );
        }
    }

    options.onProgress?.({ ...counters });

    return {
        dataset: dataset.finish({
            minGames: options.minGames,
            removeRankBias: options.removeRankBias,
            date: options.date,
        }),
        buildDataset: builds?.finish({
            minGames: options.minBuildGames,
            date: options.date,
            patch: options.patch,
        }),
        counters,
        files,
        patches,
        queues,
        range,
    };
}
