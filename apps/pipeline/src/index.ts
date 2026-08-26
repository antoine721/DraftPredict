/**
 * `@draftpredict/pipeline` — the dataset builder.
 *
 * Three importable stages plus a thin CLI on top:
 *
 *  - `collect/` walks Riot match histories into newline-delimited shards,
 *  - `aggregate/` streams those shards into a DraftGap-v5 `Dataset` plus the
 *    item/rune/spell/skill build dataset,
 *  - `verify/` checks a built dataset before anybody trusts it.
 *
 * Everything is a plain function over options, so `apps/server` can rebuild a
 * dataset in-process instead of shelling out to the CLI.
 */

export * from "./constants.js";

// ------------------------------------------------------------------ collect ---
export * from "./collect/types.js";
export * from "./collect/seen-ids.js";
export * from "./collect/state.js";
export * from "./collect/sources.js";
export * from "./collect/collector.js";

// ---------------------------------------------------------------- aggregate ---
export * from "./aggregate/types.js";
export * from "./aggregate/items.js";
export * from "./aggregate/extract.js";
export * from "./aggregate/dataset-accumulator.js";
export * from "./aggregate/build-accumulator.js";
export {
    buildDatasetFromShards,
    type BuildDatasetOptions,
    type BuildDatasetResult,
} from "./aggregate/builder.js";
export * from "./aggregate/output.js";

// ------------------------------------------------------------------- verify ---
export * from "./verify/verify.js";
export * from "./verify/report.js";

// ------------------------------------------------------------------ fixture ---
export * from "./fixture/fixture.js";

// -------------------------------------------------------------------- utils ---
export * from "./util/logger.js";
export {
    JsonlShardWriter,
    listShardFiles,
    readJsonlFile,
    readJsonlFiles,
    type JsonlLine,
    type ShardWriterOptions,
} from "./util/jsonl.js";
export {
    datasetOutputPath,
    ensureDir,
    formatBytes,
    readJsonFile,
    writeJsonFile,
} from "./util/fs.js";
