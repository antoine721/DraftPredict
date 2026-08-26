/**
 * @draftpredict/data — static game data and dataset providers.
 *
 * Two halves:
 *
 *  - **static data**: the bundled Data Dragon snapshot (champions, items,
 *    runes, summoner spells, stat shards), indexed and searchable, with an
 *    optional updater that pulls a newer patch when the network allows it;
 *  - **datasets**: the win/loss samples the engine reasons over, loaded
 *    through a provider chain that ends in a deterministic offline fixture.
 *
 * Nothing here runs at import time; every load is an explicit call.
 */

// ---------------------------------------------------------------- static ----
export * from "./static/types.js";
export * from "./static/ddragon-raw.js";
export * from "./static/load.js";
export * from "./static/urls.js";
export * from "./static/stat-shards.js";
export * from "./static/search.js";
export * from "./static/aliases.js";
export * from "./static/updater.js";

// --------------------------------------------------------------- fixtures ---
export * from "./fixtures/rng.js";
export * from "./fixtures/role-affinity.js";
export * from "./fixtures/damage.js";
export * from "./fixtures/dataset.js";
export * from "./fixtures/build-dataset.js";

// --------------------------------------------------------------- datasets ---
export * from "./dataset/types.js";
export * from "./dataset/validate.js";
export * from "./dataset/cache.js";
export * from "./dataset/disk-cache.js";
export * from "./dataset/fixture-provider.js";
export * from "./dataset/draftgap-provider.js";
export * from "./dataset/local-file-provider.js";
export * from "./dataset/service.js";
export * from "./dataset/factory.js";

// ------------------------------------------------------------------ utils ---
export * from "./util/logger.js";
export * from "./util/emitter.js";
export {
    getPackageRoot,
    getAssetsDir,
    getBundledDDragonRoot,
    getUserDataDir,
    getStaticCacheDir,
    getDatasetCacheDir,
} from "./util/paths.js";
