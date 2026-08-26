import { describe, expect, it } from "vitest";
import type { Dataset } from "@draftpredict/core";
import { Role } from "@draftpredict/core";

import { DatasetAccumulator } from "../aggregate/dataset-accumulator.js";
import { extractMatch } from "../aggregate/extract.js";
import { makeMatch, team } from "../testing/synthetic.js";
import { formatVerifyReport } from "./report.js";
import { verifyDataset } from "./verify.js";

const BLUE = team(1);
const RED = team(11);

/** A small but internally consistent dataset: 20 matches, 10 winners each way. */
function goodDataset(): Dataset {
    const accumulator = new DatasetAccumulator();
    for (let index = 0; index < 20; index += 1) {
        const result = extractMatch({
            match: makeMatch({
                blue: BLUE,
                red: RED,
                winner: index % 2 === 0 ? 100 : 200,
                duration: 1_500 + index * 60,
            }),
        });
        if (!result.ok) throw new Error(result.reason);
        accumulator.add(result.record);
    }
    return accumulator.finish();
}

function check(dataset: unknown, name: string) {
    const report = verifyDataset(dataset, { minCoverage: 0 });
    return report.checks.find((entry) => entry.name === name);
}

describe("verifyDataset", () => {
    it("passes a dataset the pipeline built", () => {
        const report = verifyDataset(goodDataset(), { minCoverage: 0 });
        expect(report.failures).toBe(0);
        expect(report.ok).toBe(true);
        expect(report.summary.champions).toBe(10);
        expect(report.summary.totalGames).toBe(200);
        expect(report.summary.impliedMatches).toBe(20);
        expect(report.checks.map((entry) => entry.name)).toContain("matchup-symmetry");
    });

    it("rejects a payload that is not a dataset at all", () => {
        expect(verifyDataset(null).ok).toBe(false);
        expect(verifyDataset([]).ok).toBe(false);
        expect(verifyDataset({}).ok).toBe(false);
        expect(verifyDataset({ championData: {} }).ok).toBe(false);
    });

    it("catches a NaN hiding in a champion's stats", () => {
        const dataset = goodDataset();
        dataset.championData["1"].statsByRole[Role.Top].wins = Number.NaN;

        const report = verifyDataset(dataset, { minCoverage: 0 });
        expect(report.ok).toBe(false);
        expect(check(dataset, "finite-numbers")?.status).toBe("fail");
        // A NaN also breaks the JSON round trip, since it serialises to null.
        expect(check(dataset, "json-round-trip")?.status).toBe("fail");
    });

    it("catches an Infinity in a matchup leaf", () => {
        const dataset = goodDataset();
        dataset.championData["1"].statsByRole[Role.Top].matchup[Role.Top]["11"].wins =
            Number.POSITIVE_INFINITY;
        expect(check(dataset, "finite-numbers")?.status).toBe("fail");
    });

    it("catches more wins than games", () => {
        const dataset = goodDataset();
        dataset.championData["2"].statsByRole[Role.Jungle].wins = 999;
        const failing = check(dataset, "stat-bounds");
        expect(failing?.status).toBe("fail");
        expect(failing?.details?.[0]).toContain("2/1");
    });

    it("catches a matchup matrix that disagrees with itself", () => {
        const dataset = goodDataset();
        dataset.championData["1"].statsByRole[Role.Top].matchup[Role.Top]["11"].games = 5;
        const failing = check(dataset, "matchup-symmetry");
        expect(failing?.status).toBe("fail");
        expect(failing?.details?.[0]).toContain("5 games vs 20 mirrored");
    });

    it("catches a synergy entry with no mirror", () => {
        const dataset = goodDataset();
        delete dataset.championData["2"].statsByRole[Role.Jungle].synergy[Role.Top]["1"];
        expect(check(dataset, "synergy-symmetry")?.status).toBe("fail");
    });

    it("catches an implausible global winrate", () => {
        const dataset = goodDataset();
        for (const champion of Object.values(dataset.championData)) {
            for (const role of [0, 1, 2, 3, 4] as Role[]) {
                champion.statsByRole[role].wins = champion.statsByRole[role].games;
            }
        }
        expect(check(dataset, "global-winrate")?.status).toBe("fail");
    });

    it("catches broken duration buckets", () => {
        const dataset = goodDataset();
        dataset.championData["1"].statsByRole[Role.Top].statsByTime = [
            { wins: 0, games: 0 },
        ];
        expect(check(dataset, "stats-by-time")?.status).toBe("fail");

        const other = goodDataset();
        other.championData["1"].statsByRole[Role.Top].statsByTime[0].games = 10_000;
        expect(check(other, "stats-by-time")?.status).toBe("fail");
    });

    it("fails when a champion the engine could be asked about is missing", () => {
        const dataset = goodDataset();
        const report = verifyDataset(dataset, {
            expectedChampionKeys: [...Object.keys(dataset.championData), "266"],
            minCoverage: 0,
        });
        const coverage = report.checks.find(
            (entry) => entry.name === "champion-coverage",
        );
        expect(coverage?.status).toBe("fail");
        expect(coverage?.details).toEqual(["266"]);
        expect(report.ok).toBe(false);
    });

    it("warns rather than fails on soft problems, unless --strict", () => {
        const dataset = goodDataset(); // no catalogues: a warning, not a failure
        expect(verifyDataset(dataset, { minCoverage: 0 }).ok).toBe(true);
        expect(verifyDataset(dataset, { minCoverage: 0, strict: true }).ok).toBe(false);
        expect(
            verifyDataset(dataset, { minCoverage: 0 }).checks.find(
                (entry) => entry.name === "catalogues",
            )?.status,
        ).toBe("warn");
    });

    it("renders a readable report", () => {
        const dataset = goodDataset();
        dataset.championData["1"].statsByRole[Role.Top].wins = Number.NaN;
        const text = formatVerifyReport(
            verifyDataset(dataset, { minCoverage: 0 }),
            "test.json.gz",
        );
        expect(text).toContain("test.json.gz");
        expect(text).toContain("[FAIL] finite-numbers");
        expect(text).toContain("FAILED");
    });
});
