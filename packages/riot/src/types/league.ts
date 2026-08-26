/** league-v4 — the ranked queues we care about. */
export type LeagueQueueType =
    "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | "RANKED_FLEX_TT" | "CHERRY";

export type MiniSeriesDto = {
    losses: number;
    progress: string;
    target: number;
    wins: number;
};

/** league-v4 — `LeagueEntryDTO`. */
export type LeagueEntryDto = {
    leagueId?: string;
    queueType: LeagueQueueType | string;
    tier?: string;
    rank?: string;
    puuid?: string;
    summonerId?: string;
    leaguePoints: number;
    wins: number;
    losses: number;
    veteran?: boolean;
    inactive?: boolean;
    freshBlood?: boolean;
    hotStreak?: boolean;
    miniSeries?: MiniSeriesDto;
};
