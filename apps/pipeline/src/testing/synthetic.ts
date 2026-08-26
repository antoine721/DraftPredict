import type {
    MatchDto,
    MatchTimelineDto,
    ParticipantDto,
    TimelineEventDto,
} from "@draftpredict/riot";

/**
 * Synthetic match builders for the pipeline's tests.
 *
 * Test-only, and deliberately not exported from `src/index.ts` (nor compiled
 * into `dist`): a shard of hand-written matches is the only way to assert that
 * aggregation produces *exactly* the right numbers.
 */

export const ROLE_POSITIONS = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;

export type SyntheticPlayer = {
    /** Numeric champion key as a string. */
    championKey: string;
    /** Damage dealt to champions, per channel. */
    damage?: { magic?: number; physical?: number; true?: number };
    items?: number[];
    /** `[keystone, ...primary]`, then the secondary runes. */
    primaryRunes?: number[];
    secondaryRunes?: number[];
    primaryPath?: number;
    secondaryPath?: number;
    shards?: [number, number, number];
    spells?: [number, number];
    puuid?: string;
};

export type SyntheticMatchOptions = {
    matchId?: string;
    queueId?: number;
    mapId?: number;
    gameVersion?: string;
    /** Seconds. */
    duration?: number;
    /** Epoch ms. */
    gameCreation?: number;
    platformId?: string;
    /** Five champion keys (or players), in role order Top..Support. */
    blue: (string | SyntheticPlayer)[];
    red: (string | SyntheticPlayer)[];
    /** Which team won. Default 100 (blue). */
    winner?: 100 | 200;
    /** Blank out `teamPosition`, forcing positional role assignment. */
    withoutPositions?: boolean;
};

let matchCounter = 0;

export function makeMatch(options: SyntheticMatchOptions): MatchDto {
    const matchId = options.matchId ?? `EUW1_${1_000_000 + matchCounter++}`;
    const winner = options.winner ?? 100;
    const duration = options.duration ?? 1800;

    const participants: ParticipantDto[] = [];
    for (const [teamIndex, side] of [options.blue, options.red].entries()) {
        const teamId = teamIndex === 0 ? 100 : 200;
        side.forEach((entry, roleIndex) => {
            const player: SyntheticPlayer =
                typeof entry === "string" ? { championKey: entry } : entry;
            const participantId = teamIndex * 5 + roleIndex + 1;
            participants.push(
                makeParticipant({
                    player,
                    participantId,
                    teamId,
                    roleIndex,
                    win: teamId === winner,
                    withoutPositions: options.withoutPositions ?? false,
                    matchId,
                }),
            );
        });
    }

    return {
        metadata: {
            dataVersion: "2",
            matchId,
            participants: participants.map((participant) => participant.puuid),
        },
        info: {
            gameId: matchCounter,
            gameCreation: options.gameCreation ?? 1_770_000_000_000,
            gameDuration: duration,
            gameEndTimestamp: (options.gameCreation ?? 1_770_000_000_000) + duration * 1000,
            gameMode: "CLASSIC",
            gameType: "MATCHED_GAME",
            gameVersion: options.gameVersion ?? "16.17.1.2345",
            mapId: options.mapId ?? 11,
            platformId: options.platformId ?? "EUW1",
            queueId: options.queueId ?? 420,
            participants,
            teams: [
                { teamId: 100, win: winner === 100, bans: [], objectives: {} },
                { teamId: 200, win: winner === 200, bans: [], objectives: {} },
            ],
        },
    };
}

function makeParticipant(args: {
    player: SyntheticPlayer;
    participantId: number;
    teamId: number;
    roleIndex: number;
    win: boolean;
    withoutPositions: boolean;
    matchId: string;
}): ParticipantDto {
    const { player } = args;
    const damage = player.damage ?? {};
    const magic = damage.magic ?? 0;
    const physical = damage.physical ?? 0;
    const trueDamage = damage.true ?? 0;
    const items = player.items ?? [];
    const primary = player.primaryRunes ?? [];
    const secondary = player.secondaryRunes ?? [];

    return {
        puuid: player.puuid ?? `puuid-${args.matchId}-${args.participantId}`,
        participantId: args.participantId,
        teamId: args.teamId,
        win: args.win,
        championId: Number(player.championKey),
        championName: `Champion${player.championKey}`,
        champLevel: 16,
        teamPosition: args.withoutPositions ? "" : ROLE_POSITIONS[args.roleIndex],
        individualPosition: args.withoutPositions ? "Invalid" : ROLE_POSITIONS[args.roleIndex],
        lane: args.withoutPositions ? "NONE" : ROLE_POSITIONS[args.roleIndex],
        role: "SOLO",
        kills: 5,
        deaths: 5,
        assists: 5,
        totalMinionsKilled: 150,
        goldEarned: 12_000,
        totalDamageDealtToChampions: magic + physical + trueDamage,
        magicDamageDealtToChampions: magic,
        physicalDamageDealtToChampions: physical,
        trueDamageDealtToChampions: trueDamage,
        totalDamageTaken: 20_000,
        visionScore: 20,
        item0: items[0] ?? 0,
        item1: items[1] ?? 0,
        item2: items[2] ?? 0,
        item3: items[3] ?? 0,
        item4: items[4] ?? 0,
        item5: items[5] ?? 0,
        item6: 3340,
        summoner1Id: player.spells?.[0] ?? 4,
        summoner2Id: player.spells?.[1] ?? 12,
        perks: {
            statPerks: {
                offense: player.shards?.[0] ?? 5008,
                flex: player.shards?.[1] ?? 5008,
                defense: player.shards?.[2] ?? 5001,
            },
            styles: [
                {
                    description: "primaryStyle",
                    style: player.primaryPath ?? 8100,
                    selections: primary.map((perk) => ({
                        perk,
                        var1: 0,
                        var2: 0,
                        var3: 0,
                    })),
                },
                {
                    description: "subStyle",
                    style: player.secondaryPath ?? 8000,
                    selections: secondary.map((perk) => ({
                        perk,
                        var1: 0,
                        var2: 0,
                        var3: 0,
                    })),
                },
            ],
        },
    };
}

export type SyntheticTimelineOptions = {
    matchId: string;
    puuids: string[];
    /** Per participant id (1-based): items bought, in order, with timestamps. */
    purchases?: Record<number, { itemId: number; timestamp: number }[]>;
    /** Per participant id: skill slots levelled, in order (1=Q .. 4=R). */
    skills?: Record<number, number[]>;
    /** Per participant id: item ids to undo. */
    undo?: Record<number, number[]>;
};

/** A timeline carrying only the events the aggregator reads. */
export function makeTimeline(options: SyntheticTimelineOptions): MatchTimelineDto {
    const events: TimelineEventDto[] = [];

    for (const [participantId, purchases] of Object.entries(options.purchases ?? {})) {
        for (const purchase of purchases) {
            events.push({
                type: "ITEM_PURCHASED",
                timestamp: purchase.timestamp,
                participantId: Number(participantId),
                itemId: purchase.itemId,
            });
        }
    }

    for (const [participantId, itemIds] of Object.entries(options.undo ?? {})) {
        for (const itemId of itemIds) {
            events.push({
                type: "ITEM_UNDO",
                timestamp: 60_000,
                participantId: Number(participantId),
                beforeId: itemId,
                afterId: 0,
            });
        }
    }

    for (const [participantId, slots] of Object.entries(options.skills ?? {})) {
        slots.forEach((slot, index) => {
            events.push({
                type: "SKILL_LEVEL_UP",
                timestamp: 60_000 + index * 60_000,
                participantId: Number(participantId),
                skillSlot: slot,
                levelUpType: "NORMAL",
            });
        });
    }

    events.sort((a, b) => a.timestamp - b.timestamp);

    return {
        metadata: {
            dataVersion: "2",
            matchId: options.matchId,
            participants: options.puuids,
        },
        info: {
            frameInterval: 60_000,
            frames: [{ timestamp: 0, events, participantFrames: {} }],
            participants: options.puuids.map((puuid, index) => ({
                participantId: index + 1,
                puuid,
            })),
        },
    };
}

/** Five champion keys starting at `start`, for readable test drafts. */
export function team(start: number): string[] {
    return [0, 1, 2, 3, 4].map((offset) => String(start + offset));
}
