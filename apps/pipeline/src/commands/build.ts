import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import type { StaticData } from "@draftpredict/data";
import { loadStaticData } from "@draftpredict/data";

import { buildDatasetFromShards } from "../aggregate/builder.js";
import { writeDatasetOutput } from "../aggregate/output.js";
import { collectPaths } from "../collect/collector.js";
import { verifyDataset } from "../verify/verify.js";
import { formatVerifyReport } from "../verify/report.js";
import { formatBytes } from "../util/fs.js";
import type { CliContext } from "./shared.js";
import {
    EXIT_FAILED,
    EXIT_OK,
    UsageError,
    formatDuration,
    parseNumberList,
    requireRank,
    requireRegion,
} from "./shared.js";

export const BUILD_USAGE = `
draftpredict-pipeline build --shards <dir> --out <dir> [options]

  Streams raw shards into a DraftGap-v5 compatible dataset.

  --shards <dir>       Directory with matches-*.jsonl[.gz], or a collect run dir
  --out <dir>          Dataset root: <out>/<window>/<patch>/<region>/<RANK>.json.gz
  --out-file <path>    Write exactly this file instead
  --window <w>         patch | full                          [default: full]
  --patch <p>          Patch label, e.g. 16.17 (required for --window patch)
  --rank <rank>        Rank label                    [default: PLATINUM_PLUS]
  --region <region>    Region label                            [default: ALL]
  --queue <ids>        Queues to aggregate                 [default: 420,440]
  --min-games <n>      Prune matchup/synergy entries below n games
  --min-build-games <n>  Prune build entries below n games
  --date <YYYY-MM-DD>  Dataset date field                    [default: today]
  --remove-rank-bias   Shift winrates so the average champion sits at 50%
  --no-builds          Skip the item/rune/spell/skill build dataset
  --no-build-matchups  Build data without per-lane-opponent breakdowns
  --no-gzip / --pretty
  --no-verify          Do not verify the dataset before writing it
  --verbose / --quiet
`.trim();

export async function runBuild(
    argv: readonly string[],
    context: CliContext,
): Promise<number> {
    const { values } = parseArgs({
        args: [...argv],
        allowPositionals: false,
        strict: true,
        options: {
            shards: { type: "string" },
            out: { type: "string" },
            "out-file": { type: "string" },
            window: { type: "string" },
            patch: { type: "string" },
            rank: { type: "string" },
            region: { type: "string" },
            queue: { type: "string", multiple: true },
            "min-games": { type: "string" },
            "min-build-games": { type: "string" },
            date: { type: "string" },
            "remove-rank-bias": { type: "boolean" },
            builds: { type: "boolean" },
            "no-builds": { type: "boolean" },
            "no-build-matchups": { type: "boolean" },
            gzip: { type: "boolean" },
            "no-gzip": { type: "boolean" },
            pretty: { type: "boolean" },
            "no-verify": { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    });

    if (values.help) {
        context.print(BUILD_USAGE);
        return EXIT_OK;
    }

    if (!values.shards) throw new UsageError("build needs --shards <dir>");
    if (!values.out && !values["out-file"]) {
        throw new UsageError("build needs --out <dir> (or --out-file <path>)");
    }

    const window = values.window ?? "full";
    if (window !== "patch" && window !== "full") {
        throw new UsageError(`Unknown window "${window}" (expected patch or full)`);
    }
    if (window === "patch" && !values.patch) {
        throw new UsageError(
            "--window patch needs --patch <p> so the input can be filtered to that patch",
        );
    }

    const rank = requireRank(values.rank);
    const region = requireRegion(values.region);
    const queues = parseNumberList(values.queue);

    // A collect run directory holds its shards in `shards/`; accept both.
    const shardDir = existsShardDir(values.shards)
        ? collectPaths(values.shards).shards
        : values.shards;

    const staticData = loadStaticDataSafely(context);
    const started = Date.now();

    const result = await buildDatasetFromShards({
        shardDir,
        staticData,
        queues: queues.length > 0 ? queues : undefined,
        patch: window === "patch" ? values.patch : undefined,
        date: values.date,
        minGames: optionalNumber(values["min-games"]),
        minBuildGames: optionalNumber(values["min-build-games"]),
        removeRankBias: values["remove-rank-bias"] === true,
        builds: values["no-builds"] ? false : (values.builds ?? true),
        buildMatchups: values["no-build-matchups"] ? false : true,
        logger: context.logger,
        onProgress: (counters) => {
            context.logger.debug(
                `${counters.linesRead} lines read, ${counters.matchesAccepted} matches aggregated`,
            );
        },
    });

    const counters = result.counters;
    if (counters.matchesAccepted === 0) {
        context.logger.error(
            `no usable matches in ${shardDir} (${counters.linesRead} lines read)`,
        );
        return EXIT_FAILED;
    }

    const patch = values.patch ?? dominantPatch(result.patches);

    if (!values["no-verify"]) {
        const report = verifyDataset(result.dataset, {
            expectedChampionKeys: staticData
                ? staticData.championList.map((champion) => champion.key)
                : undefined,
            minCoverage: 0,
        });
        context.print(formatVerifyReport(report, "built dataset"));
        if (!report.ok) {
            context.logger.error("dataset failed verification; not writing it");
            return EXIT_FAILED;
        }
    }

    const written = await writeDatasetOutput({
        dataset: result.dataset,
        buildDataset: result.buildDataset,
        root: values.out,
        file: values["out-file"],
        window,
        patch,
        rank,
        region,
        gzip: values["no-gzip"] ? false : (values.gzip ?? true),
        pretty: values.pretty === true,
        meta: {
            matches: counters.matchesAccepted,
            minGames: optionalNumber(values["min-games"]),
            removeRankBias: values["remove-rank-bias"] === true,
            queues: result.queues,
            patches: result.patches,
            counters,
            shards: result.files.length,
            range: result.range
                ? {
                      from: new Date(result.range.from).toISOString(),
                      to: new Date(result.range.to).toISOString(),
                  }
                : null,
            buildEntries: result.buildDataset
                ? Object.keys(result.buildDataset.entries).length
                : undefined,
        },
    });

    context.print(
        [
            `build finished in ${formatDuration(Date.now() - started)}`,
            `  shards read     : ${result.files.length} (${counters.linesRead} lines)`,
            `  matches used    : ${counters.matchesAccepted}`,
            `  rejected        : ${counters.matchesRejected} ${JSON.stringify(counters.rejectedBy)}`,
            `  patches         : ${JSON.stringify(result.patches)}`,
            `  dataset         : ${written.datasetPath} (${formatBytes(written.bytes)})`,
            `  meta            : ${written.metaPath}`,
            written.buildPath
                ? `  builds          : ${written.buildPath} (${formatBytes(written.buildBytes ?? 0)})`
                : "  builds          : skipped",
        ].join("\n"),
    );

    return EXIT_OK;
}

function dominantPatch(patches: Record<string, number>): string {
    const entries = Object.entries(patches).sort((a, b) => b[1] - a[1]);
    return entries[0]?.[0] ?? "unknown";
}

/** A collect run directory keeps its shards in `shards/`; a shard directory does not. */
function existsShardDir(dir: string): boolean {
    return existsSync(join(dir, "shards"));
}

function optionalNumber(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new UsageError(`Expected a number, got "${value}"`);
    }
    return parsed;
}

/** Static data is optional: without it the dataset simply has no catalogues. */
function loadStaticDataSafely(context: CliContext): StaticData | undefined {
    try {
        return loadStaticData();
    } catch (error) {
        context.logger.warn(
            `could not load static data, champion names and catalogues will be missing: ${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        return undefined;
    }
}
