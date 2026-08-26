import { describe, expect, it } from "vitest";
import { Role } from "@draftpredict/core";

import { makeMatch, makeTimeline, team } from "../testing/synthetic.js";
import {
    extractMatch,
    extractTimelineBuilds,
    parsePatch,
    timeBucketIndex,
} from "./extract.js";
import { permissiveItemClassifier } from "./items.js";

const BLUE = team(1);
const RED = team(11);

describe("parsePatch", () => {
    it("keeps only major.minor", () => {
        expect(parsePatch("16.17.1.2345")).toBe("16.17");
        expect(parsePatch("13.9.512.9999")).toBe("13.9");
    });
});

describe("timeBucketIndex", () => {
    it("maps durations onto the seven DraftGap buckets", () => {
        expect(timeBucketIndex(19 * 60 + 59)).toBeNull();
        expect(timeBucketIndex(20 * 60)).toBe(0);
        expect(timeBucketIndex(24 * 60 + 59)).toBe(0);
        expect(timeBucketIndex(25 * 60)).toBe(1);
        expect(timeBucketIndex(50 * 60)).toBe(6);
        // The last bucket is open ended.
        expect(timeBucketIndex(120 * 60)).toBe(6);
    });
});

describe("extractMatch", () => {
    it("resolves roles, damage and the patch", () => {
        const result = extractMatch({
            match: makeMatch({ blue: BLUE, red: RED, winner: 200, duration: 1500 }),
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.record.patch).toBe("16.17");
        expect(result.record.durationSeconds).toBe(1500);
        expect(result.record.timeBucket).toBe(1);
        expect(result.record.participants).toHaveLength(10);

        const top = result.record.participants[0];
        expect(top.championKey).toBe("1");
        expect(top.role).toBe(Role.Top);
        expect(top.win).toBe(false);

        const enemySupport = result.record.participants[9];
        expect(enemySupport.role).toBe(Role.Support);
        expect(enemySupport.win).toBe(true);
    });

    it("falls back to positional role assignment when Riot sends nothing", () => {
        const result = extractMatch({
            match: makeMatch({ blue: BLUE, red: RED, withoutPositions: true }),
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.record.participants.map((player) => player.role)).toEqual([
            0, 1, 2, 3, 4, 0, 1, 2, 3, 4,
        ]);
    });

    it("rejects everything that cannot become a dataset sample", () => {
        expect(extractMatch(null)).toEqual({ ok: false, reason: "malformed" });
        expect(extractMatch({ match: { info: {} } })).toEqual({
            ok: false,
            reason: "malformed",
        });
        expect(
            extractMatch(
                { match: makeMatch({ blue: BLUE, red: RED, queueId: 450 }) },
                { queues: [420, 440] },
            ),
        ).toEqual({ ok: false, reason: "wrong-queue" });
        expect(
            extractMatch({ match: makeMatch({ blue: BLUE, red: RED, mapId: 12 }) }),
        ).toEqual({ ok: false, reason: "wrong-map" });
        expect(
            extractMatch({ match: makeMatch({ blue: BLUE, red: RED, duration: 240 }) }),
        ).toEqual({ ok: false, reason: "remake" });
        expect(
            extractMatch(
                { match: makeMatch({ blue: BLUE, red: RED, gameVersion: "15.1.0.1" }) },
                { patch: "16.17" },
            ),
        ).toEqual({ ok: false, reason: "wrong-patch" });
    });

    it("accepts a bare MatchDto line as well as a {match} record", () => {
        const match = makeMatch({ blue: BLUE, red: RED });
        const wrapped = extractMatch({ match });
        const bare = extractMatch(match);
        expect(bare.ok).toBe(true);
        if (!bare.ok || !wrapped.ok) return;
        expect(bare.record.matchId).toBe(wrapped.record.matchId);
    });

    it("reads the rune page and splits boots out of the inventory", () => {
        const result = extractMatch(
            {
                match: makeMatch({
                    blue: [
                        {
                            championKey: "1",
                            items: [3006, 6672, 3031, 3072, 3340, 2003],
                            primaryRunes: [8005, 9101, 9104, 8014],
                            secondaryRunes: [8139, 8135],
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
                }),
            },
            {
                classifier: {
                    ...permissiveItemClassifier,
                    isBoots: (id) => id === 3006,
                },
            },
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const player = result.record.participants[0];

        expect(player.boots).toBe(3006);
        expect(player.items).toEqual([6672, 3031, 3072]); // trinket + potion dropped
        expect(player.runes).toEqual({
            primaryPath: 8000,
            keystone: 8005,
            primary: [8005, 9101, 9104, 8014],
            secondaryPath: 8100,
            secondary: [8139, 8135],
            shards: [5005, 5008, 5001],
        });
        expect(player.spells).toEqual([4, 7]);
    });
});

describe("extractTimelineBuilds", () => {
    it("reads the starting set, the item order and the skill order", () => {
        const timeline = makeTimeline({
            matchId: "EUW1_1",
            puuids: Array.from({ length: 10 }, (_, index) => `puuid-${index + 1}`),
            purchases: {
                1: [
                    { itemId: 1055, timestamp: 10_000 },
                    { itemId: 2003, timestamp: 12_000 },
                    { itemId: 3006, timestamp: 400_000 },
                    { itemId: 6672, timestamp: 700_000 },
                    { itemId: 3031, timestamp: 1_200_000 },
                ],
            },
            skills: {
                // Q W Q E Q R W W E E E: Q reaches three points first, then W, then E.
                1: [1, 2, 1, 3, 1, 4, 2, 2, 3, 3, 3],
            },
        });

        const builds = extractTimelineBuilds(timeline, {
            ...permissiveItemClassifier,
            isBoots: (id) => id === 3006,
            isCompleted: (id) => id === 6672 || id === 3031,
        });

        const build = builds.get(1);
        expect(build).toBeDefined();
        expect(build?.startingItems).toEqual([1055, 2003]);
        expect(build?.itemOrder).toEqual([6672, 3031]);
        expect(build?.skillLevels.slice(0, 5)).toEqual(["Q", "W", "Q", "E", "Q"]);
        expect(build?.skillOrder).toBe("QWE");
    });

    it("undoes a purchase that was undone in game", () => {
        const timeline = makeTimeline({
            matchId: "EUW1_2",
            puuids: ["a"],
            purchases: { 1: [{ itemId: 1055, timestamp: 5_000 }] },
            undo: { 1: [1055] },
        });
        const builds = extractTimelineBuilds(timeline, permissiveItemClassifier);
        expect(builds.get(1)?.startingItems).toEqual([]);
    });

    it("returns nothing when no timeline was collected", () => {
        expect(extractTimelineBuilds(undefined, permissiveItemClassifier).size).toBe(0);
    });
});
