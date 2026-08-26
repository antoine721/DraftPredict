import { describe, expect, it } from "vitest";
import type { Dataset } from "@draftpredict/core";
import { Role, getStats } from "@draftpredict/core";

import { makeMatch, team } from "../testing/synthetic.js";
import { DatasetAccumulator } from "./dataset-accumulator.js";
import { extractMatch } from "./extract.js";

/** Extracts a hand-built match, failing loudly when it is rejected. */
function record(match: ReturnType<typeof makeMatch>) {
    const result = extractMatch({ match }, { queues: [420, 440] });
    if (!result.ok) throw new Error(`match rejected: ${result.reason}`);
    return result.record;
}

/** `{wins, games}` only, so assertions do not depend on the surrounding shape. */
function sample(stats: { wins: number; games: number }): { wins: number; games: number } {
    return { wins: stats.wins, games: stats.games };
}

function base(dataset: Dataset, key: string, role: Role) {
    return sample(getStats(dataset, key, role));
}

function matchup(
    dataset: Dataset,
    key: string,
    role: Role,
    enemyRole: Role,
    enemyKey: string,
) {
    return sample(getStats(dataset, key, role, "matchup", enemyRole, enemyKey));
}

function duo(
    dataset: Dataset,
    key: string,
    role: Role,
    otherRole: Role,
    otherKey: string,
) {
    return sample(getStats(dataset, key, role, "duo", otherRole, otherKey));
}

const BLUE = team(1); // champions 1..5, roles Top..Support
const RED = team(11); // champions 11..15

describe("DatasetAccumulator", () => {
    it("counts games and wins per champion and role", () => {
        const accumulator = new DatasetAccumulator();
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 200 })));
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));

        const dataset = accumulator.finish();

        expect(accumulator.matches).toBe(3);
        expect(accumulator.participants).toBe(30);

        // Champion "1" played top on blue three times, winning twice.
        expect(base(dataset, "1", Role.Top)).toEqual({ games: 3, wins: 2 });
        // Its lane opponent won once.
        expect(base(dataset, "11", Role.Top)).toEqual({ games: 3, wins: 1 });
        // Nobody played champion "1" anywhere else.
        expect(base(dataset, "1", Role.Jungle)).toEqual({ games: 0, wins: 0 });
    });

    it("records the matchup matrix from both sides", () => {
        const accumulator = new DatasetAccumulator();
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 200 })));
        const dataset = accumulator.finish();

        // Lane matchup: top vs top.
        expect(matchup(dataset, "1", Role.Top, Role.Top, "11")).toEqual({
            games: 2,
            wins: 1,
        });
        expect(matchup(dataset, "11", Role.Top, Role.Top, "1")).toEqual({
            games: 2,
            wins: 1,
        });

        // Cross-role matchup: blue top vs red support.
        expect(matchup(dataset, "1", Role.Top, Role.Support, "15")).toEqual({
            games: 2,
            wins: 1,
        });

        // Every ally/enemy pair is recorded: five enemies for each of ten players.
        const entries = Object.values(dataset.championData).flatMap((champion) =>
            [0, 1, 2, 3, 4].flatMap((role) =>
                [0, 1, 2, 3, 4].flatMap((enemyRole) =>
                    Object.values(
                        champion.statsByRole[role as Role].matchup[enemyRole as Role],
                    ),
                ),
            ),
        );
        expect(entries).toHaveLength(50);
        expect(entries.every((entry) => entry.games === 2)).toBe(true);
    });

    it("records synergies for team mates only, never with itself", () => {
        const accumulator = new DatasetAccumulator();
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        const dataset = accumulator.finish();

        expect(duo(dataset, "1", Role.Top, Role.Jungle, "2")).toEqual({
            games: 2,
            wins: 2,
        });
        expect(duo(dataset, "2", Role.Jungle, Role.Top, "1")).toEqual({
            games: 2,
            wins: 2,
        });
        // Losing side.
        expect(duo(dataset, "11", Role.Top, Role.Middle, "13")).toEqual({
            games: 2,
            wins: 0,
        });
        // Never with an opponent, never with itself.
        expect(duo(dataset, "1", Role.Top, Role.Top, "11")).toEqual({
            games: 0,
            wins: 0,
        });
        expect(duo(dataset, "1", Role.Top, Role.Top, "1")).toEqual({
            games: 0,
            wins: 0,
        });

        const synergyEntries = Object.values(dataset.championData).flatMap((champion) =>
            [0, 1, 2, 3, 4].flatMap((role) =>
                [0, 1, 2, 3, 4].flatMap((other) =>
                    Object.values(
                        champion.statsByRole[role as Role].synergy[other as Role],
                    ),
                ),
            ),
        );
        // Ten players, four team mates each.
        expect(synergyEntries).toHaveLength(40);
    });

    it("normalizes damage profiles into fractions that sum to one", () => {
        const accumulator = new DatasetAccumulator();
        accumulator.add(
            record(
                makeMatch({
                    blue: [
                        {
                            championKey: "1",
                            damage: { magic: 1000, physical: 3000, true: 0 },
                        },
                        "2",
                        "3",
                        "4",
                        "5",
                    ],
                    red: RED,
                    winner: 100,
                }),
            ),
        );
        accumulator.add(
            record(
                makeMatch({
                    blue: [
                        {
                            championKey: "1",
                            damage: { magic: 3000, physical: 1000, true: 2000 },
                        },
                        "2",
                        "3",
                        "4",
                        "5",
                    ],
                    red: RED,
                    winner: 200,
                }),
            ),
        );

        const dataset = accumulator.finish();
        const profile = dataset.championData["1"].statsByRole[Role.Top].damageProfile;

        // 4000 magic, 4000 physical, 2000 true out of 10000.
        expect(profile).toEqual({ magic: 0.4, physical: 0.4, true: 0.2 });
        expect(profile.magic + profile.physical + profile.true).toBeCloseTo(1, 10);
    });

    it("buckets games by duration, ignoring games under 20 minutes", () => {
        const accumulator = new DatasetAccumulator();
        // 18:00 — not bucketed. 22:00 — bucket 0. 33:00 — bucket 2. 61:00 — bucket 6.
        for (const duration of [18 * 60, 22 * 60, 33 * 60, 61 * 60]) {
            accumulator.add(
                record(makeMatch({ blue: BLUE, red: RED, winner: 100, duration })),
            );
        }
        const dataset = accumulator.finish();
        const buckets = dataset.championData["1"].statsByRole[Role.Top].statsByTime;

        expect(buckets).toHaveLength(7);
        expect(buckets.map((bucket) => bucket.games)).toEqual([1, 0, 1, 0, 0, 0, 1]);
        expect(buckets.map((bucket) => bucket.wins)).toEqual([1, 0, 1, 0, 0, 0, 1]);
        // Four games played, three of them long enough to be bucketed.
        expect(dataset.championData["1"].statsByRole[Role.Top].games).toBe(4);
    });

    it("prunes matchup and synergy entries below --min-games", () => {
        const accumulator = new DatasetAccumulator();
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 200 })));
        // One extra game against a different enemy top laner.
        accumulator.add(
            record(
                makeMatch({
                    blue: BLUE,
                    red: ["99", "12", "13", "14", "15"],
                    winner: 100,
                }),
            ),
        );

        const pruned = accumulator.finish({ minGames: 2 });
        expect(matchup(pruned, "1", Role.Top, Role.Top, "11")).toEqual({
            games: 2,
            wins: 1,
        });
        // The single game against "99" is gone, in both directions.
        expect(
            pruned.championData["1"].statsByRole[Role.Top].matchup[Role.Top]["99"],
        ).toBeUndefined();
        expect(
            pruned.championData["99"].statsByRole[Role.Top].matchup[Role.Top]["1"],
        ).toBeUndefined();
    });

    it("keeps leaf entries in DraftGap's minimal v5 shape", () => {
        const accumulator = new DatasetAccumulator();
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        const dataset = accumulator.finish();

        const leaf =
            dataset.championData["1"].statsByRole[Role.Top].matchup[Role.Top]["11"];
        expect(Object.keys(leaf).sort()).toEqual(["championKey", "games", "wins"]);
        expect(leaf.championKey).toBe("11");
    });

    it("sets version and date on the finished dataset", () => {
        const accumulator = new DatasetAccumulator({ date: "2026-08-26" });
        accumulator.add(record(makeMatch({ blue: BLUE, red: RED, winner: 100 })));
        const dataset = accumulator.finish();

        expect(dataset.version).toBe("5");
        expect(dataset.date).toBe("2026-08-26");
        expect(dataset.itemData).toEqual({});
    });
});
