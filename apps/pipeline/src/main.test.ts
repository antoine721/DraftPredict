import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role, analyzeDraft } from "@draftpredict/core";
import { LocalFileProvider, loadStaticData } from "@draftpredict/data";

import { JsonlShardWriter } from "./util/jsonl.js";
import { createLogger } from "./util/logger.js";
import { makeMatch, team } from "./testing/synthetic.js";
import type { CliContext } from "./commands/shared.js";
import { EXIT_FAILED, EXIT_OK, EXIT_USAGE } from "./commands/shared.js";
import { majorMinor } from "./fixture/fixture.js";
import { runCollect } from "./commands/collect.js";
import type { CollectSource } from "./collect/types.js";
import { main } from "./main.js";

/** Captures everything the CLI prints, so nothing reaches the test output. */
function testContext(env: NodeJS.ProcessEnv = {}): CliContext & { output: string[] } {
    const output: string[] = [];
    const logger = createLogger({
        level: "debug",
        secrets: [env.RIOT_API_KEY],
        write: (_level, line) => output.push(line),
    });
    return {
        logger,
        output,
        env,
        print: (line) => output.push(line),
    };
}

let directory: string;
let shardDir: string;

const BLUE = team(1);
const RED = team(11);

beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "draftpredict-cli-"));
    shardDir = join(directory, "run", "shards");

    const writer = new JsonlShardWriter({ dir: shardDir, maxLines: 40, gzip: true });
    for (let index = 0; index < 100; index += 1) {
        await writer.write({
            match: makeMatch({
                blue: BLUE,
                red: RED,
                winner: index % 2 === 0 ? 100 : 200,
                duration: 1_500 + (index % 10) * 120,
            }),
        });
    }
    await writer.close();
});

afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe("CLI", () => {
    it("prints usage and exits 2 with no command", async () => {
        const context = testContext();
        expect(await main([], { context })).toBe(EXIT_USAGE);
        expect(context.output.join("\n")).toContain("draftpredict-pipeline <command>");
    });

    it("rejects an unknown command", async () => {
        const context = testContext();
        expect(await main(["frobnicate"], { context })).toBe(EXIT_USAGE);
    });

    it("prints per-command help", async () => {
        const context = testContext();
        expect(await main(["collect", "--help"], { context })).toBe(EXIT_OK);
        expect(context.output.join("\n")).toContain("--seed-apex");
    });

    it("refuses to collect without RIOT_API_KEY, and never echoes one", async () => {
        const context = testContext({});
        expect(await main(["collect", "--out", directory, "--region", "euw1"], { context })).toBe(
            EXIT_USAGE,
        );
        expect(context.output.join("\n")).toContain("RIOT_API_KEY is not set");

        const withKey = testContext({ RIOT_API_KEY: "RGAPI-0123abcd-0000-1111-2222-333344445555" });
        // An invalid platform fails before any request is made.
        expect(await main(["collect", "--out", directory, "--region", "nowhere"], { context: withKey })).toBe(
            EXIT_FAILED,
        );
        const printed = withKey.output.join("\n");
        expect(printed).not.toContain("RGAPI-");
    });

    it("exits non-zero when a collect run only produced errors", async () => {
        const failing: CollectSource = {
            async matchIds() {
                throw new Error("Riot API: invalid or expired API key");
            },
            async match() {
                return null;
            },
        };

        const context = testContext();
        const code = await runCollect(
            ["--out", join(directory, "failing-run"), "--seed-puuid", "puuid-0"],
            context,
            { source: failing },
        );
        expect(code).toBe(EXIT_FAILED);
        expect(context.output.join("\n")).toContain("matches written : 0");

        const noSeeds = testContext();
        expect(
            await runCollect(["--out", join(directory, "seedless-run")], noSeeds, {
                source: failing,
            }),
        ).toBe(EXIT_USAGE);
    });

    it("reports a usage error instead of a stack trace", async () => {
        const context = testContext();
        expect(await main(["build", "--shards", shardDir], { context })).toBe(EXIT_USAGE);
        expect(context.output.join("\n")).toContain("--out");

        const badFlag = testContext();
        expect(await main(["build", "--nonsense"], { context: badFlag })).toBe(EXIT_USAGE);
    });

    it("builds, verifies and serves a dataset end to end", async () => {
        const root = join(directory, "datasets");
        const buildContext = testContext();

        const buildCode = await main(
            [
                "build",
                "--shards",
                join(directory, "run"),
                "--out",
                root,
                "--window",
                "patch",
                "--patch",
                "16.17",
                "--rank",
                "DIAMOND_PLUS",
                "--region",
                "EUW",
                "--no-gzip",
                "--no-builds",
            ],
            { context: buildContext },
        );
        expect(buildCode).toBe(EXIT_OK);
        const buildOutput = buildContext.output.join("\n");
        expect(buildOutput).toContain("matches used    : 100");
        expect(buildOutput).toContain("[PASS] matchup-symmetry");

        const datasetPath = join(root, "patch", "16.17", "EUW", "DIAMOND_PLUS.json");

        // verify accepts it...
        const verifyContext = testContext();
        expect(await main(["verify", datasetPath, "--no-champion-list"], { context: verifyContext })).toBe(
            EXIT_OK,
        );
        expect(verifyContext.output.join("\n")).toContain("OK —");

        // ...and @draftpredict/data can serve it straight out of that layout.
        const provider = new LocalFileProvider({ root });
        expect(await provider.available()).toBe(true);
        const dataset = await provider.load({
            rank: "DIAMOND_PLUS",
            region: "EUW",
            patch: "16.17",
            window: "patch",
        });

        const analysis = analyzeDraft(
            dataset,
            dataset,
            new Map<Role, string>([
                [Role.Top, "1"],
                [Role.Jungle, "2"],
                [Role.Middle, "3"],
                [Role.Bottom, "4"],
                [Role.Support, "5"],
            ]),
            new Map<Role, string>([
                [Role.Top, "11"],
                [Role.Jungle, "12"],
                [Role.Middle, "13"],
                [Role.Bottom, "14"],
                [Role.Support, "15"],
            ]),
            { ignoreChampionWinrates: false, riskLevel: "medium", minGames: 0 },
        );
        expect(Number.isFinite(analysis.winrate)).toBe(true);
    }, 120_000);

    it("exits non-zero when verify finds a corrupted dataset", async () => {
        const path = join(directory, "corrupt.json");
        const { writeJsonFile } = await import("./util/fs.js");
        await writeJsonFile(path, { version: "5", date: "2026-08-26", championData: {} });

        const context = testContext();
        expect(await main(["verify", path, "--no-champion-list"], { context })).toBe(
            EXIT_FAILED,
        );
        expect(context.output.join("\n")).toContain("FAILED");
    });

    it("regenerates the offline fixture dataset", async () => {
        const root = join(directory, "fixture");
        const context = testContext();

        expect(
            await main(
                ["fixture", "--out", root, "--rank", "PLATINUM_PLUS", "--region", "ALL", "--no-gzip"],
                { context },
            ),
        ).toBe(EXIT_OK);

        const provider = new LocalFileProvider({ root });
        const patch = majorMinor(loadStaticData().version);
        const patchDataset = await provider.load({
            rank: "PLATINUM_PLUS",
            region: "ALL",
            patch,
            window: "patch",
        });
        const fullDataset = await provider.load({
            rank: "PLATINUM_PLUS",
            region: "ALL",
            patch,
            window: "full",
        });

        expect(Object.keys(patchDataset.championData).length).toBeGreaterThan(150);
        const [first, second] = Object.keys(fullDataset.championData);
        const analysis = analyzeDraft(
            patchDataset,
            fullDataset,
            new Map<Role, string>([[Role.Top, first]]),
            new Map<Role, string>([[Role.Top, second]]),
            { ignoreChampionWinrates: false, riskLevel: "medium", minGames: 0 },
        );
        expect(analysis.winrate).toBeGreaterThan(0);
        expect(analysis.winrate).toBeLessThan(1);
    }, 180_000);
});
