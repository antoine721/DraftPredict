/**
 * Shapes returned by the League Client API.
 *
 * These are deliberately permissive: the LCU is an internal API that gains and
 * loses fields between patches, so all but the load-bearing ones are optional
 * and every consumer in this package reads them defensively. Unknown string
 * unions keep `(string & {})` so a new value from a future patch still
 * type-checks instead of forcing a cast.
 */

// --------------------------------------------------------------- gameflow ---

/** Values `/lol-gameflow/v1/gameflow-phase` is known to return. */
export const GAMEFLOW_PHASES = [
    "None",
    "Lobby",
    "Matchmaking",
    "CheckedIntoTournament",
    "ReadyCheck",
    "ChampSelect",
    "GameStart",
    "FailedToLaunch",
    "InProgress",
    "Reconnect",
    "WaitingForStats",
    "PreEndOfGame",
    "EndOfGame",
    "TerminatedInError",
] as const;

export type KnownGameflowPhase = (typeof GAMEFLOW_PHASES)[number];

/** A gameflow phase; unknown future values are still valid. */
export type GameflowPhase = KnownGameflowPhase | (string & {});

/** True when `value` is one of the phases we know by name. */
export function isKnownGameflowPhase(value: unknown): value is KnownGameflowPhase {
    return (
        typeof value === "string" &&
        (GAMEFLOW_PHASES as readonly string[]).includes(value)
    );
}

export type LcuGameflowSession = {
    phase?: GameflowPhase;
    gameData?: {
        gameId?: number;
        queue?: { id?: number; type?: string; gameMode?: string; isRanked?: boolean };
        teamOne?: unknown[];
        teamTwo?: unknown[];
    };
    map?: { id?: number; name?: string; gameMode?: string };
    gameClient?: { running?: boolean; visible?: boolean };
};

// --------------------------------------------------------------- summoner ---

export type LcuSummoner = {
    accountId?: number;
    displayName?: string;
    gameName?: string;
    tagLine?: string;
    internalName?: string;
    profileIconId?: number;
    puuid: string;
    summonerId?: number;
    summonerLevel?: number;
    percentCompleteForNextLevel?: number;
};

// ----------------------------------------------------------------- ranked ---

export type LcuQueueRankedStats = {
    queueType?: string;
    tier?: string;
    division?: string;
    leaguePoints?: number;
    wins?: number;
    losses?: number;
    isProvisional?: boolean;
    provisionalGamesRemaining?: number;
};

export type LcuRankedStats = {
    puuid?: string;
    earnedRegaliaRewardIds?: string[];
    highestRankedEntry?: LcuQueueRankedStats;
    queueMap?: Record<string, LcuQueueRankedStats>;
    queues?: LcuQueueRankedStats[];
    seasonRankedStats?: unknown;
};

// -------------------------------------------------------------- champions ---

export type LcuChampionSelectionStatus = {
    banIntented?: boolean;
    banIntentedByMe?: boolean;
    isBanned?: boolean;
    pickIntented?: boolean;
    pickIntentedByMe?: boolean;
    pickIntentedPosition?: string;
    pickedByOtherOrBanned?: boolean;
    selectedByMe?: boolean;
};

/** One entry of `/lol-champ-select/v1/all-grid-champions`. */
export type LcuGridChampion = {
    id: number;
    name?: string;
    alias?: string;
    squarePortraitPath?: string;
    roles?: string[];
    positionsFavorited?: string[];
    owned?: boolean;
    freeToPlay?: boolean;
    disabled?: boolean;
    masteryLevel?: number;
    masteryPoints?: number;
    selectionStatus?: LcuChampionSelectionStatus;
};

/** One entry of `/lol-champions/v1/owned-champions-minimal`. */
export type LcuOwnedChampion = {
    id: number;
    name?: string;
    alias?: string;
    active?: boolean;
    freeToPlay?: boolean;
    ownership?: { owned?: boolean; freeToPlay?: boolean; rental?: unknown };
    roles?: string[];
    squarePortraitPath?: string;
};

// ------------------------------------------------------------ champ select ---

export type LcuChampSelectActionType =
    "pick" | "ban" | "ten_bans_reveal" | (string & {});

export type LcuChampSelectAction = {
    id: number;
    actorCellId: number;
    /** `0` (and occasionally `-1`) mean "nothing chosen yet". */
    championId: number;
    completed: boolean;
    isAllyAction: boolean;
    isInProgress: boolean;
    pickTurn?: number;
    type: LcuChampSelectActionType;
};

export type LcuChampSelectPlayer = {
    cellId: number;
    /** Locked-in champion, `0` until the player locks. */
    championId?: number;
    /** The champion the player is currently hovering (allies only). */
    championPickIntent?: number;
    /** `"top" | "jungle" | "middle" | "bottom" | "utility" | ""`. */
    assignedPosition?: string;
    puuid?: string;
    summonerId?: number;
    gameName?: string;
    tagLine?: string;
    nameVisibilityType?: string;
    obfuscatedPuuid?: string;
    obfuscatedSummonerId?: number;
    spell1Id?: number;
    spell2Id?: number;
    selectedSkinId?: number;
    /** `1` = blue side, `2` = red side. */
    team?: number;
    wardSkinId?: number;
};

export type LcuChampSelectBans = {
    myTeamBans?: number[];
    theirTeamBans?: number[];
    numBans?: number;
};

/** Champ-select sub-phase, as reported by `session.timer.phase`. */
export type ChampSelectPhase =
    "PLANNING" | "BAN_PICK" | "FINALIZATION" | "GAME_STARTING" | "" | (string & {});

export type LcuChampSelectTimer = {
    /** Milliseconds left in the current sub-phase. */
    adjustedTimeLeftInPhase?: number;
    totalTimeInPhase?: number;
    phase?: ChampSelectPhase;
    isInfinite?: boolean;
    internalNowInEpochMs?: number;
};

/** `/lol-champ-select/v1/session`. */
export type LcuChampSelectSession = {
    /** Actions grouped by turn, in chronological order. */
    actions?: LcuChampSelectAction[][];
    bans?: LcuChampSelectBans;
    /** ARAM / Swiftplay bench (newer clients). */
    benchChampionIds?: number[];
    /** ARAM bench (older clients). */
    benchChampions?: { championId: number }[];
    benchEnabled?: boolean;
    counter?: number;
    gameId?: number;
    hasSimultaneousBans?: boolean;
    hasSimultaneousPicks?: boolean;
    isCustomGame?: boolean;
    isSpectating?: boolean;
    /** `-1` when the viewer is not a player (spectator, replay). */
    localPlayerCellId?: number;
    myTeam?: LcuChampSelectPlayer[];
    theirTeam?: LcuChampSelectPlayer[];
    rerollsRemaining?: number;
    timer?: LcuChampSelectTimer;
    trades?: { id?: number; cellId?: number; state?: string }[];
};

/** The error envelope the LCU returns for a non-2xx status. */
export type LcuErrorEnvelope = {
    errorCode?: string;
    httpStatus?: number;
    implementationDetails?: string;
    message?: string;
};
