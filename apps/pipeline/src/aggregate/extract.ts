import type { Role, Skill, SkillOrder } from "@draftpredict/core";
import {
    BUILD_ITEM_ORDER_LENGTH,
    TIME_BUCKET_COUNT,
    TIME_BUCKET_START_MINUTES,
    TIME_BUCKET_WIDTH_MINUTES,
} from "@draftpredict/core";
import type {
    MatchDto,
    MatchTimelineDto,
    ParticipantDto,
    TimelineEventDto,
} from "@draftpredict/riot";
import { assignTeamRoles, normalizeRole, resolveDurationSeconds } from "@draftpredict/riot";

import {
    MIN_MATCH_DURATION_SECONDS,
    SUMMONERS_RIFT_MAP_ID,
} from "../constants.js";
import type { ItemClassifier } from "./items.js";
import { permissiveItemClassifier } from "./items.js";
import type { RawMatchRecord } from "../collect/types.js";
import type {
    MatchRecord,
    ParticipantRecord,
    RejectReason,
    RunesSelection,
    TimelineBuild,
} from "./types.js";

/** Item purchases up to this timestamp count as the starting set. */
export const STARTING_ITEM_WINDOW_MS = 90_000;

const SKILL_BY_SLOT: Record<number, Skill> = { 1: "Q", 2: "W", 3: "E", 4: "R" };

export type ExtractOptions = {
    /** Queue ids to accept. Empty or omitted accepts every queue. */
    queues?: readonly number[];
    /** Accept only this patch ("16.17"). */
    patch?: string;
    /** Minimum duration. Default 300s. */
    minDurationSeconds?: number;
    /** Item classification for build data. Defaults to the permissive one. */
    classifier?: ItemClassifier;
    /** Skip build extraction entirely (cheaper when only the dataset matters). */
    skipBuilds?: boolean;
};

export type ExtractResult =
    | { ok: true; record: MatchRecord }
    | { ok: false; reason: RejectReason };

/** `"16.17.1.2345"` -> `"16.17"`. */
export function parsePatch(gameVersion: string | undefined): string {
    const parts = String(gameVersion ?? "").split(".");
    if (parts.length < 2) return String(gameVersion ?? "");
    return `${parts[0]}.${parts[1]}`;
}

/**
 * Index into `ChampionRoleData.statsByTime`: seven 5-minute buckets starting at
 * 20 minutes, the last one open-ended. Shorter games are not bucketed at all,
 * which is what DraftGap's datasets do.
 */
export function timeBucketIndex(durationSeconds: number): number | null {
    const minutes = durationSeconds / 60;
    if (minutes < TIME_BUCKET_START_MINUTES) return null;
    const index = Math.floor(
        (minutes - TIME_BUCKET_START_MINUTES) / TIME_BUCKET_WIDTH_MINUTES,
    );
    return Math.min(TIME_BUCKET_COUNT - 1, index);
}

/** Accepts both shard shapes: `{match, timeline}` and a bare `MatchDto`. */
export function normalizeRawRecord(line: unknown): RawMatchRecord | null {
    if (typeof line !== "object" || line === null) return null;
    const value = line as Record<string, unknown>;
    if (value.match && typeof value.match === "object") {
        return value as unknown as RawMatchRecord;
    }
    if (value.info && value.metadata) {
        return { match: value as unknown as MatchDto };
    }
    return null;
}

/** Reduces one raw shard line to a {@link MatchRecord}, or says why it cannot. */
export function extractMatch(
    line: unknown,
    options: ExtractOptions = {},
): ExtractResult {
    const raw = normalizeRawRecord(line);
    if (!raw?.match?.info || !raw.match.metadata) return { ok: false, reason: "malformed" };

    const info = raw.match.info;
    const participants = info.participants ?? [];

    if (options.queues && options.queues.length > 0 && !options.queues.includes(info.queueId)) {
        return { ok: false, reason: "wrong-queue" };
    }
    if (info.mapId !== SUMMONERS_RIFT_MAP_ID) return { ok: false, reason: "wrong-map" };
    if (participants.length !== 10) return { ok: false, reason: "participants" };

    const patch = parsePatch(info.gameVersion);
    if (options.patch && patch !== options.patch) {
        return { ok: false, reason: "wrong-patch" };
    }

    const durationSeconds = resolveDurationSeconds(info);
    if (durationSeconds < (options.minDurationSeconds ?? MIN_MATCH_DURATION_SECONDS)) {
        return { ok: false, reason: "remake" };
    }

    const classifier = options.classifier ?? permissiveItemClassifier;
    const builds = options.skipBuilds
        ? new Map<number, TimelineBuild>()
        : extractTimelineBuilds(raw.timeline, classifier);

    const roles = new Map<ParticipantDto, Role>();
    for (const teamId of [100, 200]) {
        const members = participants.filter((participant) => participant.teamId === teamId);
        if (members.length !== 5) return { ok: false, reason: "participants" };
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
    if (roles.size !== 10) return { ok: false, reason: "roles" };

    const records: ParticipantRecord[] = participants.map((participant) =>
        toParticipantRecord(participant, roles.get(participant)!, classifier, builds),
    );

    // A team with two of the same role would double-count matchups.
    for (const teamId of [100, 200]) {
        const seen = new Set<Role>();
        for (const record of records) {
            if (record.teamId !== teamId) continue;
            if (seen.has(record.role)) return { ok: false, reason: "roles" };
            seen.add(record.role);
        }
    }

    return {
        ok: true,
        record: {
            matchId: raw.match.metadata.matchId,
            platformId: info.platformId,
            queueId: info.queueId,
            mapId: info.mapId,
            gameVersion: info.gameVersion,
            patch,
            gameCreation: info.gameCreation,
            durationSeconds,
            timeBucket: timeBucketIndex(durationSeconds),
            participants: records,
        },
    };
}

function toParticipantRecord(
    participant: ParticipantDto,
    role: Role,
    classifier: ItemClassifier,
    builds: Map<number, TimelineBuild>,
): ParticipantRecord {
    const inventory = [
        participant.item0,
        participant.item1,
        participant.item2,
        participant.item3,
        participant.item4,
        participant.item5,
    ].filter(
        (id) =>
            typeof id === "number" &&
            id > 0 &&
            !classifier.isTrinket(id) &&
            !classifier.isConsumable(id),
    );

    return {
        puuid: participant.puuid,
        participantId: participant.participantId,
        championKey: String(participant.championId),
        role,
        teamId: participant.teamId,
        win: participant.win === true,
        damage: {
            magic: numberOr(participant.magicDamageDealtToChampions, 0),
            physical: numberOr(participant.physicalDamageDealtToChampions, 0),
            true: numberOr(participant.trueDamageDealtToChampions, 0),
        },
        items: inventory.filter((id) => !classifier.isBoots(id)),
        boots: inventory.find((id) => classifier.isBoots(id)),
        runes: extractRunes(participant),
        spells: [numberOr(participant.summoner1Id, 0), numberOr(participant.summoner2Id, 0)],
        build: builds.get(participant.participantId),
    };
}

/** Pulls the rune page out of `perks`; `undefined` when Riot sent none. */
export function extractRunes(participant: ParticipantDto): RunesSelection | undefined {
    const perks = participant.perks;
    if (!perks?.styles?.length) return undefined;

    const primaryStyle =
        perks.styles.find((style) => style.description === "primaryStyle") ??
        perks.styles[0];
    const secondaryStyle =
        perks.styles.find((style) => style.description === "subStyle") ?? perks.styles[1];

    const primary = (primaryStyle?.selections ?? [])
        .map((selection) => selection.perk)
        .filter((perk) => perk > 0);
    const secondary = (secondaryStyle?.selections ?? [])
        .map((selection) => selection.perk)
        .filter((perk) => perk > 0);

    if (primary.length === 0 && secondary.length === 0) return undefined;

    const shards = perks.statPerks ?? { offense: 0, flex: 0, defense: 0 };

    return {
        primaryPath: numberOr(primaryStyle?.style, 0),
        keystone: primary[0] ?? 0,
        primary,
        secondaryPath: numberOr(secondaryStyle?.style, 0),
        secondary,
        shards: [
            numberOr(shards.offense, 0),
            numberOr(shards.flex, 0),
            numberOr(shards.defense, 0),
        ],
    };
}

/**
 * Build detail from a match timeline, keyed by participant id.
 *
 * Without a timeline the pipeline still produces rune, spell, boots and
 * full-set data — the item *order*, the starting set and the skill order are
 * the only things that need per-event data, and they are simply left out.
 */
export function extractTimelineBuilds(
    timeline: MatchTimelineDto | undefined,
    classifier: ItemClassifier,
): Map<number, TimelineBuild> {
    const builds = new Map<number, TimelineBuild>();
    if (!timeline?.info?.frames) return builds;

    type Progress = {
        purchases: { id: number; timestamp: number }[];
        skills: Skill[];
        skillPoints: Map<Skill, number>;
        thirdPointAt: Map<Skill, number>;
        firstPointAt: Map<Skill, number>;
    };
    const progress = new Map<number, Progress>();
    const of = (participantId: number): Progress => {
        let entry = progress.get(participantId);
        if (!entry) {
            entry = {
                purchases: [],
                skills: [],
                skillPoints: new Map(),
                thirdPointAt: new Map(),
                firstPointAt: new Map(),
            };
            progress.set(participantId, entry);
        }
        return entry;
    };

    for (const frame of timeline.info.frames) {
        for (const event of frame.events ?? []) {
            const participantId = event.participantId;
            if (participantId === undefined) continue;

            if (event.type === "ITEM_PURCHASED" && typeof event.itemId === "number") {
                of(participantId).purchases.push({
                    id: event.itemId,
                    timestamp: event.timestamp,
                });
            } else if (event.type === "ITEM_UNDO") {
                const before = undoneItemId(event);
                if (before !== undefined) {
                    const purchases = of(participantId).purchases;
                    for (let i = purchases.length - 1; i >= 0; i -= 1) {
                        if (purchases[i].id === before) {
                            purchases.splice(i, 1);
                            break;
                        }
                    }
                }
            } else if (event.type === "SKILL_LEVEL_UP") {
                const skill = SKILL_BY_SLOT[Number(event.skillSlot)];
                if (!skill) continue;
                const entry = of(participantId);
                entry.skills.push(skill);
                const points = (entry.skillPoints.get(skill) ?? 0) + 1;
                entry.skillPoints.set(skill, points);
                if (points === 1) entry.firstPointAt.set(skill, entry.skills.length);
                if (points === 3) entry.thirdPointAt.set(skill, entry.skills.length);
            }
        }
    }

    for (const [participantId, entry] of progress) {
        const startingItems = entry.purchases
            .filter(
                (purchase) =>
                    purchase.timestamp <= STARTING_ITEM_WINDOW_MS &&
                    !classifier.isTrinket(purchase.id),
            )
            .map((purchase) => purchase.id);

        const itemOrder: number[] = [];
        for (const purchase of entry.purchases) {
            if (itemOrder.length >= BUILD_ITEM_ORDER_LENGTH) break;
            if (!classifier.isCompleted(purchase.id)) continue;
            if (classifier.isBoots(purchase.id)) continue;
            if (itemOrder.includes(purchase.id)) continue;
            itemOrder.push(purchase.id);
        }

        builds.set(participantId, {
            startingItems,
            itemOrder,
            skillLevels: entry.skills,
            skillOrder: skillOrderOf(entry.thirdPointAt, entry.firstPointAt, entry.skillPoints),
        });
    }

    return builds;
}

/**
 * The classic "max order": the three basic abilities sorted by when they hit
 * three points, falling back to total points and then to first point.
 */
export function skillOrderOf(
    thirdPointAt: Map<Skill, number>,
    firstPointAt: Map<Skill, number>,
    points: Map<Skill, number>,
): SkillOrder | undefined {
    const basics: Skill[] = ["Q", "W", "E"];
    if (!basics.some((skill) => (points.get(skill) ?? 0) > 0)) return undefined;

    const sorted = [...basics].sort((a, b) => {
        const thirdA = thirdPointAt.get(a) ?? Number.POSITIVE_INFINITY;
        const thirdB = thirdPointAt.get(b) ?? Number.POSITIVE_INFINITY;
        if (thirdA !== thirdB) return thirdA - thirdB;
        const pointsA = points.get(a) ?? 0;
        const pointsB = points.get(b) ?? 0;
        if (pointsA !== pointsB) return pointsB - pointsA;
        const firstA = firstPointAt.get(a) ?? Number.POSITIVE_INFINITY;
        const firstB = firstPointAt.get(b) ?? Number.POSITIVE_INFINITY;
        return firstA - firstB;
    });

    return sorted.join("") as SkillOrder;
}

function undoneItemId(event: TimelineEventDto): number | undefined {
    const before = event.beforeId ?? event.itemBefore;
    if (typeof before === "number" && before > 0) return before;
    return undefined;
}

function numberOr(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
