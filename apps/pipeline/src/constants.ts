/** Values shared by collection and aggregation, so the two agree by construction. */

/** Queues the pipeline knows how to aggregate: ranked solo/duo and flex. */
export const DEFAULT_QUEUES: readonly number[] = [420, 440];

/** Summoner's Rift. Anything else never reaches a shard or a dataset. */
export const SUMMONERS_RIFT_MAP_ID = 11;

/** Games shorter than this are remakes. */
export const MIN_MATCH_DURATION_SECONDS = 300;
