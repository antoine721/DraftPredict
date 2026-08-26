import {
    Role,
    serializeDraftState,
    type SerializedDraftState,
    emptyDraftState,
} from "@draftpredict/core";

import type {
    MatchDto,
    MatchInfoDto,
    ParticipantDto,
    TeamDto,
} from "../types/match.js";
import { getQueueName } from "./queues.js";
import { assignTeamRoles, normalizeRole } from "./roles.js";

/** Anything shorter than this is a remake and is never worth analysing. */
export const REMAKE_DURATION_SECONDS = 300;

export type MatchSide = "blue" | "red";

export type MatchDamageSummary = {
    toChampions: number;
    physical: number;
    magic: number;
    true: number;
    taken: number;
    mitigated: number;
    toObjectives: number;
    toTurrets: number;
};

export type MatchVisionSummary = {
    score: number;
    scorePerMinute: number;
    wardsPlaced: number;
    wardsKilled: number;
    controlWardsPlaced: number;
};

export type MatchObjectiveSummary = {
    dragonTakedowns: number;
    baronTakedowns: number;
    heraldTakedowns: number;
    turretTakedowns: number;
    inhibitorKills: number;
    /** Share of the team's epic objectives the player was present for, 0..1. */
    participation: number;
};

export type MatchRunesSummary = {
    primaryPath: number;
    keystone: number;
    primary: number[];
    secondaryPath: number;
    secondary: number[];
    /** Offense, flex, defense shard ids, in that order. */
    shards: number[];
};

export type MatchTeamObjectiveCounts = {
    baron: number;
    champion: number;
    dragon: number;
    horde: number;
    inhibitor: number;
    riftHerald: number;
    tower: number;
};

export type MatchPlayerSummary = {
    puuid: string;
    participantId: number;
    championId: number;
    /** Numeric champion id as a string — the `@draftpredict/core` dataset key. */
    championKey: string;
    championName: string;
    role: Role | null;
    teamId: number;
    win: boolean;
    kills: number;
    deaths: number;
    assists: number;
    riotId?: string;
    summonerName?: string;
};

export type MatchTeamSummary = {
    teamId: number;
    side: MatchSide;
    win: boolean;
    /** Banned champion keys, unpicked bans (`-1`) removed. */
    bans: string[];
    objectives: MatchTeamObjectiveCounts;
    kills: number;
    deaths: number;
    gold: number;
    damageToChampions: number;
    damageTaken: number;
    players: MatchPlayerSummary[];
};

/**
 * Everything DraftPredict needs from one finished game, from the point of view
 * of one player: their line, the team context needed to turn raw numbers into
 * shares, and the full draft so the game can be replayed through the engine.
 */
export type MatchSummary = {
    matchId: string;
    platformId: string;
    queueId: number;
    queue: string;
    gameMode: string;
    gameType: string;
    gameVersion: string;
    mapId: number;
    /** Epoch ms. */
    gameCreation: number;
    gameStart: number;
    gameEnd: number;
    durationSeconds: number;
    durationMinutes: number;
    /** Sub-5-minute game or early surrender: excluded from every statistic. */
    remake: boolean;

    puuid: string;
    participantId: number;
    riotId?: string;
    summonerName?: string;

    championId: number;
    championKey: string;
    championName: string;
    champLevel: number;

    role: Role | null;
    teamPosition: string;
    lane: string;
    teamId: number;
    side: MatchSide;
    win: boolean;

    kills: number;
    deaths: number;
    assists: number;
    /** `(kills + assists) / max(1, deaths)`. */
    kda: number;
    /** Share of the team's kills the player took part in, 0..1. */
    killParticipation: number;
    /** Share of the team's deaths that were the player's, 0..1. */
    deathShare: number;

    cs: number;
    csPerMinute: number;
    gold: number;
    goldPerMinute: number;
    goldShare: number;

    damage: MatchDamageSummary;
    /** Share of the team's champion damage, 0..1. */
    damageShare: number;
    /** Share of the damage the team took, 0..1. */
    damageTakenShare: number;
    /** Healing + shielding put on teammates, per game. */
    healingAndShielding: number;

    vision: MatchVisionSummary;
    objectives: MatchObjectiveSummary;

    soloKills: number;
    largestMultiKill: number;
    firstBlood: boolean;

    items: number[];
    runes: MatchRunesSummary;
    /** `[summoner1Id, summoner2Id]`. */
    spells: [number, number];

    /** Enemy laner in the same role, when the draft could be resolved. */
    opponentChampionKey: string | null;
    opponentChampionName: string | null;

    team: MatchTeamSummary;
    enemyTeam: MatchTeamSummary;
    /** Both teams, ally first. */
    teams: [MatchTeamSummary, MatchTeamSummary];
    /** Ally team as `ally`, enemy as `opponent`; ready for the draft engine. */
    draft: SerializedDraftState;
};

/**
 * `gameDuration` is expressed in seconds since patch 11.20 (recognisable by the
 * presence of `gameEndTimestamp`) and in milliseconds before that.
 */
export function resolveDurationSeconds(info: MatchInfoDto): number {
    const raw = info.gameDuration ?? 0;
    if (info.gameEndTimestamp === undefined && raw > 10_000) {
        return Math.round(raw / 1000);
    }
    return Math.round(raw);
}

function perMinute(value: number, minutes: number): number {
    if (minutes <= 0) return 0;
    return value / minutes;
}

function share(value: number, total: number): number {
    if (total <= 0) return 0;
    return clamp01(value / total);
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

function sideOf(teamId: number): MatchSide {
    return teamId === 200 ? "red" : "blue";
}

function riotIdOf(participant: ParticipantDto): string | undefined {
    const name = participant.riotIdGameName?.trim();
    const tag = participant.riotIdTagline?.trim();
    if (!name || !tag) return undefined;
    return `${name}#${tag}`;
}

function objectiveCounts(team: TeamDto | undefined): MatchTeamObjectiveCounts {
    const objectives = team?.objectives ?? {};
    return {
        baron: objectives.baron?.kills ?? 0,
        champion: objectives.champion?.kills ?? 0,
        dragon: objectives.dragon?.kills ?? 0,
        horde: objectives.horde?.kills ?? 0,
        inhibitor: objectives.inhibitor?.kills ?? 0,
        riftHerald: objectives.riftHerald?.kills ?? 0,
        tower: objectives.tower?.kills ?? 0,
    };
}

function runesOf(participant: ParticipantDto): MatchRunesSummary {
    const styles = participant.perks?.styles ?? [];
    const primary = styles.find((style) => style.description === "primaryStyle") ?? styles[0];
    const secondary =
        styles.find((style) => style.description === "subStyle") ?? styles[1];
    const primarySelections = (primary?.selections ?? []).map((s) => s.perk);
    const secondarySelections = (secondary?.selections ?? []).map((s) => s.perk);
    const stats = participant.perks?.statPerks;
    return {
        primaryPath: primary?.style ?? 0,
        keystone: primarySelections[0] ?? 0,
        primary: primarySelections,
        secondaryPath: secondary?.style ?? 0,
        secondary: secondarySelections,
        shards: stats ? [stats.offense, stats.flex, stats.defense] : [],
    };
}

function toPlayerSummary(
    participant: ParticipantDto,
    role: Role | null,
): MatchPlayerSummary {
    return {
        puuid: participant.puuid,
        participantId: participant.participantId,
        championId: participant.championId,
        championKey: String(participant.championId),
        championName: participant.championName,
        role,
        teamId: participant.teamId,
        win: participant.win,
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists,
        riotId: riotIdOf(participant),
        summonerName: participant.summonerName,
    };
}

function teamSummary(
    teamId: number,
    participants: ParticipantDto[],
    teams: TeamDto[],
    roles: Map<ParticipantDto, Role>,
): MatchTeamSummary {
    const team = teams.find((entry) => entry.teamId === teamId);
    const members = participants.filter(
        (participant) => participant.teamId === teamId,
    );
    const sum = (pick: (p: ParticipantDto) => number): number =>
        members.reduce((total, participant) => total + (pick(participant) || 0), 0);
    return {
        teamId,
        side: sideOf(teamId),
        win: team?.win ?? members[0]?.win ?? false,
        bans: (team?.bans ?? [])
            .filter((ban) => ban.championId > 0)
            .map((ban) => String(ban.championId)),
        objectives: objectiveCounts(team),
        kills: sum((p) => p.kills),
        deaths: sum((p) => p.deaths),
        gold: sum((p) => p.goldEarned),
        damageToChampions: sum((p) => p.totalDamageDealtToChampions),
        damageTaken: sum((p) => p.totalDamageTaken),
        players: members.map((participant) =>
            toPlayerSummary(participant, roles.get(participant) ?? null),
        ),
    };
}

/**
 * Reduces a match-v5 payload to a {@link MatchSummary} for `puuid`.
 *
 * Throws when the player did not take part in the match; use
 * {@link summarizeMatchOrNull} when that is expected.
 */
export function summarizeMatch(match: MatchDto, puuid: string): MatchSummary {
    const summary = summarizeMatchOrNull(match, puuid);
    if (!summary) {
        throw new Error(
            `Player ${puuid} is not a participant of match ${match.info?.gameId ?? "?"}`,
        );
    }
    return summary;
}

export function summarizeMatchOrNull(
    match: MatchDto,
    puuid: string,
): MatchSummary | null {
    const info = match.info;
    const participants = info?.participants ?? [];
    const me = participants.find((participant) => participant.puuid === puuid);
    if (!me) return null;

    const teams = info.teams ?? [];
    const durationSeconds = resolveDurationSeconds(info);
    const minutes = durationSeconds / 60;
    const challenges = me.challenges ?? {};

    // Roles are resolved per team so the two lists stay collision-free.
    const roles = new Map<ParticipantDto, Role>();
    for (const teamId of [100, 200]) {
        const members = participants.filter((p) => p.teamId === teamId);
        const assigned = assignTeamRoles(members, (participant) =>
            normalizeRole(
                participant.teamPosition,
                participant.individualPosition,
                participant.lane,
                participant.role,
            ),
        );
        for (const [participant, role] of assigned) roles.set(participant, role);
    }

    const enemyTeamId = me.teamId === 100 ? 200 : 100;
    const team = teamSummary(me.teamId, participants, teams, roles);
    const enemyTeam = teamSummary(enemyTeamId, participants, teams, roles);

    const myRole = roles.get(me) ?? null;
    const opponent =
        myRole === null
            ? undefined
            : enemyTeam.players.find((player) => player.role === myRole);

    const cs = (me.totalMinionsKilled ?? 0) + (me.neutralMinionsKilled ?? 0);
    const teamObjectives =
        team.objectives.dragon + team.objectives.baron + team.objectives.riftHerald;
    const dragonTakedowns = challenges.dragonTakedowns ?? me.dragonKills ?? 0;
    const baronTakedowns = challenges.baronTakedowns ?? me.baronKills ?? 0;
    const heraldTakedowns = challenges.riftHeraldTakedowns ?? 0;

    const draft = emptyDraftState();
    for (const player of team.players) {
        if (player.role !== null) draft.ally.set(player.role, player.championKey);
    }
    for (const player of enemyTeam.players) {
        if (player.role !== null) draft.opponent.set(player.role, player.championKey);
    }
    draft.bans.ally = [...team.bans];
    draft.bans.opponent = [...enemyTeam.bans];

    const remake =
        durationSeconds < REMAKE_DURATION_SECONDS ||
        me.gameEndedInEarlySurrender === true;

    return {
        matchId: match.metadata?.matchId ?? `${info.platformId}_${info.gameId}`,
        platformId: info.platformId,
        queueId: info.queueId,
        queue: getQueueName(info.queueId),
        gameMode: info.gameMode,
        gameType: info.gameType,
        gameVersion: info.gameVersion,
        mapId: info.mapId,
        gameCreation: info.gameCreation,
        gameStart: info.gameStartTimestamp ?? info.gameCreation,
        gameEnd:
            info.gameEndTimestamp ??
            (info.gameStartTimestamp ?? info.gameCreation) + durationSeconds * 1000,
        durationSeconds,
        durationMinutes: minutes,
        remake,

        puuid,
        participantId: me.participantId,
        riotId: riotIdOf(me),
        summonerName: me.summonerName,

        championId: me.championId,
        championKey: String(me.championId),
        championName: me.championName,
        champLevel: me.champLevel,

        role: myRole,
        teamPosition: me.teamPosition ?? "",
        lane: me.lane ?? "",
        teamId: me.teamId,
        side: sideOf(me.teamId),
        win: me.win,

        kills: me.kills,
        deaths: me.deaths,
        assists: me.assists,
        kda: (me.kills + me.assists) / Math.max(1, me.deaths),
        killParticipation:
            challenges.killParticipation ??
            share(me.kills + me.assists, team.kills),
        deathShare: share(me.deaths, team.deaths),

        cs,
        csPerMinute: perMinute(cs, minutes),
        gold: me.goldEarned,
        goldPerMinute: challenges.goldPerMinute ?? perMinute(me.goldEarned, minutes),
        goldShare: share(me.goldEarned, team.gold),

        damage: {
            toChampions: me.totalDamageDealtToChampions,
            physical: me.physicalDamageDealtToChampions ?? 0,
            magic: me.magicDamageDealtToChampions ?? 0,
            true: me.trueDamageDealtToChampions ?? 0,
            taken: me.totalDamageTaken,
            mitigated: me.damageSelfMitigated ?? 0,
            toObjectives: me.damageDealtToObjectives ?? 0,
            toTurrets: me.damageDealtToTurrets ?? 0,
        },
        damageShare:
            challenges.teamDamagePercentage ??
            share(me.totalDamageDealtToChampions, team.damageToChampions),
        damageTakenShare:
            challenges.damageTakenOnTeamPercentage ??
            share(me.totalDamageTaken, team.damageTaken),
        healingAndShielding:
            (me.totalHealsOnTeammates ?? 0) + (me.totalDamageShieldedOnTeammates ?? 0),

        vision: {
            score: me.visionScore,
            scorePerMinute:
                challenges.visionScorePerMinute ?? perMinute(me.visionScore, minutes),
            wardsPlaced: me.wardsPlaced ?? 0,
            wardsKilled: me.wardsKilled ?? 0,
            controlWardsPlaced:
                me.detectorWardsPlaced ??
                challenges.controlWardsPlaced ??
                me.visionWardsBoughtInGame ??
                0,
        },
        objectives: {
            dragonTakedowns,
            baronTakedowns,
            heraldTakedowns,
            turretTakedowns: challenges.turretTakedowns ?? me.turretKills ?? 0,
            inhibitorKills: me.inhibitorKills ?? 0,
            participation: share(
                dragonTakedowns + baronTakedowns + heraldTakedowns,
                teamObjectives,
            ),
        },

        soloKills: challenges.soloKills ?? 0,
        largestMultiKill: me.largestMultiKill ?? 0,
        firstBlood: me.firstBloodKill === true,

        items: [me.item0, me.item1, me.item2, me.item3, me.item4, me.item5, me.item6],
        runes: runesOf(me),
        spells: [me.summoner1Id, me.summoner2Id],

        opponentChampionKey: opponent?.championKey ?? null,
        opponentChampionName: opponent?.championName ?? null,

        team,
        enemyTeam,
        teams: [team, enemyTeam],
        draft: serializeDraftState(draft),
    };
}

/** Summaries for every participant of a match, in participant order. */
export function summarizeMatchForAll(match: MatchDto): MatchSummary[] {
    return (match.info?.participants ?? [])
        .map((participant) => summarizeMatchOrNull(match, participant.puuid))
        .filter((summary): summary is MatchSummary => summary !== null);
}
