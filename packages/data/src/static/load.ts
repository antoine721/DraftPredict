import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import { readJsonFile } from "../util/json.js";
import { getBundledDDragonRoot, getStaticCacheDir } from "../util/paths.js";
import type {
    RawChampion,
    RawChampionFile,
    RawItem,
    RawItemFile,
    RawRuneFile,
    RawSummonerFile,
    RawSummonerSpell,
    SnapshotMeta,
} from "./ddragon-raw.js";
import { createStatShards } from "./stat-shards.js";
import type {
    ChampionTag,
    StaticChampion,
    StaticChampionSpell,
    StaticChampionStats,
    StaticData,
    StaticItem,
    StaticRune,
    StaticRunePath,
    StaticSummonerSpell,
} from "./types.js";
import { createImageUrls } from "./urls.js";

/** File names a snapshot directory must contain. */
export const SNAPSHOT_FILES = {
    champions: "championFull.json",
    items: "item.json",
    runes: "runesReforged.json",
    summonerSpells: "summoner.json",
    meta: "meta.json",
} as const;

/** Summoner's Rift map id — the only map DraftPredict cares about. */
export const SUMMONERS_RIFT_MAP_ID = 11;

const SPELL_SLOTS = ["Q", "W", "E", "R"] as const;

export type LoadStaticDataOptions = {
    /** Read this exact directory, skipping all version resolution. */
    directory?: string;
    /** Load this patch specifically (from the cache dir, then the bundle). */
    version?: string;
    /** Where downloaded patches live. Defaults to `~/.draftpredict/static`. */
    cacheDir?: string;
    /** Where the bundled snapshots live. Defaults to the packaged assets. */
    bundleDir?: string;
    /**
     * Use a downloaded patch when it is newer than the bundled one.
     * Defaults to `true`; set `false` to pin the app to the bundle.
     */
    preferCache?: boolean;
    /** Reuse a previously loaded snapshot for the same directory. Default `true`. */
    memoize?: boolean;
    logger?: Logger;
};

const memo = new Map<string, StaticData>();

/**
 * Loads the static game data.
 *
 * Synchronous and self-contained: it reads the bundled Data Dragon snapshot
 * (or a newer downloaded one) off disk and returns fully indexed maps. Never
 * touches the network — see {@link StaticDataUpdater} for that.
 */
export function loadStaticData(opts: LoadStaticDataOptions = {}): StaticData {
    const logger = opts.logger ?? silentLogger;
    const resolved = resolveSnapshot(opts, logger);

    if (opts.memoize !== false) {
        const cached = memo.get(resolved.directory);
        if (cached) return cached;
    }

    const data = readSnapshot(resolved.directory, resolved.source);

    if (opts.memoize !== false) memo.set(resolved.directory, data);
    return data;
}

/** Drops the in-process snapshot cache (used by tests and after an update). */
export function clearStaticDataCache(): void {
    memo.clear();
}

// ------------------------------------------------------------- resolution ---

export type ResolvedSnapshot = {
    directory: string;
    version: string;
    source: "bundled" | "cache";
};

/**
 * Decides which snapshot directory to read: an explicit one, a requested
 * version, or the newest of (bundled, downloaded).
 */
export function resolveSnapshot(
    opts: LoadStaticDataOptions = {},
    logger: Logger = silentLogger,
): ResolvedSnapshot {
    const bundleDir = opts.bundleDir ?? getBundledDDragonRoot();
    const cacheDir = opts.cacheDir ?? getStaticCacheDir();

    if (opts.directory) {
        return {
            directory: opts.directory,
            version: readVersion(opts.directory) ?? "unknown",
            source: opts.directory.startsWith(cacheDir) ? "cache" : "bundled",
        };
    }

    const bundled = listSnapshots(bundleDir);
    if (bundled.length === 0) {
        throw new Error(
            `@draftpredict/data: no bundled Data Dragon snapshot found in ${bundleDir}`,
        );
    }
    const cached = opts.preferCache === false ? [] : listSnapshots(cacheDir);

    if (opts.version) {
        const fromCache = cached.find((v) => v === opts.version);
        if (fromCache) {
            return {
                directory: join(cacheDir, fromCache),
                version: fromCache,
                source: "cache",
            };
        }
        const fromBundle = bundled.find((v) => v === opts.version);
        if (fromBundle) {
            return {
                directory: join(bundleDir, fromBundle),
                version: fromBundle,
                source: "bundled",
            };
        }
        logger.warn(
            `static data: patch ${opts.version} is not available, falling back to the newest snapshot`,
        );
    }

    const newestBundled = bundled[bundled.length - 1];
    const newestCached = cached[cached.length - 1];

    if (newestCached && compareVersions(newestCached, newestBundled) > 0) {
        return {
            directory: join(cacheDir, newestCached),
            version: newestCached,
            source: "cache",
        };
    }

    return {
        directory: join(bundleDir, newestBundled),
        version: newestBundled,
        source: "bundled",
    };
}

/** Version directories inside `root` that hold a complete snapshot, oldest first. */
export function listSnapshots(root: string): string[] {
    if (!existsSync(root)) return [];

    let entries: string[];
    try {
        entries = readdirSync(root);
    } catch {
        return [];
    }

    return entries
        .filter((name) => {
            const dir = join(root, name);
            try {
                if (!statSync(dir).isDirectory()) return false;
            } catch {
                return false;
            }
            return isCompleteSnapshot(dir);
        })
        .sort(compareVersions);
}

/** True when every required Data Dragon file is present in `dir`. */
export function isCompleteSnapshot(dir: string): boolean {
    return (
        existsSync(join(dir, SNAPSHOT_FILES.champions)) &&
        existsSync(join(dir, SNAPSHOT_FILES.items)) &&
        existsSync(join(dir, SNAPSHOT_FILES.runes)) &&
        existsSync(join(dir, SNAPSHOT_FILES.summonerSpells))
    );
}

/**
 * Compares two patch strings ("16.9.1" < "16.17.1"). Segments are compared
 * numerically, so the usual lexicographic trap is avoided.
 */
export function compareVersions(a: string, b: string): number {
    const left = a.split(".");
    const right = b.split(".");
    const length = Math.max(left.length, right.length);

    for (let i = 0; i < length; i++) {
        const l = parseInt(left[i] ?? "0", 10);
        const r = parseInt(right[i] ?? "0", 10);
        if (Number.isNaN(l) || Number.isNaN(r)) {
            const cmp = (left[i] ?? "").localeCompare(right[i] ?? "");
            if (cmp !== 0) return cmp;
            continue;
        }
        if (l !== r) return l - r;
    }
    return 0;
}

function readVersion(dir: string): string | undefined {
    const metaPath = join(dir, SNAPSHOT_FILES.meta);
    if (existsSync(metaPath)) {
        try {
            return readJsonFile<SnapshotMeta>(metaPath).version;
        } catch {
            /* fall through to the champion file */
        }
    }
    try {
        return readJsonFile<{ version?: string }>(join(dir, SNAPSHOT_FILES.champions))
            .version;
    } catch {
        return undefined;
    }
}

// ----------------------------------------------------------------- reading ---

function readSnapshot(directory: string, source: "bundled" | "cache"): StaticData {
    const championFile = readJsonFile<RawChampionFile>(
        join(directory, SNAPSHOT_FILES.champions),
    );
    const itemFile = readJsonFile<RawItemFile>(join(directory, SNAPSHOT_FILES.items));
    const runeFile = readJsonFile<RawRuneFile>(join(directory, SNAPSHOT_FILES.runes));
    const summonerFile = readJsonFile<RawSummonerFile>(
        join(directory, SNAPSHOT_FILES.summonerSpells),
    );

    const metaPath = join(directory, SNAPSHOT_FILES.meta);
    const meta: SnapshotMeta = existsSync(metaPath)
        ? readJsonFile<SnapshotMeta>(metaPath)
        : { version: championFile.version };

    const version = meta.version ?? championFile.version;

    const champions = Object.values(championFile.data).map(normalizeChampion);
    const championsByKey = new Map(champions.map((c) => [c.key, c]));
    const championsById = new Map(champions.map((c) => [c.id, c]));
    const championList = [...champions].sort((a, b) => a.name.localeCompare(b.name));

    const items = Object.entries(itemFile.data)
        .map(([id, raw]) => normalizeItem(id, raw))
        .filter((item): item is StaticItem => item !== undefined)
        .sort((a, b) => a.id - b.id);
    const itemsById = new Map(items.map((i) => [i.id, i]));
    const purchasableItems = items.filter(isPurchasableOnRift);

    const { runePathsById, runePathList, runesById } = normalizeRunes(runeFile);

    const summonerSpells = Object.values(summonerFile.data)
        .map(normalizeSummonerSpell)
        .filter((s): s is StaticSummonerSpell => s !== undefined);
    const summonerSpellsById = new Map(summonerSpells.map((s) => [s.key, s]));
    const summonerSpellList = summonerSpells
        .filter((s) => s.modes.includes("CLASSIC"))
        .sort((a, b) => a.name.localeCompare(b.name));

    const shards = createStatShards();

    return {
        version,
        language: meta.language ?? "en_US",
        source,
        directory,

        championsByKey,
        championsById,
        championList,

        itemsById,
        purchasableItems,

        runesById,
        runePathsById,
        runePathList,

        summonerSpellsById,
        summonerSpellList,

        statShardsById: shards.byId,
        statShardRows: shards.rows,

        imageUrl: createImageUrls(version),
    };
}

function normalizeChampion(raw: RawChampion): StaticChampion {
    return {
        key: raw.key,
        id: raw.id,
        name: raw.name,
        title: raw.title,
        tags: (raw.tags ?? []) as ChampionTag[],
        partype: raw.partype,
        image: raw.image,
        stats: raw.stats as unknown as StaticChampionStats,
        spells: (raw.spells ?? [])
            .slice(0, 4)
            .map((spell, index): StaticChampionSpell => ({
                id: spell.id,
                name: spell.name,
                description: spell.description,
                slot: SPELL_SLOTS[index] ?? "R",
                maxrank: spell.maxrank,
                cooldownBurn: spell.cooldownBurn ?? "",
                costBurn: spell.costBurn ?? "",
                costType: spell.costType ?? "",
                rangeBurn: spell.rangeBurn ?? "",
                image: spell.image,
            })),
        passive: raw.passive
            ? {
                  name: raw.passive.name,
                  description: raw.passive.description,
                  image: raw.passive.image,
              }
            : undefined,
        info: raw.info,
    };
}

function normalizeItem(id: string, raw: RawItem): StaticItem | undefined {
    const numericId = parseInt(id, 10);
    if (!Number.isFinite(numericId)) return undefined;

    return {
        id: numericId,
        name: raw.name,
        description: raw.description ?? "",
        plaintext: raw.plaintext ?? "",
        colloq: (raw.colloq ?? "")
            .split(";")
            .map((part) => part.trim())
            .filter((part) => part.length > 0),
        gold: raw.gold ?? { base: 0, total: 0, sell: 0, purchasable: false },
        tags: raw.tags ?? [],
        from: (raw.from ?? []).map((v) => parseInt(v, 10)).filter(Number.isFinite),
        into: (raw.into ?? []).map((v) => parseInt(v, 10)).filter(Number.isFinite),
        maps: Object.fromEntries(
            Object.entries(raw.maps ?? {}).map(([mapId, ok]) => [
                parseInt(mapId, 10),
                ok,
            ]),
        ),
        stats: raw.stats ?? {},
        depth: raw.depth ?? 1,
        consumed: raw.consumed ?? false,
        inStore: raw.inStore ?? true,
        requiredChampion:
            raw.requiredChampion && raw.requiredChampion.length > 0
                ? raw.requiredChampion
                : undefined,
        image: raw.image,
    };
}

function isPurchasableOnRift(item: StaticItem): boolean {
    return (
        item.gold.purchasable &&
        item.gold.total > 0 &&
        item.inStore &&
        item.maps[SUMMONERS_RIFT_MAP_ID] === true
    );
}

function normalizeRunes(runeFile: RawRuneFile): {
    runesById: Map<number, StaticRune>;
    runePathsById: Map<number, StaticRunePath>;
    runePathList: StaticRunePath[];
} {
    const runesById = new Map<number, StaticRune>();
    const runePathsById = new Map<number, StaticRunePath>();
    const runePathList: StaticRunePath[] = [];

    for (const rawPath of runeFile) {
        const slots: StaticRune[][] = rawPath.slots.map((slot, slotIndex) =>
            slot.runes.map((rune, index) => {
                const normalized: StaticRune = {
                    id: rune.id,
                    key: rune.key,
                    name: rune.name,
                    shortDesc: rune.shortDesc,
                    longDesc: rune.longDesc,
                    icon: rune.icon,
                    path: rawPath.id,
                    slot: slotIndex,
                    index,
                    tier: slotIndex,
                };
                runesById.set(normalized.id, normalized);
                return normalized;
            }),
        );

        const path: StaticRunePath = {
            id: rawPath.id,
            key: rawPath.key,
            name: rawPath.name,
            icon: rawPath.icon,
            slots,
        };
        runePathsById.set(path.id, path);
        runePathList.push(path);
    }

    return { runesById, runePathsById, runePathList };
}

function normalizeSummonerSpell(
    raw: RawSummonerSpell,
): StaticSummonerSpell | undefined {
    const key = parseInt(raw.key, 10);
    if (!Number.isFinite(key)) return undefined;

    return {
        key,
        id: raw.id,
        name: raw.name,
        description: raw.description,
        cooldown: raw.cooldown?.[0] ?? 0,
        summonerLevel: raw.summonerLevel,
        modes: raw.modes ?? [],
        image: raw.image,
    };
}
