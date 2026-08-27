import { describe, expect, it } from "vitest";
import type { MatchSummary } from "../../api";
import {
    MAX_SAVED_ACCOUNTS,
    POOL_MIN_GAMES,
    accountKey,
    axisVerdict,
    csPerMinuteByChampion,
    draftIsAnalysable,
    draftRows,
    drivingInput,
    formatAxisDelta,
    historyTotals,
    isApexTier,
    killLine,
    mainPoolRole,
    matchOutcome,
    normalizeRiotId,
    parseRiotId,
    poolExtremes,
    predictionVerdict,
    profileIconUrl,
    radarPoints,
    rankStats,
    removeAccount,
    riotIdError,
    sanitizeAccounts,
    seriesMarks,
    smoothedWinrate,
    sortPool,
    totalRoleGames,
    upsertAccount,
    type PoolEntry,
    type SavedAccount,
} from "./helpers";

/**
 * The reasoning of the account view.
 *
 * Two properties matter more than the rest. A winrate must never be ranked
 * without its sample — `poolExtremes` refuses thin champions and smooths the
 * rest — and a prediction must never be called "right" when the engine said
 * 50 %, which is what `predictionVerdict` guards.
 */

describe("parseRiotId", () => {
    it("accepts a well formed Riot ID and trims it", () => {
        expect(parseRiotId("  Faker # KR1 ")).toEqual({
            gameName: "Faker",
            tagLine: "KR1",
        });
    });

    it("rejects a missing or duplicated separator", () => {
        expect(parseRiotId("Faker")).toBeNull();
        expect(parseRiotId("Fa#ker#KR1")).toBeNull();
    });

    it("rejects names and tags outside Riot's limits", () => {
        expect(parseRiotId("ab#EUW")).toBeNull();
        expect(parseRiotId("Nom#E")).toBeNull();
        expect(parseRiotId("Nom#TROPLONG")).toBeNull();
        expect(parseRiotId("Nom#EU W")).toBeNull();
    });

    it("normalises spacing without losing the identity", () => {
        expect(normalizeRiotId(" Moi # EUW ")).toBe("Moi#EUW");
        // Unparsable input is returned trimmed, never silently mangled.
        expect(normalizeRiotId("  n'importe quoi ")).toBe("n'importe quoi");
    });
});

describe("riotIdError", () => {
    it("explains every failure in French, one cause at a time", () => {
        expect(riotIdError("")).toContain("Riot ID");
        expect(riotIdError("Faker")).toContain("tag");
        expect(riotIdError("a#b#c")).toContain("« # »");
        expect(riotIdError("ab#EUW")).toContain("3 caractères");
        expect(riotIdError("Nom#")).toContain("vide");
        expect(riotIdError("Nom#TOOLONG")).toContain("2 à 5");
    });

    it("returns null when the id can be submitted", () => {
        expect(riotIdError("Faker#KR1")).toBeNull();
    });
});

describe("saved accounts", () => {
    const account = (puuid: string, platform = "euw1"): SavedAccount => ({
        puuid,
        riotId: `${puuid}#EUW`,
        platform,
        source: "riot-id",
        lastUsedAt: 1,
    });

    it("keys an account by shard and puuid, case-insensitively", () => {
        expect(accountKey({ puuid: "p1", platform: "EUW1" })).toBe("euw1:p1");
    });

    it("moves a re-used account to the front instead of duplicating it", () => {
        const list = upsertAccount([account("a"), account("b")], {
            ...account("b"),
            lastUsedAt: 99,
        });
        expect(list.map((entry) => entry.puuid)).toEqual(["b", "a"]);
        expect(list[0]!.lastUsedAt).toBe(99);
    });

    it("keeps a Riot ID already known when the client reconnects without one", () => {
        const list = upsertAccount([account("a")], {
            puuid: "a",
            riotId: null,
            platform: "euw1",
            source: "lcu",
            lastUsedAt: 2,
        });
        expect(list[0]!.riotId).toBe("a#EUW");
        expect(list[0]!.source).toBe("lcu");
    });

    it("treats the same puuid on two shards as two accounts", () => {
        const list = upsertAccount([account("a", "euw1")], account("a", "na1"));
        expect(list).toHaveLength(2);
    });

    it("caps the list", () => {
        let list: SavedAccount[] = [];
        for (let index = 0; index < MAX_SAVED_ACCOUNTS + 3; index += 1) {
            list = upsertAccount(list, account(`p${index}`));
        }
        expect(list).toHaveLength(MAX_SAVED_ACCOUNTS);
        expect(list[0]!.puuid).toBe(`p${MAX_SAVED_ACCOUNTS + 2}`);
    });

    it("removes by key", () => {
        const list = removeAccount([account("a"), account("b")], "euw1:a");
        expect(list.map((entry) => entry.puuid)).toEqual(["b"]);
    });

    it("survives a corrupt localStorage payload", () => {
        expect(sanitizeAccounts(null)).toEqual([]);
        expect(sanitizeAccounts("nope")).toEqual([]);
        expect(
            sanitizeAccounts([
                { puuid: "", platform: "euw1" },
                { puuid: "ok", platform: "euw1", riotId: 42, lastUsedAt: "x" },
            ]),
        ).toEqual([
            {
                puuid: "ok",
                riotId: null,
                platform: "euw1",
                source: "riot-id",
                lastUsedAt: 0,
            },
        ]);
    });
});

describe("ranks", () => {
    it("counts games from wins and losses, never from a total field", () => {
        expect(
            rankStats({
                queueType: "RANKED_SOLO_5x5",
                leaguePoints: 4,
                wins: 3,
                losses: 1,
            }),
        ).toEqual({ games: 4, wins: 3, losses: 1, winrate: 0.75 });
    });

    it("reports an unranked queue as zero rather than NaN", () => {
        expect(rankStats(undefined)).toEqual({
            games: 0,
            wins: 0,
            losses: 0,
            winrate: 0,
        });
    });

    it("translates a promotion series", () => {
        expect(seriesMarks("WLN")).toEqual(["V", "D", "—"]);
        expect(seriesMarks(null)).toEqual([]);
    });

    it("knows the apex tiers have no meaningful division", () => {
        expect(isApexTier("challenger")).toBe(true);
        expect(isApexTier("EMERALD")).toBe(false);
        expect(isApexTier(null)).toBe(false);
    });

    it("only builds an icon URL when the patch is known", () => {
        expect(profileIconUrl("16.17.1", 4568)).toContain(
            "/cdn/16.17.1/img/profileicon/4568.png",
        );
        expect(profileIconUrl(null, 4568)).toBeNull();
        expect(profileIconUrl("16.17.1", null)).toBeNull();
    });
});

describe("axes", () => {
    it("reads a score against the role baseline, not in absolute terms", () => {
        expect(axisVerdict(71).tone).toBe("positive");
        expect(axisVerdict(50).tone).toBe("neutral");
        expect(axisVerdict(41).tone).toBe("negative");
        expect(axisVerdict(58).delta).toBe(8);
    });

    it("formats a delta in points, with a French sign", () => {
        expect(formatAxisDelta(11.4)).toBe("+11 pts");
        expect(formatAxisDelta(-1)).toBe("-1 pt");
        expect(formatAxisDelta(0.2)).toBe("±0 pt");
    });

    it("always emits one radar point per axis, in the given order", () => {
        const axes = {
            aggression: 71,
            farming: 58,
            vision: 34,
            objectives: 62,
            survivability: 45,
            teamplay: 55,
            consistency: 61,
            scaling: 49,
        };
        const points = radarPoints(axes, ["vision", "farming"]);
        expect(points).toEqual([
            { axis: "vision", score: 34, baseline: 50 },
            { axis: "farming", score: 58, baseline: 50 },
        ]);
    });

    it("picks the metric that moved the axis furthest, weight included", () => {
        const detail = {
            axis: "vision",
            score: 34,
            sampleSize: 20,
            lowConfidence: false,
            description: "",
            inputs: [
                { metric: "visionScorePerMinute", weight: 0.45, raw: 0.4, score: 30 },
                { metric: "controlWardsPerGame", weight: 0.2, raw: 0.5, score: 5 },
            ],
        } as const;
        expect(drivingInput(detail).metric).toBe("visionScorePerMinute");
        expect(drivingInput(null)).toBeNull();
    });
});

describe("champion pool", () => {
    const entry = (
        key: string,
        games: number,
        wins: number,
        extra: Partial<PoolEntry> = {},
    ): PoolEntry => ({
        championKey: key,
        championName: `Champion ${key}`,
        games,
        wins,
        losses: games - wins,
        winrate: games > 0 ? wins / games : 0,
        kda: 2.5,
        performance: 55,
        roles: [{ role: 0, games }],
        ...extra,
    });

    it("refuses to rank a champion played twice", () => {
        const { best, ignored } = poolExtremes([
            entry("1", 2, 2),
            entry("2", 20, 12),
            entry("3", 18, 4),
        ]);
        expect(best.map((row) => row.championKey)).not.toContain("1");
        expect(best[0]!.championKey).toBe("2");
        expect(ignored).toBe(1);
        expect(POOL_MIN_GAMES).toBeGreaterThan(2);
    });

    it("never puts the same champion in best and worst", () => {
        const { best, worst } = poolExtremes([entry("1", 10, 6)], 3);
        expect(best.map((row) => row.championKey)).toEqual(["1"]);
        expect(worst).toEqual([]);
    });

    it("smooths a winrate so a small sample cannot top the list", () => {
        expect(smoothedWinrate({ wins: 2, games: 2 })).toBeCloseTo(0.75, 5);
        expect(smoothedWinrate({ wins: 30, games: 40 })).toBeCloseTo(0.7381, 3);
    });

    it("sorts on the requested column, games as the tie-break", () => {
        const rows = [entry("a", 4, 4), entry("b", 40, 26)];
        // The table sorts on the smoothed winrate, so a 4-0 champion can still
        // lead it — which is exactly why the best/worst lists apply a minimum
        // number of games on top of the same ordering.
        expect(sortPool(rows, "winrate")[0]!.championKey).toBe("a");
        expect(sortPool(rows, "games")[0]!.championKey).toBe("b");
        expect(
            sortPool(
                [
                    entry("a", 4, 2, { masteryPoints: 10 }),
                    entry("b", 4, 2, { masteryPoints: 99 }),
                ],
                "mastery",
            )[0]!.championKey,
        ).toBe("b");
    });

    it("takes the most played role as the main one", () => {
        expect(
            mainPoolRole(
                entry("a", 9, 4, {
                    roles: [
                        { role: 2, games: 3 },
                        { role: 4, games: 6 },
                    ],
                }),
            ),
        ).toBe(4);
        expect(mainPoolRole(entry("a", 0, 0, { roles: [] }))).toBeNull();
    });

    it("sums the games of a role distribution", () => {
        expect(
            totalRoleGames([
                { role: 0, games: 12, share: 0.6, wins: 7, winrate: 0.58 },
                { role: 1, games: 8, share: 0.4, wins: 3, winrate: 0.375 },
            ]),
        ).toBe(20);
    });
});

// --------------------------------------------------------------- matches ---

function match(overrides: Partial<MatchSummary> = {}): MatchSummary {
    return {
        matchId: "EUW1_1",
        championKey: "266",
        championName: "Aatrox",
        remake: false,
        win: true,
        kills: 8,
        deaths: 3,
        assists: 6,
        cs: 214,
        durationMinutes: 29.5,
        draft: {
            ally: [[0, "266"]],
            opponent: [[0, "122"]],
            bans: { ally: [], opponent: [] },
        },
        ...overrides,
    } as MatchSummary;
}

describe("match rows", () => {
    it("calls a remake a remake instead of a defeat", () => {
        expect(matchOutcome(match({ remake: true, win: false })).tone).toBe("neutral");
        expect(matchOutcome(match({ win: false })).label).toBe("Défaite");
    });

    it("writes the kill line in the universal order", () => {
        expect(killLine({ kills: 8, deaths: 3, assists: 6 })).toBe("8 / 3 / 6");
    });

    it("excludes remakes from the totals and counts them apart", () => {
        const totals = historyTotals([
            match({ win: true }),
            match({ win: false, kills: 1, deaths: 5, assists: 2 }),
            match({ remake: true, win: false, kills: 0, deaths: 0, assists: 0 }),
        ]);
        expect(totals.games).toBe(2);
        expect(totals.remakes).toBe(1);
        expect(totals.winrate).toBe(0.5);
        expect(totals.kda).toBeCloseTo((9 + 8) / 8, 5);
    });

    it("measures CS per minute per champion and skips remakes", () => {
        const map = csPerMinuteByChampion([
            match({ championKey: "266", cs: 200, durationMinutes: 20 }),
            match({ championKey: "266", cs: 100, durationMinutes: 20 }),
            match({ championKey: "122", cs: 999, durationMinutes: 30, remake: true }),
        ]);
        expect(map.get("266")).toEqual({ csPerMinute: 7.5, games: 2 });
        expect(map.has("122")).toBe(false);
    });
});

describe("predictionVerdict", () => {
    it("writes the sentence the feature exists for", () => {
        const verdict = predictionVerdict(0.47, { win: false, remake: false });
        expect(verdict!.sentence).toBe("prédit 47 %, résultat : défaite");
        expect(verdict!.correct).toBe(true);
        expect(verdict!.tone).toBe("positive");
    });

    it("marks a prediction the game contradicted", () => {
        const verdict = predictionVerdict(0.62, { win: false, remake: false });
        expect(verdict!.correct).toBe(false);
        expect(verdict!.label).toBe("Draft démenti");
        expect(verdict!.surprise).toBeCloseTo(0.62, 5);
    });

    it("refuses to score a coin flip as right or wrong", () => {
        const verdict = predictionVerdict(0.503, { win: true, remake: false });
        expect(verdict!.correct).toBeNull();
        expect(verdict!.label).toBe("Draft équilibré");
    });

    it("says nothing about a remake", () => {
        expect(
            predictionVerdict(0.7, { win: false, remake: true })!.correct,
        ).toBeNull();
    });

    it("returns null when there is no analysis", () => {
        expect(predictionVerdict(null, { win: true, remake: false })).toBeNull();
        expect(predictionVerdict(Number.NaN, { win: true, remake: false })).toBeNull();
    });
});

describe("draft replay", () => {
    it("lines both teams up role by role, holes included", () => {
        expect(
            draftRows(
                {
                    ally: [[0, "266"]],
                    opponent: [
                        [0, "122"],
                        [2, "157"],
                    ],
                    bans: { ally: [], opponent: [] },
                },
                [0, 1, 2],
            ),
        ).toEqual([
            { role: 0, ally: "266", enemy: "122" },
            { role: 1, ally: null, enemy: null },
            { role: 2, ally: null, enemy: "157" },
        ]);
    });

    it("only analyses a draft that has both teams", () => {
        expect(draftIsAnalysable(match().draft)).toBe(true);
        expect(
            draftIsAnalysable({
                ally: [[0, "266"]],
                opponent: [],
                bans: { ally: [], opponent: [] },
            }),
        ).toBe(false);
        expect(draftIsAnalysable(null)).toBe(false);
    });
});
