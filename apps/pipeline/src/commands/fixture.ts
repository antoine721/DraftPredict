import { parseArgs } from "node:util";

import { writeFixtureDatasets } from "../fixture/fixture.js";
import type { CliContext } from "./shared.js";
import {
    EXIT_OK,
    UsageError,
    requireRank,
    requireRegion,
    toList,
} from "./shared.js";

export const FIXTURE_USAGE = `
draftpredict-pipeline fixture --out <dir> [options]

  Regenerates the offline fixture dataset from @draftpredict/data: a
  deterministic, realistic-looking dataset over the bundled champion list.
  Works with no network at all.

  --out <dir>          Dataset root to write into                 [required]
  --seed <n>           Generator seed (same seed -> same bytes)
  --rank <rank>        Rank label                        [default: PLATINUM_PLUS]
  --region <region>    Region label                                [default: ALL]
  --patch <p>          Patch label      [default: the bundled Data Dragon patch]
  --date <YYYY-MM-DD>  Dataset date field
  --builds             Also write synthetic build datasets
  --champions <keys>   Champion keys to generate build data for
  --build-champions <n>  How many champions when --champions is omitted [12]
  --no-gzip / --pretty
  --verbose / --quiet
`.trim();

export async function runFixture(
    argv: readonly string[],
    context: CliContext,
): Promise<number> {
    const { values } = parseArgs({
        args: [...argv],
        allowPositionals: false,
        strict: true,
        options: {
            out: { type: "string" },
            seed: { type: "string" },
            rank: { type: "string" },
            region: { type: "string" },
            patch: { type: "string" },
            date: { type: "string" },
            builds: { type: "boolean" },
            champions: { type: "string", multiple: true },
            "build-champions": { type: "string" },
            gzip: { type: "boolean" },
            "no-gzip": { type: "boolean" },
            pretty: { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    });

    if (values.help) {
        context.print(FIXTURE_USAGE);
        return EXIT_OK;
    }

    if (!values.out) throw new UsageError("fixture needs --out <dir>");

    const championKeys = toList(values.champions);

    const result = await writeFixtureDatasets({
        outDir: values.out,
        seed: values.seed === undefined ? undefined : Number(values.seed),
        rank: requireRank(values.rank),
        region: requireRegion(values.region),
        patch: values.patch,
        date: values.date,
        builds: values.builds === true,
        championKeys: championKeys.length > 0 ? championKeys : undefined,
        buildChampionCount:
            values["build-champions"] === undefined
                ? undefined
                : Number(values["build-champions"]),
        gzip: values["no-gzip"] ? false : (values.gzip ?? true),
        pretty: values.pretty === true,
        logger: context.logger,
    });

    context.print(
        [
            `fixture datasets written (seed ${result.seed}, patch ${result.patch})`,
            `  champions   : ${result.champions}`,
            `  build entries: ${result.buildEntries}`,
            ...result.files.map((file) => `  ${file}`),
        ].join("\n"),
    );

    return EXIT_OK;
}
