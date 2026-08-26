/** champion-mastery-v4 — `ChampionMasteryDTO`. */
export type ChampionMasteryDto = {
    puuid: string;
    championId: number;
    championLevel: number;
    championPoints: number;
    lastPlayTime: number;
    championPointsSinceLastLevel: number;
    championPointsUntilNextLevel: number;
    chestGranted?: boolean;
    tokensEarned?: number;
    markRequiredForNextLevel?: number;
    championSeasonMilestone?: number;
    milestoneGrants?: unknown;
    nextSeasonMilestone?: unknown;
};
