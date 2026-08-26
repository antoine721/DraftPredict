import { Role } from "@draftpredict/core";
import { beforeEach, describe, expect, it } from "vitest";

import {
    makeMatch,
    makeParticipant,
    resetFixtureCounter,
} from "../testing/fixtures.js";
import { buildDraftFromMatch } from "./draft.js";
import {
    resolveDurationSeconds,
    summarizeMatch,
    summarizeMatchForAll,
    summarizeMatchOrNull,
} from "./summary.js";

beforeEach(() => {
    resetFixtureCounter();
});

describe("resolveDurationSeconds", () => {
    it("reads seconds when gameEndTimestamp is present", () => {
        const match = makeMatch({ gameDuration: 1_800 });
        expect(resolveDurationSeconds(match.info)).toBe(1_800);
    });

    it("converts milliseconds on pre-11.20 matches", () => {
        const match = makeMatch({ gameDuration: 1_800_000, gameEndTimestamp: null });
        expect(resolveDurationSeconds(match.info)).toBe(1_800);
    });

    it("keeps small values as seconds even without gameEndTimestamp", () => {
        const match = makeMatch({ gameDuration: 240, gameEndTimestamp: null });
        expect(resolveDurationSeconds(match.info)).toBe(240);
    });
});

describe("summarizeMatch", () => {
    it("summarises the requested player", () => {
        const match = makeMatch();
        const summary = summarizeMatch(match, "puuid-3");
        expect(summary.matchId).toBe("EUW1_1234567890");
        expect(summary.queue).toBe("Ranked Solo/Duo");
        expect(summary.role).toBe(Role.Middle);
        expect(summary.side).toBe("blue");
        expect(summary.win).toBe(true);
        expect(summary.championKey).toBe("103");
        expect(summary.durationMinutes).toBe(30);
        expect(summary.cs).toBe(160);
        expect(summary.csPerMinute).toBeCloseTo(160 / 30, 6);
        expect(summary.kda).toBe((5 + 5) / 5);
        expect(summary.spells).toEqual([4, 7]);
        expect(summary.items).toHaveLength(7);
        expect(summary.runes.keystone).toBe(8005);
        expect(summary.runes.primaryPath).toBe(8000);
        expect(summary.runes.shards).toEqual([5005, 5008, 5002]);
    });

    it("computes shares against the player's own team", () => {
        const match = makeMatch();
        const summary = summarizeMatch(match, "puuid-1");
        // Five identical players: every share is a fifth.
        expect(summary.damageShare).toBeCloseTo(0.2, 6);
        expect(summary.goldShare).toBeCloseTo(0.2, 6);
        expect(summary.deathShare).toBeCloseTo(0.2, 6);
        expect(summary.killParticipation).toBeCloseTo((5 + 5) / 25, 6);
        expect(summary.damageTakenShare).toBeCloseTo(0.2, 6);
    });

    it("prefers Riot's challenge values when present", () => {
        const participants = makeMatch().info.participants;
        participants[0]!.challenges = {
            killParticipation: 0.73,
            teamDamagePercentage: 0.31,
            damageTakenOnTeamPercentage: 0.28,
            visionScorePerMinute: 1.25,
            goldPerMinute: 512,
            soloKills: 3,
            dragonTakedowns: 2,
            baronTakedowns: 1,
            riftHeraldTakedowns: 1,
            turretTakedowns: 4,
        };
        const summary = summarizeMatch(makeMatch({ participants }), "puuid-1");
        expect(summary.killParticipation).toBe(0.73);
        expect(summary.damageShare).toBe(0.31);
        expect(summary.damageTakenShare).toBe(0.28);
        expect(summary.vision.scorePerMinute).toBe(1.25);
        expect(summary.goldPerMinute).toBe(512);
        expect(summary.soloKills).toBe(3);
        expect(summary.objectives.turretTakedowns).toBe(4);
        // 4 takedowns out of 1 baron + 3 dragons + 1 herald = 5 team objectives.
        expect(summary.objectives.participation).toBeCloseTo(4 / 5, 6);
    });

    it("exposes both teams, bans and the direct opponent", () => {
        const summary = summarizeMatch(makeMatch(), "puuid-2");
        expect(summary.team.teamId).toBe(100);
        expect(summary.enemyTeam.teamId).toBe(200);
        expect(summary.team.players).toHaveLength(5);
        expect(summary.team.bans).toEqual(["101"]);
        expect(summary.enemyTeam.bans).toEqual(["201"]);
        expect(summary.team.objectives.dragon).toBe(3);
        expect(summary.role).toBe(Role.Jungle);
        expect(summary.opponentChampionKey).toBe("107");
        expect(summary.opponentChampionName).toBe("Champion7");
    });

    it("produces a draft that both teams can be read from", () => {
        const summary = summarizeMatch(makeMatch(), "puuid-1");
        const draft = buildDraftFromMatch(summary);
        expect([...draft.ally.entries()]).toEqual([
            [Role.Top, "101"],
            [Role.Jungle, "102"],
            [Role.Middle, "103"],
            [Role.Bottom, "104"],
            [Role.Support, "105"],
        ]);
        expect(draft.opponent.get(Role.Top)).toBe("106");
        expect(draft.opponent.get(Role.Support)).toBe("110");
        expect(draft.bans.ally).toEqual(["101"]);
    });

    it("infers roles positionally when Riot has none", () => {
        const participants = Array.from({ length: 10 }, (_, index) =>
            makeParticipant({
                participantId: index + 1,
                teamId: index < 5 ? 100 : 200,
                win: index < 5,
                teamPosition: "",
                individualPosition: "Invalid",
                lane: "NONE",
                role: "NONE",
            }),
        );
        const summary = summarizeMatch(makeMatch({ participants }), "puuid-4");
        expect(summary.role).toBe(Role.Bottom);
        expect(summary.draft.ally).toHaveLength(5);
        expect(summary.draft.opponent).toHaveLength(5);
    });

    it("flags remakes and early surrenders", () => {
        expect(summarizeMatch(makeMatch({ gameDuration: 240 }), "puuid-1").remake).toBe(
            true,
        );
        const participants = makeMatch().info.participants;
        participants[0]!.gameEndedInEarlySurrender = true;
        expect(summarizeMatch(makeMatch({ participants }), "puuid-1").remake).toBe(
            true,
        );
        expect(summarizeMatch(makeMatch(), "puuid-1").remake).toBe(false);
    });

    it("returns null (or throws) for a player who was not in the match", () => {
        const match = makeMatch();
        expect(summarizeMatchOrNull(match, "nobody")).toBeNull();
        expect(() => summarizeMatch(match, "nobody")).toThrow(/not a participant/);
    });

    it("summarises every participant", () => {
        const summaries = summarizeMatchForAll(makeMatch());
        expect(summaries).toHaveLength(10);
        expect(summaries.filter((summary) => summary.win)).toHaveLength(5);
    });

    it("survives a zero-length game without dividing by zero", () => {
        const summary = summarizeMatch(makeMatch({ gameDuration: 0 }), "puuid-1");
        expect(Number.isFinite(summary.csPerMinute)).toBe(true);
        expect(summary.csPerMinute).toBe(0);
        expect(summary.remake).toBe(true);
    });
});
