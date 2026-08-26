/** spectator-v5 — `BannedChampion`. */
export type SpectatorBannedChampion = {
    championId: number;
    teamId: number;
    pickTurn: number;
};

export type SpectatorPerks = {
    perkIds: number[];
    perkStyle: number;
    perkSubStyle: number;
};

/** spectator-v5 — `CurrentGameParticipant` / `Participant`. */
export type SpectatorParticipant = {
    puuid?: string;
    championId: number;
    teamId: number;
    spell1Id: number;
    spell2Id: number;
    profileIconId?: number;
    bot?: boolean;
    riotId?: string;
    summonerId?: string;
    perks?: SpectatorPerks;
    gameCustomizationObjects?: unknown[];
};

export type SpectatorObserver = { encryptionKey: string };

/** spectator-v5 — `CurrentGameInfo`. */
export type CurrentGameInfo = {
    gameId: number;
    gameType: string;
    gameStartTime: number;
    mapId: number;
    /** Seconds elapsed; negative or 0 during the loading screen. */
    gameLength: number;
    platformId: string;
    gameMode: string;
    bannedChampions: SpectatorBannedChampion[];
    gameQueueConfigId: number;
    observers?: SpectatorObserver;
    participants: SpectatorParticipant[];
};

/** spectator-v5 — `FeaturedGames`. */
export type FeaturedGames = {
    gameList: CurrentGameInfo[];
    clientRefreshInterval: number;
};
