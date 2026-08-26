import type {
    BuildEntry,
    BuildMatchupEntry,
    BuildsPayload,
    ItemDetail,
    RunePathDetail,
    StaticRunesResponse,
} from "../../api";
import { ratingToWinrate } from "./stats";

/**
 * Shaping helpers for `GET /api/builds/:championKey`.
 *
 * The route answers with buckets sorted by rating; turning those into a build
 * path, a rune tree and a full item set is the view's job, and none of it
 * needs React — so it lives here and is unit-tested.
 */

/** Stable React key for an entry (ids are numbers for items, strings for sets). */
export function entryKey(entry: BuildEntry): string {
    return String(entry.id);
}

/** Buckets arrive best-first; this is just an explicit, safe `[0]`. */
export function bestEntry(entries: readonly BuildEntry[]): BuildEntry | null {
    return entries.length > 0 ? entries[0] : null;
}

export function entryLabel(entry: BuildEntry): string {
    return entry.name ?? `#${entry.id}`;
}

/**
 * The recommended item path: the best-rated item of each build slot, skipping
 * anything already bought. Slots whose options are all taken are dropped
 * rather than filled with a duplicate.
 */
export function corePath(
    byOrder: readonly BuildEntry[][],
    exclude: readonly (number | string)[] = [],
): BuildEntry[] {
    const taken = new Set<string>(exclude.map(String));
    const path: BuildEntry[] = [];
    for (const slot of byOrder) {
        const pick = slot.find((entry) => !taken.has(String(entry.id)));
        if (!pick) continue;
        taken.add(String(pick.id));
        path.push(pick);
    }
    return path;
}

/**
 * Situational and late items: everything the last build slots consider that
 * the recommended path does not already buy, best first.
 */
export function situationalItems(
    byOrder: readonly BuildEntry[][],
    exclude: readonly (number | string)[] = [],
    fromSlot = 2,
): BuildEntry[] {
    const taken = new Set<string>(exclude.map(String));
    const seen = new Set<string>();
    const items: BuildEntry[] = [];
    for (let slot = fromSlot; slot < byOrder.length; slot += 1) {
        for (const entry of byOrder[slot] ?? []) {
            const id = String(entry.id);
            if (taken.has(id) || seen.has(id)) continue;
            seen.add(id);
            items.push(entry);
        }
    }
    return items.sort((a, b) => b.rating - a.rating);
}

export type FullBuild = {
    starter: BuildEntry | null;
    boots: BuildEntry | null;
    path: BuildEntry[];
    /** `true` when `items.sets` was empty and the build had to be assembled. */
    reconstructed: boolean;
    /** The complete set, when the dataset happens to carry one. */
    set: BuildEntry | null;
};

/**
 * The "build complet" recommendation.
 *
 * `items.sets` is legitimately empty in the offline fixture, so the build is
 * assembled from the best starter, the best boots and the best item of each
 * slot — and says so, because a reconstructed build is a suggestion, not an
 * observed winrate.
 */
export function fullBuild(items: BuildsPayload["items"]): FullBuild {
    const set = bestEntry(items.sets ?? []);
    const boots = bestEntry(items.boots ?? []);
    const starter = bestEntry(items.startingSets ?? []);
    return {
        starter,
        boots,
        set,
        reconstructed: set === null,
        path: corePath(items.byOrder ?? [], boots ? [boots.id] : []),
    };
}

/** Total gold of a list of items, when the static catalogue is loaded. */
export function buildGold(
    entries: readonly BuildEntry[],
    itemsById: Map<number, ItemDetail> | null,
): number | null {
    if (!itemsById || itemsById.size === 0) return null;
    let gold = 0;
    let known = false;
    for (const entry of entries) {
        const parts = entry.components?.length
            ? entry.components.map((component) => component.id)
            : [Number(entry.id)];
        for (const id of parts) {
            const item = itemsById.get(id);
            if (!item) continue;
            known = true;
            gold += item.gold.total;
        }
    }
    return known ? gold : null;
}

// ------------------------------------------------------------------- runes ---

export type RuneSlotInfo = {
    pathId: number;
    pathKey: string;
    pathName: string;
    pathIcon: string;
    slot: number;
    index: number;
};

/** `runeId -> where it sits in the tree`, from the static rune catalogue. */
export function runeSlotIndex(
    runes: StaticRunesResponse | undefined | null,
): Map<number, RuneSlotInfo> {
    const index = new Map<number, RuneSlotInfo>();
    for (const path of runes?.paths ?? []) {
        path.slots.forEach((slot, slotIndex) => {
            slot.forEach((rune, runeIndex) => {
                index.set(rune.id, {
                    pathId: path.id,
                    pathKey: path.key,
                    pathName: path.name,
                    pathIcon: path.icon,
                    slot: slotIndex,
                    index: runeIndex,
                });
            });
        });
    }
    return index;
}

export type RuneRow = {
    /** Row 0 of a primary path is the keystone row. */
    slot: number;
    entries: BuildEntry[];
};

export type RuneBranch = {
    path: RunePathDetail | null;
    rows: RuneRow[];
    /** Entries whose rune id is unknown to the static catalogue. */
    orphans: BuildEntry[];
};

/**
 * Lays a flat list of rated runes back out as tree rows.
 *
 * The server only returns the runes of the path it recommends, so the branch
 * is whichever path the entries belong to. Runes the static catalogue does not
 * know are kept aside instead of being dropped.
 */
export function runeBranch(
    entries: readonly BuildEntry[],
    slots: Map<number, RuneSlotInfo>,
    runes: StaticRunesResponse | undefined | null,
): RuneBranch {
    const rowsBySlot = new Map<number, BuildEntry[]>();
    const orphans: BuildEntry[] = [];
    const pathVotes = new Map<number, number>();

    for (const entry of entries) {
        const info = slots.get(Number(entry.id));
        if (!info) {
            orphans.push(entry);
            continue;
        }
        pathVotes.set(info.pathId, (pathVotes.get(info.pathId) ?? 0) + 1);
        const row = rowsBySlot.get(info.slot);
        if (row) row.push(entry);
        else rowsBySlot.set(info.slot, [entry]);
    }

    let pathId: number | null = null;
    let best = -1;
    for (const [id, votes] of pathVotes) {
        if (votes > best) {
            best = votes;
            pathId = id;
        }
    }

    const path = runes?.paths.find((candidate) => candidate.id === pathId) ?? null;
    const rows = Array.from(rowsBySlot.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([slot, slotEntries]) => ({
            slot,
            entries: [...slotEntries].sort((a, b) => b.rating - a.rating),
        }));

    return { path, rows, orphans };
}

/** The best rune of every row — the setup the view starts from. */
export function recommendedFromRows(rows: readonly RuneRow[]): (number | string)[] {
    return rows
        .map((row) => row.entries[0]?.id)
        .filter((id): id is number | string => id !== undefined);
}

/**
 * A secondary branch contributes exactly two runes, and never twice from the
 * same row — so the recommendation is the two best-rated runes of distinct
 * rows, not simply the top two.
 */
export function recommendedSecondary(rows: readonly RuneRow[]): (number | string)[] {
    return rows
        .map((row) => row.entries[0])
        .filter((entry): entry is BuildEntry => entry !== undefined)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 2)
        .map((entry) => entry.id);
}

/** Looks an entry up by id across every row of a branch. */
export function findEntry(
    rows: readonly RuneRow[],
    id: number | string | undefined,
): BuildEntry | null {
    if (id === undefined) return null;
    for (const row of rows) {
        const found = row.entries.find((entry) => String(entry.id) === String(id));
        if (found) return found;
    }
    return null;
}

/**
 * Sum of the individual contributions of a setup.
 *
 * Deliberately labelled as indicative in the UI: rune deltas are measured one
 * at a time, so adding them up overstates a full page.
 */
export function sumDelta(entries: readonly (BuildEntry | null)[]): number {
    return entries.reduce((total, entry) => total + (entry?.winrateDelta ?? 0), 0);
}

// ---------------------------------------------------------------- matchups ---

export function matchupEntry(
    entry: BuildEntry,
    enemyKey: string | null,
): BuildMatchupEntry | null {
    if (!enemyKey) return null;
    return entry.matchups?.find((row) => row.championKey === enemyKey) ?? null;
}

/** What a choice is worth *because of* the matchup, as a win-probability. */
export function matchupDelta(match: BuildMatchupEntry | null): number | null {
    if (!match) return null;
    return ratingToWinrate(match.rating) - 0.5;
}

/** The rating a choice would have had without any matchup adjustment. */
export function baseRating(entry: BuildEntry): number {
    const adjustment = (entry.matchups ?? []).reduce(
        (total, match) => total + match.rating,
        0,
    );
    return entry.rating - adjustment;
}

// ------------------------------------------------------------------ skills ---

export const SKILL_SLOTS = ["Q", "W", "E", "R"] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

/** `"EQW"` -> `["E", "Q", "W"]`, ignoring anything that is not a skill slot. */
export function skillLetters(id: number | string): SkillSlot[] {
    return String(id)
        .toUpperCase()
        .split("")
        .filter((letter): letter is SkillSlot =>
            (SKILL_SLOTS as readonly string[]).includes(letter),
        );
}

export type LevelPick = {
    level: number;
    best: BuildEntry | null;
    entries: BuildEntry[];
};

/** One row per level, with the options ranked. */
export function levelPicks(levels: readonly BuildEntry[][]): LevelPick[] {
    return levels.map((entries, index) => {
        const ranked = [...entries].sort((a, b) => b.rating - a.rating);
        return { level: index + 1, best: ranked[0] ?? null, entries: ranked };
    });
}
