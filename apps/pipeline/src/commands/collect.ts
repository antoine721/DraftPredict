import { parseArgs } from "node:util";

import { RiotApiClient } from "@draftpredict/riot";

import { collectMatches, collectPaths } from "../collect/collector.js";
import { DEFAULT_QUEUES } from "../constants.js";
import { riotCollectSource } from "../collect/sources.js";
import type { ApexTier, CollectSource } from "../collect/types.js";
import { APEX_TIERS } from "../collect/types.js";
import { fileSize, formatBytes } from "../util/fs.js";
import type { CliContext } from "./shared.js";
import {
    EXIT_FAILED,
    EXIT_OK,
    EXIT_USAGE,
    UsageError,
    formatDuration,
    parseNumberList,
    parseTimestampSeconds,
    readApiKey,
    toList,
} from "./shared.js";

export const COLLECT_USAGE = `
draftpredict-pipeline collect --out <dir> --region <platform> [options]

  Walks match histories and writes raw matches as newline-delimited JSON
  shards. Resumable: run the same command again to continue where it stopped.

  --out <dir>              Run directory (shards/, state.json, seen-matches.txt)
  --region <id>            Platform to pull from, e.g. euw1, na1, kr  [required]
  --queue <ids>            Queue ids to walk                 [default: 420,440]
  --since <date>           Only matches at or after this date (YYYY-MM-DD)
  --until <date>           Only matches before this date
  --seed-apex <tiers>      challenger,grandmaster,master
  --apex-queue <queue>     RANKED_SOLO_5x5 | RANKED_FLEX_SR  [default: solo]
  --seed-summoner <id>     "gameName#tagLine" (repeatable)
  --seed-puuid <puuid>     PUUID seed (repeatable)
  --max-matches <n>        Stop after collecting n matches in this run
  --max-per-player <n>     Match ids to consider per player   [default: 100]
  --no-expand              Do not queue the players of collected matches
  --timelines              Also fetch timelines (item order, skill order)
  --no-gzip                Write plain .jsonl shards
  --shard-size <n>         Matches per shard                 [default: 5000]
  --fresh                  Ignore any existing state file and start over
  --verbose / --quiet

  The API key is read from RIOT_API_KEY and is never accepted as a flag.
`.trim();

export type RunCollectOptions = {
    /** Injected by tests; the CLI builds a Riot-backed source. */
    source?: CollectSource;
    signal?: AbortSignal;
};

export async function runCollect(
    argv: readonly string[],
    context: CliContext,
    options: RunCollectOptions = {},
): Promise<number> {
    const { values } = parseArgs({
        args: [...argv],
        allowPositionals: false,
        strict: true,
        options: {
            out: { type: "string" },
            region: { type: "string" },
            queue: { type: "string", multiple: true },
            since: { type: "string" },
            until: { type: "string" },
            "seed-apex": { type: "string", multiple: true },
            "apex-queue": { type: "string" },
            "seed-summoner": { type: "string", multiple: true },
            "seed-puuid": { type: "string", multiple: true },
            "max-matches": { type: "string" },
            "max-per-player": { type: "string" },
            "max-players": { type: "string" },
            expand: { type: "boolean" },
            "no-expand": { type: "boolean" },
            timelines: { type: "boolean" },
            gzip: { type: "boolean" },
            "no-gzip": { type: "boolean" },
            "shard-size": { type: "string" },
            fresh: { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    });

    if (values.help) {
        context.print(COLLECT_USAGE);
        return EXIT_OK;
    }

    const outDir = values.out;
    if (!outDir) throw new UsageError("collect needs --out <dir>");

    const queues = parseNumberList(values.queue);
    const apexTiers = toList(values["seed-apex"]).map((tier) => {
        const normalized = tier.toLowerCase() as ApexTier;
        if (!APEX_TIERS.includes(normalized)) {
            throw new UsageError(
                `Unknown apex tier "${tier}" (expected ${APEX_TIERS.join(", ")})`,
            );
        }
        return normalized;
    });

    const apexQueue = parseApexQueue(values["apex-queue"]);

    let source = options.source;
    let platform = values.region ?? "unknown";

    if (!source) {
        if (!values.region) {
            throw new UsageError("collect needs --region <platform>, e.g. --region euw1");
        }
        const apiKey = readApiKey(context.env);
        const client = new RiotApiClient({
            apiKey,
            platform: values.region,
            logger: {
                warn: (message) => context.logger.warn(message),
                error: (message) => context.logger.error(message),
                debug: (message) => context.logger.debug(message),
            },
            onRateLimit: (event) => {
                context.logger.warn(
                    `rate limited on ${event.method} (${event.limitType}), waiting ${Math.round(event.waitMs / 1000)}s`,
                );
            },
        });
        platform = client.platform;
        source = riotCollectSource(client, { logger: context.logger });
    }

    const started = Date.now();
    const paths = collectPaths(outDir);
    context.logger.info(`collecting into ${paths.shards}`);

    const result = await collectMatches({
        source,
        outDir,
        platform,
        queues: queues.length > 0 ? queues : DEFAULT_QUEUES,
        startTime: parseTimestampSeconds(values.since),
        endTime: parseTimestampSeconds(values.until),
        seedApex: apexTiers,
        apexQueue,
        seedRiotIds: toList(values["seed-summoner"]),
        seedPuuids: toList(values["seed-puuid"]),
        expand: values["no-expand"] ? false : (values.expand ?? true),
        maxMatches: optionalNumber(values["max-matches"]),
        maxPerPlayer: optionalNumber(values["max-per-player"]),
        maxPlayers: optionalNumber(values["max-players"]),
        timelines: values.timelines === true,
        gzip: values["no-gzip"] ? false : (values.gzip ?? true),
        shardSize: optionalNumber(values["shard-size"]),
        fresh: values.fresh === true,
        signal: options.signal,
        logger: context.logger,
        onProgress: ({ matchesWritten, pending }) => {
            if (matchesWritten % 100 === 0) {
                context.logger.info(
                    `${matchesWritten} matches collected, ${pending} players queued`,
                );
            }
        },
    });

    const stats = result.stats;
    context.print(
        [
            `collect finished (${result.stopped}) in ${formatDuration(Date.now() - started)}`,
            `  matches written : ${stats.matchesWritten}`,
            `  rejected        : ${stats.matchesRejected} (wrong queue/map, remake)`,
            `  duplicates      : ${stats.duplicates}`,
            `  missing         : ${stats.matchesMissing}`,
            `  players done    : ${stats.playersProcessed} (${result.pending} still queued)`,
            `  requests        : ${stats.requests}`,
            `  errors          : ${stats.errors}`,
            `  known match ids : ${result.seenIds}`,
            `  shards          : ${result.shards.length} (${formatBytes(
                result.shards.reduce((sum, file) => sum + fileSize(file), 0),
            )})`,
            `  state           : ${result.stateFile}`,
            result.stopped === "complete" || result.stopped === "max-matches"
                ? "  run the same command again to collect more"
                : "  run the same command again to resume",
        ].join("\n"),
    );

    if (result.stopped === "no-seeds") return EXIT_USAGE;
    if (result.stopped === "error") return EXIT_FAILED;
    // A run that wrote nothing and only produced errors is a failure, even
    // though the collector itself shut down cleanly.
    if (stats.matchesWritten === 0 && stats.errors > 0) return EXIT_FAILED;
    return EXIT_OK;
}

/** Riot spells the solo queue id with a lowercase "x", so compare case-insensitively. */
function parseApexQueue(value: string | undefined): "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" {
    const normalized = (value ?? "RANKED_SOLO_5x5").trim().toLowerCase();
    if (normalized === "ranked_solo_5x5" || normalized === "solo") return "RANKED_SOLO_5x5";
    if (normalized === "ranked_flex_sr" || normalized === "flex") return "RANKED_FLEX_SR";
    throw new UsageError(
        `Unknown apex queue "${value}" (expected RANKED_SOLO_5x5 or RANKED_FLEX_SR)`,
    );
}

function optionalNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new UsageError(`Expected a positive number, got "${value}"`);
    }
    return parsed;
}
