import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Dataset } from "@draftpredict/core";
import {
    Role,
    analyzeDraft,
    getDraftResultWinrateByTime,
    getSuggestions,
    getTeamDamageDistribution,
    predictRoles,
} from "@draftpredict/core";
import { loadStaticData } from "@draftpredict/data";

import { JsonlShardWriter, listShardFiles } from "../util/jsonl.js";
import { makeMatch } from "../testing/synthetic.js";
import { verifyDataset } from "../verify/verify.js";
import { writeDatasetOutput } from "./output.js";
import { buildDatasetFromShards } from "./builder.js";
import { readJsonFile } from "../util/fs.js";

/**
 * The end-to-end proof: synthetic matches -> shards on disk -> a streamed
 * build -> a dataset the untouched `@draftpredict/core` engine analyses.
 */

const staticData = loadStaticData();
const CHAMPIONS = staticData.championList.slice(0, 20).map((champion) => champion.key);

/** A reproducible pseudo-random generator, so the fixture never flakes. */
function rng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        return state / 0x1_0000_0000;
    };
}

function draftFor(random: () => number): { blue: string[]; red: string[] } {
    const pool = [...CHAMPIONS];
    const pick = (): string => {
        const index = Math.floor(random() * pool.length);
        return pool.splice(index, 1)[0];
    };
    return {
        blue: [pick(), pick(), pick(), pick(), pick()],
        red: [pick(), pick(), pick(), pick(), pick()],
    };
}

let directory: string;
let shardDir: string;

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "draftpredict-pipeline-"));
    shardDir = join(directory, "shards");

    // 400 matches over four shards, so the streaming path (multiple files,
    // gzip, line-by-line reads) is the one under test.
    const writer = new JsonlShardWriter({ dir: shardDir, maxLines: 100, gzip: true });
    const random = rng(20260826);
    for (let index = 0; index < 400; index += 1) {
        const { blue, red } = draftFor(random);
        await writer.write({
            match: makeMatch({
                blue: blue.map((championKey) => ({
                    championKey,
                    damage: {
                        magic: Math.round(random() * 20_000),
                        physical: Math.round(random() * 20_000),
                        true: Math.round(random() * 3_000),
                    },
                })),
                red,
                winner: index % 2 === 0 ? 100 : 200,
                duration: 1_200 + Math.round(random() * 1_800),
            }),
        });
    }
    // A line that is not a match at all, plus a queue we do not aggregate.
    await writer.write({ match: makeMatch({ blue: CHAMPIONS.slice(0, 5), red: CHAMPIONS.slice(5, 10), queueId: 450 }) });
    await writer.close();
}, 60_000);

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe("buildDatasetFromShards", () => {
    let result: Awaited<ReturnType<typeof buildDatasetFromShards>>;
    let dataset: Dataset;

    beforeAll(async () => {
        result = await buildDatasetFromShards({ shardDir, staticData });
        dataset = result.dataset;
    }, 60_000);

    it("streams every shard", () => {
        // 401 lines at 100 lines per shard.
        expect(listShardFiles(shardDir)).toHaveLength(5);
        expect(result.files).toHaveLength(5);
        expect(result.counters.linesRead).toBe(401);
        expect(result.counters.matchesAccepted).toBe(400);
        expect(result.counters.rejectedBy["wrong-queue"]).toBe(1);
        expect(result.patches).toEqual({ "16.17": 400 });
        expect(result.queues).toEqual({ "420": 400 });
    });

    it("produces a dataset covering every champion in the static data", () => {
        expect(Object.keys(dataset.championData)).toHaveLength(
            staticData.championList.length,
        );
        expect(Object.keys(dataset.itemData).length).toBeGreaterThan(100);
        expect(Object.keys(dataset.summonerSpellData).length).toBeGreaterThan(5);

        const totalGames = Object.values(dataset.championData).reduce(
            (sum, champion) =>
                sum +
                [0, 1, 2, 3, 4].reduce(
                    (roleSum, role) => roleSum + champion.statsByRole[role as Role].games,
                    0,
                ),
            0,
        );
        expect(totalGames).toBe(4000); // 400 matches x 10 players
    });

    it("passes verification", () => {
        const report = verifyDataset(dataset, {
            expectedChampionKeys: staticData.championList.map((champion) => champion.key),
            minCoverage: 0,
            plausibleMinGames: 100_000,
        });
        expect(report.checks.filter((check) => check.status === "fail")).toEqual([]);
        expect(report.ok).toBe(true);
    });

    it("feeds @draftpredict/core unchanged", () => {
        const team = new Map<Role, string>([
            [Role.Top, CHAMPIONS[0]],
            [Role.Jungle, CHAMPIONS[1]],
            [Role.Middle, CHAMPIONS[2]],
            [Role.Bottom, CHAMPIONS[3]],
            [Role.Support, CHAMPIONS[4]],
        ]);
        const enemy = new Map<Role, string>([
            [Role.Top, CHAMPIONS[5]],
            [Role.Jungle, CHAMPIONS[6]],
            [Role.Middle, CHAMPIONS[7]],
            [Role.Bottom, CHAMPIONS[8]],
            [Role.Support, CHAMPIONS[9]],
        ]);
        const config = {
            ignoreChampionWinrates: false,
            riskLevel: "medium" as const,
            minGames: 0,
        };

        const analysis = analyzeDraft(dataset, dataset, team, enemy, config);
        expect(Number.isFinite(analysis.winrate)).toBe(true);
        expect(analysis.winrate).toBeGreaterThan(0);
        expect(analysis.winrate).toBeLessThan(1);
        expect(Number.isFinite(analysis.totalRating)).toBe(true);
        expect(analysis.matchupRating.matchupResults).toHaveLength(25);
        expect(analysis.allyDuoRating.duoResults).toHaveLength(10);

        const byTime = getDraftResultWinrateByTime(dataset, analysis, team, enemy, config);
        expect(byTime.length).toBeGreaterThan(0);
        expect(byTime.every((point) => Number.isFinite(point.winrate))).toBe(true);

        const partial = new Map(team);
        partial.delete(Role.Support);
        const suggestions = getSuggestions(dataset, dataset, partial, enemy, config);
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions.every((suggestion) => Number.isFinite(suggestion.rating))).toBe(
            true,
        );

        const damage = getTeamDamageDistribution(dataset, team);
        expect(damage.magic + damage.physical + damage.true).toBeGreaterThan(0);

        const predicted = predictRoles(dataset, [...team.values()]);
        expect(predicted.size).toBe(5);
    });

    it("also aggregates the build dataset", () => {
        expect(result.buildDataset).toBeDefined();
        const entries = Object.values(result.buildDataset!.entries);
        expect(entries.length).toBeGreaterThan(0);
        const games = entries.reduce((sum, entry) => sum + entry.games, 0);
        expect(games).toBe(4000);
        // No timelines were collected, so item order stays empty by design.
        expect(entries.every((entry) => Object.keys(entry.items.statsByOrder[0]).length === 0)).toBe(
            true,
        );
    });

    it("writes files a LocalFileProvider can serve, plus a meta sidecar", async () => {
        const root = join(directory, "datasets");
        const written = await writeDatasetOutput({
            dataset,
            buildDataset: result.buildDataset,
            root,
            window: "full",
            patch: "16.17",
            rank: "PLATINUM_PLUS",
            region: "EUW",
            meta: { matches: result.counters.matchesAccepted },
        });

        expect(written.datasetPath).toBe(
            join(root, "full", "16.17", "EUW", "PLATINUM_PLUS.json.gz"),
        );
        const roundTripped = await readJsonFile<Dataset>(written.datasetPath);
        expect(Object.keys(roundTripped.championData)).toHaveLength(
            Object.keys(dataset.championData).length,
        );

        const meta = await readJsonFile<{ matches: number; generator: string }>(
            written.metaPath,
        );
        expect(meta.matches).toBe(400);
        expect(meta.generator).toBe("@draftpredict/pipeline");
        expect(written.buildPath).toContain("PLATINUM_PLUS.builds.json.gz");
    });
});
