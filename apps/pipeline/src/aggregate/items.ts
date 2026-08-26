import type { StaticData } from "@draftpredict/data";

/**
 * Item classification, needed to turn a raw inventory into build data:
 * boots go in their own bucket, trinkets and consumables are noise, and only
 * completed legendary items belong in a build order or an item set.
 */
export type ItemClassifier = {
    isBoots(id: number): boolean;
    isTrinket(id: number): boolean;
    isConsumable(id: number): boolean;
    /** A finished legendary item (not a component, not boots). */
    isCompleted(id: number): boolean;
    /** Buyable on Summoner's Rift at all. */
    isKnown(id: number): boolean;
};

/** Gold value from which an item with nothing to build into counts as finished. */
export const COMPLETED_ITEM_GOLD = 2000;

export function itemClassifierFromStaticData(staticData: StaticData): ItemClassifier {
    const boots = new Set<number>();
    const trinkets = new Set<number>();
    const consumables = new Set<number>();
    const completed = new Set<number>();
    const known = new Set<number>();

    for (const item of staticData.itemsById.values()) {
        known.add(item.id);
        const tags = new Set(item.tags);
        const isBoots = tags.has("Boots");
        const isTrinket = tags.has("Trinket");
        const isConsumable = item.consumed === true || tags.has("Consumable");
        if (isBoots) boots.add(item.id);
        if (isTrinket) trinkets.add(item.id);
        if (isConsumable) consumables.add(item.id);
        if (
            !isBoots &&
            !isTrinket &&
            !isConsumable &&
            item.into.length === 0 &&
            item.gold.total >= COMPLETED_ITEM_GOLD
        ) {
            completed.add(item.id);
        }
    }

    return {
        isBoots: (id) => boots.has(id),
        isTrinket: (id) => trinkets.has(id),
        isConsumable: (id) => consumables.has(id),
        isCompleted: (id) => completed.has(id),
        isKnown: (id) => known.has(id),
    };
}

/**
 * Fallback used when no static data is available (tests, a shard collected on
 * a patch the snapshot does not know). Everything with an id is treated as a
 * real item, which keeps aggregation running rather than silently empty.
 */
export const permissiveItemClassifier: ItemClassifier = {
    isBoots: () => false,
    isTrinket: (id) => id >= 3330 && id <= 3364,
    isConsumable: (id) => (id >= 2003 && id <= 2060) || id === 2138 || id === 2139,
    isCompleted: (id) => id > 0,
    isKnown: (id) => id > 0,
};
