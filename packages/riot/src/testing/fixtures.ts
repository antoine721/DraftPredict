/**
 * Test-only fixture builders. Not exported from `src/index.ts` and excluded
 * from the build; import them by relative path from `*.test.ts` files.
 */
import { Role, serializeDraftState, emptyDraftState } from "@draftpredict/core";

import type { MatchSummary, MatchTeamSummary } from "../match/summary.js";
import type { MatchDto, ParticipantDto, TeamDto } from "../types/match.js";

let counter = 0;

export function resetFixtureCounter(): void {
    counter = 0;
}

export type ParticipantOptions = Partial<ParticipantDto> & {
    puuid?: string;
    teamId?: number;
    championId?: number;
};

export function makeParticipant(options: ParticipantOptions = {}): ParticipantDto {
    counter += 1;
    const participantId = options.participantId ?? counter;
    const teamId = options.teamId ?? (participantId <= 5 ? 100 : 200);
    return {
        puuid: `puuid-${participantId}`,
        participantId,
        teamId,
        win: teamId === 100,
        championId: 100 + participantId,
        championName: `Champion${participantId}`,
        champLevel: 16,
        teamPosition: "",
        individualPosition: "",
        lane: "NONE",
        role: "NONE",
        kills: 5,
        deaths: 5,
        assists: 5,
        totalMinionsKilled: 150,
        neutralMinionsKilled: 10,
        goldEarned: 12_000,
        totalDamageDealtToChampions: 20_000,
        physicalDamageDealtToChampions: 12_000,
        magicDamageDealtToChampions: 7_000,
        trueDamageDealtToChampions: 1_000,
        damageDealtToObjectives: 8_000,
        damageDealtToTurrets: 3_000,
        totalDamageTaken: 25_000,
        damageSelfMitigated: 15_000,
        totalHealsOnTeammates: 0,
        totalDamageShieldedOnTeammates: 0,
        visionScore: 20,
        wardsPlaced: 10,
        wardsKilled: 3,
        detectorWardsPlaced: 2,
        dragonKills: 0,
        baronKills: 0,
        turretKills: 1,
        inhibitorKills: 0,
        largestMultiKill: 1,
        firstBloodKill: false,
        item0: 3006,
        item1: 6672,
        item2: 3031,
        item3: 3072,
        item4: 3036,
        item5: 3026,
        item6: 3363,
        summoner1Id: 4,
        summoner2Id: 7,
        perks: {
            statPerks: { defense: 5002, flex: 5008, offense: 5005 },
            styles: [
                {
                    description: "primaryStyle",
                    style: 8000,
                    selections: [
                        { perk: 8005, var1: 0, var2: 0, var3: 0 },
                        { perk: 9111, var1: 0, var2: 0, var3: 0 },
                    ],
                },
                {
                    description: "subStyle",
                    style: 8300,
                    selections: [{ perk: 8347, var1: 0, var2: 0, var3: 0 }],
                },
            ],
        },
        challenges: {},
        ...options,
    };
}

export type MatchOptions = {
    matchId?: string;
    queueId?: number;
    gameDuration?: number;
    gameEndTimestamp?: number | null;
    gameCreation?: number;
    participants?: ParticipantDto[];
    teams?: TeamDto[];
    gameMode?: string;
    platformId?: string;
};

/** A ten-player match with roles filled in `TOP…UTILITY` order per team. */
export function makeMatch(options: MatchOptions = {}): MatchDto {
    const positions = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
    const participants =
        options.participants ??
        Array.from({ length: 10 }, (_, index) =>
            makeParticipant({
                participantId: index + 1,
                teamId: index < 5 ? 100 : 200,
                win: index < 5,
                teamPosition: positions[index % 5],
                individualPosition: positions[index % 5],
                championId: 100 + index + 1,
            }),
        );
    const teams: TeamDto[] =
        options.teams ??
        [100, 200].map((teamId) => ({
            teamId,
            win: teamId === 100,
            bans: [
                { championId: teamId + 1, pickTurn: 1 },
                { championId: -1, pickTurn: 2 },
            ],
            objectives: {
                baron: { first: teamId === 100, kills: teamId === 100 ? 1 : 0 },
                champion: { first: true, kills: 25 },
                dragon: { first: true, kills: teamId === 100 ? 3 : 1 },
                inhibitor: { first: true, kills: teamId === 100 ? 2 : 0 },
                riftHerald: { first: true, kills: 1 },
                tower: { first: true, kills: teamId === 100 ? 9 : 3 },
            },
        }));
    const gameCreation = options.gameCreation ?? 1_700_000_000_000;
    const gameDuration = options.gameDuration ?? 1_800;
    const gameEndTimestamp =
        options.gameEndTimestamp === null
            ? undefined
            : (options.gameEndTimestamp ?? gameCreation + gameDuration * 1000);
    return {
        metadata: {
            dataVersion: "2",
            matchId: options.matchId ?? "EUW1_1234567890",
            participants: participants.map((participant) => participant.puuid),
        },
        info: {
            gameId: 1_234_567_890,
            gameCreation,
            gameDuration,
            gameStartTimestamp: gameCreation,
            gameEndTimestamp,
            gameMode: options.gameMode ?? "CLASSIC",
            gameType: "MATCHED_GAME",
            gameVersion: "14.1.554.1945",
            mapId: 11,
            platformId: options.platformId ?? "EUW1",
            queueId: options.queueId ?? 420,
            participants,
            teams,
        },
    };
}

// --- MatchSummary fixtures ------------------------------------------------

export type SummaryOptions = {
    matchId?: string;
    puuid?: string;
    championKey?: string;
    championName?: string;
    role?: Role | null;
    win?: boolean;
    durationSeconds?: number;
    queueId?: number;
    gameStart?: number;
    remake?: boolean;
    kills?: number;
    deaths?: number;
    assists?: number;
    killParticipation?: number;
    deathShare?: number;
    csPerMinute?: number;
    goldPerMinute?: number;
    goldShare?: number;
    damageShare?: number;
    damageTakenShare?: number;
    visionScorePerMinute?: number;
    wardsPlaced?: number;
    wardsKilled?: number;
    controlWards?: number;
    objectiveParticipation?: number;
    objectiveDamagePerMinute?: number;
    turretDamagePerMinute?: number;
    soloKills?: number;
    healShieldPerMinute?: number;
    opponentChampionKey?: string | null;
};

const emptyTeam = (teamId: number, win: boolean): MatchTeamSummary => ({
    teamId,
    side: teamId === 100 ? "blue" : "red",
    win,
    bans: [],
    objectives: {
        baron: 1,
        champion: 25,
        dragon: 3,
        horde: 0,
        inhibitor: 1,
        riftHerald: 1,
        tower: 8,
    },
    kills: 25,
    deaths: 20,
    gold: 60_000,
    damageToChampions: 90_000,
    damageTaken: 100_000,
    players: [],
});

/**
 * A fully-formed {@link MatchSummary}, with every rate expressed per minute so
 * playstyle tests can dial one metric at a time.
 */
export function makeSummary(options: SummaryOptions = {}): MatchSummary {
    counter += 1;
    const durationSeconds = options.durationSeconds ?? 1_800;
    const minutes = durationSeconds / 60;
    const kills = options.kills ?? 5;
    const deaths = options.deaths ?? 5;
    const assists = options.assists ?? 8;
    const role = options.role === undefined ? Role.Middle : options.role;
    const win = options.win ?? true;
    const championKey = options.championKey ?? "1";
    const csPerMinute = options.csPerMinute ?? 7;
    const team = emptyTeam(100, win);
    const enemyTeam = emptyTeam(200, !win);

    const draft = emptyDraftState();
    if (role !== null) draft.ally.set(role, championKey);
    const opponentChampionKey =
        options.opponentChampionKey === undefined ? "2" : options.opponentChampionKey;
    if (role !== null && opponentChampionKey !== null) {
        draft.opponent.set(role, opponentChampionKey);
    }

    return {
        matchId: options.matchId ?? `EUW1_${counter}`,
        platformId: "EUW1",
        queueId: options.queueId ?? 420,
        queue: "Ranked Solo/Duo",
        gameMode: "CLASSIC",
        gameType: "MATCHED_GAME",
        gameVersion: "14.1.554.1945",
        mapId: 11,
        gameCreation: options.gameStart ?? 1_700_000_000_000 + counter * 3_600_000,
        gameStart: options.gameStart ?? 1_700_000_000_000 + counter * 3_600_000,
        gameEnd:
            (options.gameStart ?? 1_700_000_000_000 + counter * 3_600_000) +
            durationSeconds * 1000,
        durationSeconds,
        durationMinutes: minutes,
        remake: options.remake ?? durationSeconds < 300,

        puuid: options.puuid ?? "puuid-test",
        participantId: 1,
        riotId: "Tester#EUW",
        summonerName: "Tester",

        championId: Number(championKey),
        championKey,
        championName: options.championName ?? `Champion${championKey}`,
        champLevel: 16,

        role,
        teamPosition: "MIDDLE",
        lane: "MIDDLE",
        teamId: 100,
        side: "blue",
        win,

        kills,
        deaths,
        assists,
        kda: (kills + assists) / Math.max(1, deaths),
        killParticipation: options.killParticipation ?? 0.55,
        deathShare: options.deathShare ?? 0.2,

        cs: csPerMinute * minutes,
        csPerMinute,
        gold: (options.goldPerMinute ?? 400) * minutes,
        goldPerMinute: options.goldPerMinute ?? 400,
        goldShare: options.goldShare ?? 0.22,

        damage: {
            toChampions: 22_000,
            physical: 12_000,
            magic: 9_000,
            true: 1_000,
            taken: 25_000,
            mitigated: 12_000,
            toObjectives: (options.objectiveDamagePerMinute ?? 250) * minutes,
            toTurrets: (options.turretDamagePerMinute ?? 90) * minutes,
        },
        damageShare: options.damageShare ?? 0.27,
        damageTakenShare: options.damageTakenShare ?? 0.2,
        healingAndShielding: (options.healShieldPerMinute ?? 15) * minutes,

        vision: {
            score: (options.visionScorePerMinute ?? 0.6) * minutes,
            scorePerMinute: options.visionScorePerMinute ?? 0.6,
            wardsPlaced: options.wardsPlaced ?? 12,
            wardsKilled: options.wardsKilled ?? 3,
            controlWardsPlaced: options.controlWards ?? 2,
        },
        objectives: {
            dragonTakedowns: 2,
            baronTakedowns: 1,
            heraldTakedowns: 1,
            turretTakedowns: 2,
            inhibitorKills: 1,
            participation: options.objectiveParticipation ?? 0.4,
        },

        soloKills: options.soloKills ?? 1,
        largestMultiKill: 2,
        firstBlood: false,

        items: [3006, 6672, 3031, 3072, 3036, 3026, 3363],
        runes: {
            primaryPath: 8000,
            keystone: 8005,
            primary: [8005, 9111],
            secondaryPath: 8300,
            secondary: [8347],
            shards: [5005, 5008, 5002],
        },
        spells: [4, 7],

        opponentChampionKey,
        opponentChampionName:
            opponentChampionKey === null ? null : `Champion${opponentChampionKey}`,

        team,
        enemyTeam,
        teams: [team, enemyTeam],
        draft: serializeDraftState(draft),
    };
}
