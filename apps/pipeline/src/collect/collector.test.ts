import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MatchDto } from "@draftpredict/riot";

import { readJsonlFiles, listShardFiles } from "../util/jsonl.js";
import { makeMatch, team } from "../testing/synthetic.js";
import type { RawMatchRecord } from "./types.js";
import type { CollectSource, MatchIdQuery } from "./types.js";
import { collectMatches, collectPaths } from "./collector.js";
import { loadCollectState } from "./state.js";
import { SeenIdSet } from "./seen-ids.js";

/**
 * A fake Riot: a fixed set of players, each with a match history, all offline.
 */
function fakeSource(options: { players: number; matchesPerPlayer: number }): CollectSource & {
    requests: { ids: number; matches: number };
} {
    const requests = { ids: 0, matches: 0 };
    const matches = new Map<string, MatchDto>();
    const historyByPuuid = new Map<string, string[]>();

    const puuidFor = (index: number): string => `puuid-${index}`;
    // Ten distinct players per match, so the frontier is closed: expansion
    // reaches every player and nobody outside the fake ladder.
    const players = Math.max(10, options.players);

    const push = (puuid: string, matchId: string): void => {
        const history = historyByPuuid.get(puuid);
        if (history) history.push(matchId);
        else historyByPuuid.set(puuid, [matchId]);
    };

    for (let player = 0; player < players; player += 1) {
        for (let index = 0; index < options.matchesPerPlayer; index += 1) {
            const matchId = `EUW1_${player}_${index}`;
            const lineup = Array.from({ length: 10 }, (_, slot) =>
                puuidFor((player + slot) % players),
            );
            matches.set(
                matchId,
                makeMatch({
                    matchId,
                    blue: team(1).map((championKey, slot) => ({
                        championKey,
                        puuid: lineup[slot],
                    })),
                    red: team(11).map((championKey, slot) => ({
                        championKey,
                        puuid: lineup[slot + 5],
                    })),
                    winner: index % 2 === 0 ? 100 : 200,
                }),
            );
            // Every participant has the match in their own history, which is
            // what makes the same id reachable ten different ways.
            for (const puuid of lineup) push(puuid, matchId);
        }
    }

    return {
        requests,
        async matchIds(puuid: string, query: MatchIdQuery): Promise<string[]> {
            requests.ids += 1;
            const history = historyByPuuid.get(puuid) ?? [];
            const start = query.start ?? 0;
            return history.slice(start, start + (query.count ?? 20));
        },
        async match(matchId: string): Promise<MatchDto | null> {
            requests.matches += 1;
            return matches.get(matchId) ?? null;
        },
        async apexPuuids(): Promise<string[]> {
            return [puuidFor(0), puuidFor(1)];
        },
    };
}

describe("collectMatches", () => {
    let directory: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), "draftpredict-collect-"));
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    async function shardIds(outDir: string): Promise<string[]> {
        const files = listShardFiles(collectPaths(outDir).shards);
        const ids: string[] = [];
        for await (const { value } of readJsonlFiles<RawMatchRecord>(files)) {
            ids.push(value.match.metadata.matchId);
        }
        return ids;
    }

    it("seeds from an apex ladder and writes every match once", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 3 });
        const result = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedApex: ["challenger"],
            queues: [420],
            shardSize: 5,
        });

        expect(result.stopped).toBe("complete");
        // Twelve players x three matches, each collected exactly once even
        // though every match is reachable from ten different histories.
        expect(result.stats.matchesWritten).toBe(36);
        expect(result.stats.duplicates).toBeGreaterThan(0);
        expect(result.stats.playersProcessed).toBe(12);

        const ids = await shardIds(directory);
        expect(ids).toHaveLength(36);
        expect(new Set(ids).size).toBe(36);
    });

    it("expands the frontier through the players of collected matches", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 2 });
        const result = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            queues: [420],
        });

        // One seed, but every player shows up in somebody's match.
        expect(result.stats.playersProcessed).toBe(12);
        expect(result.stats.matchesWritten).toBe(24);
    });

    it("does not expand when asked not to", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 2 });
        const result = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            expand: false,
            queues: [420],
        });

        expect(result.stats.playersProcessed).toBe(1);
        // Only the seed's own history: their two games plus the eighteen they
        // appear in, and nobody else's.
        expect(result.stats.matchesWritten).toBe(20);
    });

    it("resumes where it stopped, without re-collecting anything", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 2 });
        const first = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            queues: [420],
            maxMatches: 5,
            shardSize: 3,
        });

        expect(first.stopped).toBe("max-matches");
        expect(first.stats.matchesWritten).toBe(5);
        expect(first.pending).toBeGreaterThan(0);

        const state = await loadCollectState(collectPaths(directory).state, {
            platform: "euw1",
            queues: [420],
        });
        expect(state.resumed).toBe(true);
        expect(state.data.pending.length).toBe(first.pending);

        const requestsBefore = source.requests.matches;
        const second = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            queues: [420],
        });

        expect(second.stopped).toBe("complete");
        // The second run continues the same total rather than starting over.
        expect(second.stats.matchesWritten).toBe(24);
        expect(source.requests.matches).toBeGreaterThan(requestsBefore);

        const ids = await shardIds(directory);
        expect(ids).toHaveLength(24);
        expect(new Set(ids).size).toBe(24);

        const seen = await SeenIdSet.open(collectPaths(directory).seen);
        expect(seen.size).toBe(24);
    });

    it("starts over when the parameters changed", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 2 });
        await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            queues: [420],
        });

        const state = await loadCollectState(collectPaths(directory).state, {
            platform: "euw1",
            queues: [440],
        });
        expect(state.resumed).toBe(false);
        expect(state.discardedReason).toMatch(/different parameters/);
    });

    it("stops cleanly on an abort signal and saves its state", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 5 });
        const controller = new AbortController();
        let written = 0;

        const result = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            queues: [420],
            signal: controller.signal,
            onProgress: () => {
                written += 1;
                if (written === 3) controller.abort();
            },
        });

        expect(result.stopped).toBe("aborted");
        expect(result.stats.matchesWritten).toBe(3);

        const ids = await shardIds(directory);
        expect(ids).toHaveLength(3);

        const state = await loadCollectState(collectPaths(directory).state, {
            platform: "euw1",
            queues: [420],
        });
        expect(state.resumed).toBe(true);
        expect(state.data.stats.matchesWritten).toBe(3);
    });

    it("drops matches the aggregator could not use", async () => {
        const source: CollectSource = {
            async matchIds() {
                return ["EUW1_ok", "EUW1_aram", "EUW1_remake", "EUW1_gone"];
            },
            async match(matchId: string) {
                if (matchId === "EUW1_gone") return null;
                if (matchId === "EUW1_aram") {
                    return makeMatch({
                        matchId,
                        blue: team(1),
                        red: team(11),
                        queueId: 450,
                        mapId: 12,
                    });
                }
                if (matchId === "EUW1_remake") {
                    return makeMatch({
                        matchId,
                        blue: team(1),
                        red: team(11),
                        duration: 200,
                    });
                }
                return makeMatch({ matchId, blue: team(1), red: team(11) });
            },
        };

        const result = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
            seedPuuids: ["puuid-0"],
            queues: [420],
            expand: false,
        });

        expect(result.stats.matchesWritten).toBe(1);
        expect(result.stats.matchesRejected).toBe(2);
        expect(result.stats.matchesMissing).toBe(1);
        expect(await shardIds(directory)).toEqual(["EUW1_ok"]);
    });

    it("reports when there is nothing to seed from", async () => {
        const source = fakeSource({ players: 12, matchesPerPlayer: 1 });
        const result = await collectMatches({
            source,
            outDir: directory,
            platform: "euw1",
        });
        expect(result.stopped).toBe("no-seeds");
        expect(result.stats.matchesWritten).toBe(0);
    });
});
