import { parseArgs } from "node:util";

import { loadStaticData } from "@draftpredict/data";

import { readJsonFile } from "../util/fs.js";
import { formatVerifyReport } from "../verify/report.js";
import { verifyDataset } from "../verify/verify.js";
import type { CliContext } from "./shared.js";
import { EXIT_FAILED, EXIT_OK, UsageError } from "./shared.js";

export const VERIFY_USAGE = `
draftpredict-pipeline verify <dataset.json[.gz]> [options]

  Sanity-checks a built dataset and exits non-zero when a check fails.

  --min-games <n>      Games a champion needs to count as covered  [default: 1]
  --min-coverage <f>   Fraction of champions that must be covered  [default: 0.5]
  --no-champion-list   Do not compare against the bundled champion list
  --strict             Treat warnings as failures
  --json               Print the report as JSON
  --verbose / --quiet
`.trim();

export async function runVerify(
    argv: readonly string[],
    context: CliContext,
): Promise<number> {
    const { values, positionals } = parseArgs({
        args: [...argv],
        allowPositionals: true,
        strict: true,
        options: {
            file: { type: "string" },
            "min-games": { type: "string" },
            "min-coverage": { type: "string" },
            "no-champion-list": { type: "boolean" },
            strict: { type: "boolean" },
            json: { type: "boolean" },
            help: { type: "boolean", short: "h" },
        },
    });

    if (values.help) {
        context.print(VERIFY_USAGE);
        return EXIT_OK;
    }

    const file = values.file ?? positionals[0];
    if (!file) throw new UsageError("verify needs a dataset file");

    let payload: unknown;
    try {
        payload = await readJsonFile<unknown>(file);
    } catch (error) {
        context.logger.error(
            `could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
        );
        return EXIT_FAILED;
    }

    let expectedChampionKeys: string[] | undefined;
    if (!values["no-champion-list"]) {
        try {
            expectedChampionKeys = loadStaticData().championList.map(
                (champion) => champion.key,
            );
        } catch {
            context.logger.warn(
                "no static data available; skipping the champion-list comparison",
            );
        }
    }

    const report = verifyDataset(payload, {
        expectedChampionKeys,
        minGames: numberOr(values["min-games"], 1),
        minCoverage: numberOr(values["min-coverage"], 0.5),
        strict: values.strict === true,
    });

    context.print(
        values.json
            ? JSON.stringify(report, null, 4)
            : formatVerifyReport(report, file),
    );

    return report.ok ? EXIT_OK : EXIT_FAILED;
}

function numberOr(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new UsageError(`Expected a number, got "${value}"`);
    }
    return parsed;
}
