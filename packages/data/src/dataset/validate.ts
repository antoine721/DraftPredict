import type { Dataset } from "@draftpredict/core";
import { DatasetError } from "./types.js";

/**
 * Shape validation for datasets that arrive from outside the process.
 *
 * Remote payloads are ~50 MB of JSON; walking every matchup entry would cost
 * more than the download. So this checks the structural invariants the engine
 * actually depends on — the top-level record, and a sampled champion entry —
 * and reports precisely which one failed.
 */

export type ValidateDatasetOptions = {
    /** Where the payload came from, for the error message. */
    source?: string;
    /** How many champion entries to inspect in depth. Default 3. */
    sampleSize?: number;
    /** Reject a dataset with no champions at all. Default `true`. */
    requireChampions?: boolean;
};

export function validateDataset(
    payload: unknown,
    options: ValidateDatasetOptions = {},
): Dataset {
    const source = options.source ?? "dataset";
    const fail = (message: string): never => {
        throw new DatasetError("invalid-payload", `${source}: ${message}`);
    };

    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return fail("payload is not an object");
    }

    const record = payload as Record<string, unknown>;

    if (typeof record.championData !== "object" || record.championData === null) {
        return fail("missing championData");
    }

    const championData = record.championData as Record<string, unknown>;
    const keys = Object.keys(championData);
    if (options.requireChampions !== false && keys.length === 0) {
        return fail("championData is empty");
    }

    const sampleSize = options.sampleSize ?? 3;
    for (const key of keys.slice(0, sampleSize)) {
        const champion = championData[key];
        if (typeof champion !== "object" || champion === null) {
            return fail(`championData["${key}"] is not an object`);
        }
        const entry = champion as Record<string, unknown>;
        if (typeof entry.key !== "string") {
            return fail(`championData["${key}"].key is missing`);
        }
        const statsByRole = entry.statsByRole as Record<string, unknown> | undefined;
        if (typeof statsByRole !== "object" || statsByRole === null) {
            return fail(`championData["${key}"].statsByRole is missing`);
        }
        for (const role of [0, 1, 2, 3, 4]) {
            const roleData = statsByRole[String(role)] as
                Record<string, unknown> | undefined;
            if (typeof roleData !== "object" || roleData === null) {
                return fail(`championData["${key}"].statsByRole[${role}] is missing`);
            }
            if (
                typeof roleData.games !== "number" ||
                typeof roleData.wins !== "number"
            ) {
                return fail(
                    `championData["${key}"].statsByRole[${role}] has no wins/games`,
                );
            }
        }
    }

    // The catalogues are optional in the wild: DraftGap's champion-only
    // datasets omit them and the engine reads them defensively.
    const dataset = record as unknown as Dataset;
    dataset.itemData ??= {};
    dataset.runeData ??= {};
    dataset.runePathData ??= {};
    dataset.statShardData ??= {};
    dataset.summonerSpellData ??= {};
    dataset.version ??= "5";
    dataset.date ??= "";

    return dataset;
}
