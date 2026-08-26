import { describe, expect, it } from "vitest";
import { Role, analyzeBuild, normalizeItemSetId } from "@draftpredict/core";

import { makeMatch, makeTimeline, team } from "../testing/synthetic.js";
import { BuildDatasetAccumulator, buildEntryKey } from "./build-accumulator.js";
import { extractMatch } from "./extract.js";
import { permissiveItemClassifier } from "./items.js";

const RED = team(11);

const classifier = {
    ...permissiveItemClassifier,
    isBoots: (id: number) => id === 3006,
    isCompleted: (id: number) => id === 6672 || id === 3031 || id === 3072,
};

function record(match: ReturnType<typeof makeMatch>, timeline?: ReturnType<typeof makeTimeline>) {
    const result = extractMatch({ match, timeline }, { classifier });
    if (!result.ok) throw new Error(`match rejected: ${result.reason}`);
    return result.record;
}

function carry(win: boolean) {
    return makeMatch({
        blue: [
            {
                championKey: "1",
                items: [3006, 6672, 3031, 3072],
                primaryRunes: [8005, 9101],
                secondaryRunes: [8139],
                primaryPath: 8000,
                secondaryPath: 8100,
                shards: [5005, 5008, 5001],
                spells: [4, 7],
            },
            "2",
            "3",
            "4",
            "5",
        ],
        red: RED,
        winner: win ? 100 : 200,
    });
}

describe("BuildDatasetAccumulator", () => {
    it("counts runes, spells, boots and item sets per champion and role", () => {
        const accumulator = new BuildDatasetAccumulator();
        accumulator.add(record(carry(true)));
        accumulator.add(record(carry(false)));

        const entry = accumulator.get("1", Role.Top);
        expect(entry).toBeDefined();
        expect(entry?.games).toBe(2);
        expect(entry?.wins).toBe(1);

        expect(entry?.runes.primary["8005"]).toEqual({ games: 2, wins: 1 });
        expect(entry?.runes.primary["9101"]).toEqual({ games: 2, wins: 1 });
        expect(entry?.runes.secondary["8139"]).toEqual({ games: 2, wins: 1 });
        expect(entry?.runes.shards.offense["5005"]).toEqual({ games: 2, wins: 1 });
        expect(entry?.items.boots["3006"]).toEqual({ games: 2, wins: 1 });
        expect(entry?.items.sets[normalizeItemSetId([6672, 3031, 3072])]).toEqual({
            games: 2,
            wins: 1,
        });
        expect(entry?.summonerSpells["4_7"]).toEqual({ games: 2, wins: 1 });
    });

    it("tracks the lane opponent as a build matchup", () => {
        const accumulator = new BuildDatasetAccumulator();
        accumulator.add(record(carry(true)));
        accumulator.add(record(carry(true)));

        const entry = accumulator.get("1", Role.Top);
        expect(entry?.matchups).toHaveLength(1);
        expect(entry?.matchups[0]).toMatchObject({
            championKey: "11",
            role: Role.Top,
            games: 2,
            wins: 2,
        });
        expect(entry?.matchups[0].items.boots["3006"]).toEqual({ games: 2, wins: 2 });
    });

    it("fills item order, starting set and skill order from a timeline", () => {
        const match = carry(true);
        const timeline = makeTimeline({
            matchId: match.metadata.matchId,
            puuids: match.metadata.participants,
            purchases: {
                1: [
                    { itemId: 1055, timestamp: 8_000 },
                    { itemId: 3006, timestamp: 300_000 },
                    { itemId: 6672, timestamp: 800_000 },
                    { itemId: 3031, timestamp: 1_400_000 },
                ],
            },
            skills: { 1: [1, 3, 1, 2, 1, 4, 1] },
        });

        const accumulator = new BuildDatasetAccumulator();
        accumulator.add(record(match, timeline));
        const entry = accumulator.get("1", Role.Top);

        expect(entry?.items.startingSets[normalizeItemSetId([1055])]).toEqual({
            games: 1,
            wins: 1,
        });
        expect(entry?.items.statsByOrder[0]["6672"]).toEqual({ games: 1, wins: 1 });
        expect(entry?.items.statsByOrder[1]["3031"]).toEqual({ games: 1, wins: 1 });
        expect(entry?.skills.order.QEW).toEqual({ games: 1, wins: 1 });
        expect(entry?.skills.level[0].Q).toEqual({ games: 1, wins: 1 });
        expect(entry?.skills.level[1].E).toEqual({ games: 1, wins: 1 });
    });

    it("degrades gracefully without a timeline", () => {
        const accumulator = new BuildDatasetAccumulator();
        accumulator.add(record(carry(true)));
        const entry = accumulator.get("1", Role.Top);

        expect(entry?.items.startingSets).toEqual({});
        expect(entry?.items.statsByOrder[0]).toEqual({});
        expect(entry?.skills.order).toEqual({});
        // …but the parts that come from the match itself are still there.
        expect(entry?.items.boots["3006"]).toEqual({ games: 1, wins: 1 });
    });

    it("produces a file the engine's build analysis can read", () => {
        const accumulator = new BuildDatasetAccumulator();
        for (let index = 0; index < 10; index += 1) {
            accumulator.add(record(carry(index % 2 === 0)));
        }
        const file = accumulator.finish({ patch: "16.17" });
        const entry = file.entries[buildEntryKey("1", Role.Top)];

        expect(entry).toBeDefined();
        expect(file.matches).toBe(10);

        const analysis = analyzeBuild({ ...entry, matchups: [] }, entry, {
            ignoreChampionWinrates: false,
            riskLevel: "medium",
            minGames: 0,
        });
        expect(Number.isFinite(analysis.runes.primary[0]?.winrate ?? 0.5)).toBe(true);
    });

    it("drops entries below the minimum game count", () => {
        const accumulator = new BuildDatasetAccumulator();
        accumulator.add(record(carry(true)));
        const file = accumulator.finish({ minGames: 5 });
        expect(Object.keys(file.entries)).toHaveLength(0);
    });
});
