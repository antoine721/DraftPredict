/**
 * match-v5 DTOs.
 *
 * Riot adds fields to `ParticipantDto` and `challenges` every patch, so only
 * the stable fields DraftPredict reads are declared; anything else is reachable
 * through the `challenges` record.
 */

export type MatchMetadataDto = {
    dataVersion: string;
    matchId: string;
    /** PUUIDs of the ten participants, in participantId order. */
    participants: string[];
};

export type MatchPerkStatsDto = {
    defense: number;
    flex: number;
    offense: number;
};

export type MatchPerkSelectionDto = {
    perk: number;
    var1: number;
    var2: number;
    var3: number;
};

export type MatchPerkStyleDto = {
    description: string;
    selections: MatchPerkSelectionDto[];
    style: number;
};

export type MatchPerksDto = {
    statPerks: MatchPerkStatsDto;
    styles: MatchPerkStyleDto[];
};

/** Riot's per-game "challenges" bag. Every field is optional by nature. */
export type MatchChallengesDto = {
    killParticipation?: number;
    teamDamagePercentage?: number;
    damageTakenOnTeamPercentage?: number;
    goldPerMinute?: number;
    visionScorePerMinute?: number;
    soloKills?: number;
    dragonTakedowns?: number;
    baronTakedowns?: number;
    riftHeraldTakedowns?: number;
    voidMonsterKill?: number;
    turretTakedowns?: number;
    turretPlatesTaken?: number;
    laneMinionsFirst10Minutes?: number;
    kda?: number;
    controlWardsPlaced?: number;
    effectiveHealAndShielding?: number;
    [key: string]: number | undefined;
};

export type ParticipantDto = {
    puuid: string;
    participantId: number;
    teamId: number;
    win: boolean;

    championId: number;
    championName: string;
    champLevel: number;
    championTransform?: number;

    // Position/lane, in Riot's four inconsistent flavours.
    teamPosition?: string;
    individualPosition?: string;
    lane?: string;
    role?: string;

    kills: number;
    deaths: number;
    assists: number;

    totalMinionsKilled: number;
    neutralMinionsKilled?: number;
    goldEarned: number;
    goldSpent?: number;

    totalDamageDealtToChampions: number;
    physicalDamageDealtToChampions?: number;
    magicDamageDealtToChampions?: number;
    trueDamageDealtToChampions?: number;
    damageDealtToObjectives?: number;
    damageDealtToTurrets?: number;
    damageDealtToBuildings?: number;
    totalDamageTaken: number;
    damageSelfMitigated?: number;

    totalHeal?: number;
    totalHealsOnTeammates?: number;
    totalDamageShieldedOnTeammates?: number;

    visionScore: number;
    wardsPlaced?: number;
    wardsKilled?: number;
    detectorWardsPlaced?: number;
    visionWardsBoughtInGame?: number;

    dragonKills?: number;
    baronKills?: number;
    turretKills?: number;
    inhibitorKills?: number;
    objectivesStolen?: number;

    firstBloodKill?: boolean;
    firstTowerKill?: boolean;
    largestKillingSpree?: number;
    largestMultiKill?: number;
    doubleKills?: number;
    tripleKills?: number;
    quadraKills?: number;
    pentaKills?: number;

    item0: number;
    item1: number;
    item2: number;
    item3: number;
    item4: number;
    item5: number;
    item6: number;

    summoner1Id: number;
    summoner2Id: number;

    perks?: MatchPerksDto;
    challenges?: MatchChallengesDto;

    summonerName?: string;
    riotIdGameName?: string;
    riotIdTagline?: string;
    summonerLevel?: number;

    gameEndedInEarlySurrender?: boolean;
    gameEndedInSurrender?: boolean;
    timePlayed?: number;
};

export type TeamBanDto = {
    championId: number;
    pickTurn: number;
};

export type ObjectiveDto = {
    first: boolean;
    kills: number;
};

export type TeamObjectivesDto = {
    baron?: ObjectiveDto;
    champion?: ObjectiveDto;
    dragon?: ObjectiveDto;
    horde?: ObjectiveDto;
    inhibitor?: ObjectiveDto;
    riftHerald?: ObjectiveDto;
    tower?: ObjectiveDto;
    atakhan?: ObjectiveDto;
};

export type TeamDto = {
    teamId: number;
    win: boolean;
    bans: TeamBanDto[];
    objectives: TeamObjectivesDto;
};

export type MatchInfoDto = {
    gameId: number;
    gameCreation: number;
    /**
     * Seconds when `gameEndTimestamp` is present (patch 11.20+), milliseconds
     * otherwise. Use `resolveDurationSeconds` rather than reading it directly.
     */
    gameDuration: number;
    gameStartTimestamp?: number;
    gameEndTimestamp?: number;
    gameMode: string;
    gameType: string;
    gameName?: string;
    gameVersion: string;
    mapId: number;
    platformId: string;
    queueId: number;
    participants: ParticipantDto[];
    teams: TeamDto[];
    tournamentCode?: string;
    endOfGameResult?: string;
};

export type MatchDto = {
    metadata: MatchMetadataDto;
    info: MatchInfoDto;
};

// --- match-v5 timeline ----------------------------------------------------

export type TimelinePositionDto = { x: number; y: number };

export type TimelineEventDto = {
    timestamp: number;
    type: string;
    participantId?: number;
    killerId?: number;
    victimId?: number;
    assistingParticipantIds?: number[];
    itemId?: number;
    skillSlot?: number;
    levelUpType?: string;
    monsterType?: string;
    monsterSubType?: string;
    buildingType?: string;
    towerType?: string;
    laneType?: string;
    teamId?: number;
    killType?: string;
    position?: TimelinePositionDto;
    [key: string]: unknown;
};

export type TimelineParticipantFrameDto = {
    participantId: number;
    currentGold: number;
    totalGold: number;
    level: number;
    xp: number;
    minionsKilled: number;
    jungleMinionsKilled: number;
    position?: TimelinePositionDto;
    [key: string]: unknown;
};

export type TimelineFrameDto = {
    timestamp: number;
    events: TimelineEventDto[];
    participantFrames: Record<string, TimelineParticipantFrameDto>;
};

export type MatchTimelineInfoDto = {
    frameInterval: number;
    frames: TimelineFrameDto[];
    gameId?: number;
    participants?: { participantId: number; puuid: string }[];
};

export type MatchTimelineDto = {
    metadata: MatchMetadataDto;
    info: MatchTimelineInfoDto;
};

/** Query parameters of `match-v5 /by-puuid/{puuid}/ids`. */
export type MatchIdsQuery = {
    start?: number;
    count?: number;
    queue?: number;
    type?: "ranked" | "normal" | "tourney" | "tutorial" | string;
    startTime?: number;
    endTime?: number;
};
