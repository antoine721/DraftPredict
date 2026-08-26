import type { StaticStatShard, StatShardSlot } from "./types.js";

/**
 * Stat shards (the three small rune rows) are not in Data Dragon at all — Riot
 * only publishes them through the game client's perk metadata. DraftGap
 * hard-codes them and so do we.
 *
 * Rows, in the order the client shows them:
 *   offense  5008 Adaptive Force | 5005 Attack Speed | 5007 Ability Haste
 *   flex     5008 Adaptive Force | 5010 Move Speed   | 5001 Health Scaling
 *   defense  5011 Health         | 5013 Tenacity     | 5001 Health Scaling
 *
 * 5008 and 5001 appear in two rows each, which is why a shard carries a list
 * of positions rather than a single one.
 */

export const STAT_SHARD_SLOTS: readonly StatShardSlot[] = [
    "offense",
    "flex",
    "defense",
];

type ShardDefinition = {
    id: number;
    key: string;
    name: string;
    icon: string;
};

const SHARD_DEFINITIONS: readonly ShardDefinition[] = [
    {
        id: 5008,
        key: "AdaptiveForce",
        name: "Adaptive Force",
        icon: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
    },
    {
        id: 5005,
        key: "AttackSpeed",
        name: "Attack Speed",
        icon: "perk-images/StatMods/StatModsAttackSpeedIcon.png",
    },
    {
        id: 5007,
        key: "AbilityHaste",
        name: "Ability Haste",
        icon: "perk-images/StatMods/StatModsCDRScalingIcon.png",
    },
    {
        id: 5010,
        key: "MoveSpeed",
        name: "Move Speed",
        icon: "perk-images/StatMods/StatModsMovementSpeedIcon.png",
    },
    {
        id: 5001,
        key: "HealthScaling",
        name: "Health Scaling",
        icon: "perk-images/StatMods/StatModsHealthPlusIcon.png",
    },
    {
        id: 5011,
        key: "Health",
        name: "Health",
        icon: "perk-images/StatMods/StatModsHealthScalingIcon.png",
    },
    {
        id: 5013,
        key: "Tenacity",
        name: "Tenacity and Slow Resist",
        icon: "perk-images/StatMods/StatModsTenacityIcon.png",
    },
];

/** Shard ids per row, in display order. */
export const STAT_SHARD_ROW_IDS: readonly (readonly number[])[] = [
    [5008, 5005, 5007],
    [5008, 5010, 5001],
    [5011, 5013, 5001],
];

const DEFINITION_BY_ID = new Map(SHARD_DEFINITIONS.map((d) => [d.id, d]));

/**
 * Builds the shard catalogue. A fresh object graph is returned on every call
 * so callers can never mutate a shared module-level constant.
 */
export function createStatShards(): {
    byId: Map<number, StaticStatShard>;
    rows: StaticStatShard[][];
} {
    const byId = new Map<number, StaticStatShard>();

    for (const [slotIndex, rowIds] of STAT_SHARD_ROW_IDS.entries()) {
        const slot = STAT_SHARD_SLOTS[slotIndex];
        for (const [index, id] of rowIds.entries()) {
            const definition = DEFINITION_BY_ID.get(id);
            if (!definition) continue;

            const existing = byId.get(id);
            if (existing) {
                existing.positions.push({ slot, slotIndex, index });
                continue;
            }
            byId.set(id, { ...definition, positions: [{ slot, slotIndex, index }] });
        }
    }

    const rows = STAT_SHARD_ROW_IDS.map((rowIds) =>
        rowIds.map((id) => byId.get(id)!).filter(Boolean),
    );

    return { byId, rows };
}
