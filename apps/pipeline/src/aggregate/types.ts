import type { Role, Skill, SkillOrder } from "@draftpredict/core";

/** The three damage channels, as raw totals dealt to champions. */
export type DamageTotals = {
    magic: number;
    physical: number;
    true: number;
};

export type RunesSelection = {
    primaryPath: number;
    keystone: number;
    /** Keystone first, then the three minor runes of the primary path. */
    primary: number[];
    secondaryPath: number;
    secondary: number[];
    /** Offense, flex, defense shard ids, in that order. */
    shards: [number, number, number];
};

/** Build detail that only a match timeline can supply. */
export type TimelineBuild = {
    /** Items bought before the first recall. */
    startingItems: number[];
    /** Completed legendary items in purchase order. */
    itemOrder: number[];
    /** Skill levelled at each champion level, level 1 first. */
    skillLevels: Skill[];
    /** The first three basic abilities in the order they were maxed-first. */
    skillOrder?: SkillOrder;
};

export type ParticipantRecord = {
    puuid: string;
    participantId: number;
    /** Numeric champion id as a string — the dataset key. */
    championKey: string;
    role: Role;
    teamId: number;
    win: boolean;
    damage: DamageTotals;
    /** Final inventory, trinket and consumables removed. */
    items: number[];
    boots?: number;
    runes?: RunesSelection;
    /** `[summoner1Id, summoner2Id]`. */
    spells: [number, number];
    build?: TimelineBuild;
};

/**
 * One match, reduced to exactly what the aggregator needs.
 *
 * Extraction happens once per line, so the accumulators never touch a raw
 * `MatchDto` and the (large) rest of Riot's payload is dropped immediately.
 */
export type MatchRecord = {
    matchId: string;
    platformId: string;
    queueId: number;
    mapId: number;
    gameVersion: string;
    /** Major.minor of `gameVersion`, e.g. "16.17". */
    patch: string;
    /** Epoch ms. */
    gameCreation: number;
    durationSeconds: number;
    /** Index into `statsByTime`, or `null` for games shorter than 20 minutes. */
    timeBucket: number | null;
    participants: ParticipantRecord[];
};

/** Why a match was not counted. */
export type RejectReason =
    | "malformed"
    | "wrong-map"
    | "wrong-queue"
    | "wrong-patch"
    | "remake"
    | "participants"
    | "roles";

export type AggregateCounters = {
    linesRead: number;
    matchesAccepted: number;
    matchesRejected: number;
    rejectedBy: Record<RejectReason, number>;
    parseErrors: number;
};

export function emptyAggregateCounters(): AggregateCounters {
    return {
        linesRead: 0,
        matchesAccepted: 0,
        matchesRejected: 0,
        rejectedBy: {
            malformed: 0,
            "wrong-map": 0,
            "wrong-queue": 0,
            "wrong-patch": 0,
            remake: 0,
            participants: 0,
            roles: 0,
        },
        parseErrors: 0,
    };
}
