import type { Dataset, FullBuildDataset, Rank, Region, Role } from "@draftpredict/core";
import { DATASET_VERSION, ROLES } from "@draftpredict/core";
import type { StaticData } from "@draftpredict/data";
import {
    DEFAULT_FIXTURE_SEED,
    generateFixtureBuildDataset,
    generateFixtureDatasetPair,
    loadStaticData,
} from "@draftpredict/data";

import type { BuildDatasetFile } from "../aggregate/build-accumulator.js";
import { buildEntryKey } from "../aggregate/build-accumulator.js";
import { writeDatasetOutput } from "../aggregate/output.js";
import type { PipelineLogger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";

/**
 * Regenerates the offline fixture dataset.
 *
 * The dev container cannot reach Riot, Data Dragon or DraftGap's bucket, and
 * neither can a user who is simply offline — so `@draftpredict/data` can
 * synthesise a complete, deterministic dataset from the bundled champion list.
 * This writes that dataset out in the layout `LocalFileProvider` reads, which
 * gives the app a real file to serve (and a golden artefact to diff) without a
 * single network call.
 */

export type FixtureOptions = {
    /** Dataset root to write into. */
    outDir: string;
    seed?: number;
    rank?: Rank;
    region?: Region;
    /** Patch label. Defaults to the bundled Data Dragon version's major.minor. */
    patch?: string;
    /** Dataset `date`. Defaults to the static snapshot's own fixed date. */
    date?: string;
    /** Also write synthetic build datasets. */
    builds?: boolean;
    /** Champions to generate build data for. Defaults to the most played ones. */
    championKeys?: readonly string[];
    /** How many champions to cover when `championKeys` is omitted. Default 12. */
    buildChampionCount?: number;
    gzip?: boolean;
    pretty?: boolean;
    staticData?: StaticData;
    logger?: PipelineLogger;
};

export type FixtureResult = {
    files: string[];
    patch: string;
    seed: number;
    champions: number;
    buildEntries: number;
};

export async function writeFixtureDatasets(
    options: FixtureOptions,
): Promise<FixtureResult> {
    const logger = options.logger ?? silentLogger;
    const staticData = options.staticData ?? loadStaticData();
    const seed = options.seed ?? DEFAULT_FIXTURE_SEED;
    const rank: Rank = options.rank ?? "PLATINUM_PLUS";
    const region: Region = options.region ?? "ALL";
    const patch = options.patch ?? majorMinor(staticData.version);

    logger.info(
        `generating fixture datasets from the ${staticData.source} snapshot ${staticData.version} (seed ${seed})`,
    );

    const { dataset, fullDataset } = generateFixtureDatasetPair({
        seed,
        staticData,
        version: DATASET_VERSION,
        date: options.date,
    });

    const files: string[] = [];
    let buildEntries = 0;

    for (const [window, payload] of [
        ["patch", dataset],
        ["full", fullDataset],
    ] as const) {
        const buildDataset = options.builds
            ? buildFixtureBuilds({
                  window,
                  dataset: payload,
                  staticData,
                  seed,
                  patch,
                  rank,
                  region,
                  championKeys: options.championKeys,
                  count: options.buildChampionCount ?? 12,
              })
            : undefined;
        if (buildDataset) buildEntries += Object.keys(buildDataset.entries).length;

        const written = await writeDatasetOutput({
            dataset: payload,
            buildDataset,
            root: options.outDir,
            window,
            patch,
            rank,
            region,
            gzip: options.gzip,
            pretty: options.pretty,
            meta: {
                generatedAt: new Date().toISOString(),
                matches: 0,
                champions: Object.keys(payload.championData).length,
                queues: {},
                patches: { [patch]: 0 },
                buildEntries: buildDataset
                    ? Object.keys(buildDataset.entries).length
                    : undefined,
            },
        });

        files.push(written.datasetPath, written.metaPath);
        if (written.buildPath) files.push(written.buildPath);
        logger.info(`wrote ${written.datasetPath}`);
    }

    return {
        files,
        patch,
        seed,
        champions: Object.keys(dataset.championData).length,
        buildEntries,
    };
}

type FixtureBuildArgs = {
    window: "patch" | "full";
    dataset: Dataset;
    staticData: StaticData;
    seed: number;
    patch: string;
    rank: Rank;
    region: Region;
    championKeys?: readonly string[];
    count: number;
};

function buildFixtureBuilds(args: FixtureBuildArgs): BuildDatasetFile {
    const targets = args.championKeys
        ? args.championKeys.map((key) => ({ key, role: mainRole(args.dataset, key) }))
        : mostPlayed(args.dataset, args.count);

    const entries: Record<string, FullBuildDataset> = {};
    const matchups = targets
        .slice(0, 8)
        .map((target) => ({ championKey: target.key, role: target.role }));

    for (const target of targets) {
        const generated = generateFixtureBuildDataset({
            championKey: target.key,
            role: target.role,
            seed: args.seed,
            staticData: args.staticData,
            matchups: matchups.filter((matchup) => matchup.championKey !== target.key),
        });
        entries[buildEntryKey(target.key, target.role)] =
            args.window === "full"
                ? generated.fullDataset
                : { ...generated.dataset, matchups: [] };
    }

    return {
        version: DATASET_VERSION,
        date: args.dataset.date,
        patch: args.patch,
        rank: args.rank,
        region: args.region,
        window: args.window,
        entries,
    };
}

/** The role a champion is played in most in `dataset`. */
function mainRole(dataset: Dataset, championKey: string): Role {
    const champion = dataset.championData[championKey];
    if (!champion) return 0;
    let best: Role = 0;
    for (const role of ROLES) {
        if (champion.statsByRole[role].games > champion.statsByRole[best].games) {
            best = role;
        }
    }
    return best;
}

function mostPlayed(dataset: Dataset, count: number): { key: string; role: Role }[] {
    return Object.values(dataset.championData)
        .map((champion) => {
            const role = mainRole(dataset, champion.key);
            return {
                key: champion.key,
                role,
                games: champion.statsByRole[role].games,
            };
        })
        .sort((a, b) => b.games - a.games || Number(a.key) - Number(b.key))
        .slice(0, Math.max(0, count))
        .map(({ key, role }) => ({ key, role }));
}

/** `"16.17.1"` -> `"16.17"`. */
export function majorMinor(version: string): string {
    const parts = version.split(".");
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}
