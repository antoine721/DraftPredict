import type {
    StaticChampion,
    StaticData,
    StaticItem,
    StaticRune,
    StaticRunePath,
    StaticStatShard,
    StaticSummonerSpell,
} from "@draftpredict/data";
import { searchChampions } from "@draftpredict/data";
import type { CachedJson } from "../util/etag.js";
import { lazyJson } from "../util/etag.js";

/**
 * The static catalogue, serialized once.
 *
 * A patch's champion/item/rune data is immutable for as long as the process
 * lives, so each payload is built lazily on first request, cached with a strong
 * ETag and then served straight from a string.
 */

export type ChampionSummary = {
    /** Dataset key — the numeric champion key as a string. */
    key: string;
    /** Data Dragon id, e.g. `MonkeyKing`. */
    id: string;
    name: string;
    title: string;
    tags: string[];
    /** Ready-to-render square portrait URL (Data Dragon CDN). */
    icon: string;
};

export type StaticSummary = {
    version: string;
    language: string;
    source: StaticData["source"];
    counts: {
        champions: number;
        items: number;
        runes: number;
        summonerSpells: number;
    };
    champions: ChampionSummary[];
};

export class StaticDataService {
    readonly data: StaticData;

    private readonly summaryJson: () => CachedJson;
    private readonly championsJson: () => CachedJson;
    private readonly itemsJson: () => CachedJson;
    private readonly runesJson: () => CachedJson;
    private readonly summonerSpellsJson: () => CachedJson;

    constructor(data: StaticData) {
        this.data = data;
        this.summaryJson = lazyJson(() => this.buildSummary());
        this.championsJson = lazyJson(() => ({
            version: data.version,
            language: data.language,
            source: data.source,
            champions: data.championList.map((champion) =>
                this.describeChampion(champion),
            ),
        }));
        this.itemsJson = lazyJson(() => ({
            version: data.version,
            items: data.purchasableItems.map((item) => this.describeItem(item)),
        }));
        this.runesJson = lazyJson(() => ({
            version: data.version,
            paths: data.runePathList.map((path) => this.describeRunePath(path)),
            shardRows: data.statShardRows.map((row) =>
                row.map((shard) => this.describeStatShard(shard)),
            ),
        }));
        this.summonerSpellsJson = lazyJson(() => ({
            version: data.version,
            summonerSpells: data.summonerSpellList.map((spell) =>
                this.describeSummonerSpell(spell),
            ),
        }));
    }

    get version(): string {
        return this.data.version;
    }

    // ------------------------------------------------------------ payloads --

    summary(): CachedJson {
        return this.summaryJson();
    }

    champions(): CachedJson {
        return this.championsJson();
    }

    items(): CachedJson {
        return this.itemsJson();
    }

    runes(): CachedJson {
        return this.runesJson();
    }

    summonerSpells(): CachedJson {
        return this.summonerSpellsJson();
    }

    search(query: string, limit = 10): ChampionSummary[] {
        return searchChampions(this.data, query, limit).map((result) =>
            this.championSummary(result.champion),
        );
    }

    // ------------------------------------------------------------ lookups ---

    champion(key: string): StaticChampion | undefined {
        return (
            this.data.championsByKey.get(key) ?? this.data.championsById.get(key)
        );
    }

    championName(key: string): string | null {
        return this.champion(key)?.name ?? null;
    }

    championIcon(key: string): string | null {
        const champion = this.champion(key);
        return champion ? this.data.imageUrl.championSquare(champion) : null;
    }

    /** `{key, name, icon}` for a dataset champion key, resolved for the UI. */
    championRef(key: string): { key: string; id: string | null; name: string | null; icon: string | null } {
        const champion = this.champion(key);
        return {
            key,
            id: champion?.id ?? null,
            name: champion?.name ?? null,
            icon: champion ? this.data.imageUrl.championSquare(champion) : null,
        };
    }

    itemRef(id: number): { id: number; name: string | null; icon: string; gold: number | null } {
        const item = this.data.itemsById.get(id);
        return {
            id,
            name: item?.name ?? null,
            icon: this.data.imageUrl.item(item ?? id),
            gold: item?.gold.total ?? null,
        };
    }

    runeRef(id: number): { id: number; name: string | null; icon: string | null; path: number | null; slot: number | null } {
        const rune = this.data.runesById.get(id) ?? this.data.statShardsById.get(id);
        if (!rune) return { id, name: null, icon: null, path: null, slot: null };
        const isShard = !("path" in rune);
        return {
            id,
            name: rune.name,
            icon: this.data.imageUrl.rune(rune),
            path: isShard ? null : (rune as StaticRune).path,
            slot: isShard ? null : (rune as StaticRune).slot,
        };
    }

    summonerSpellRef(id: number): { id: number; name: string | null; icon: string | null } {
        const spell = this.data.summonerSpellsById.get(id);
        return {
            id,
            name: spell?.name ?? null,
            icon: spell ? this.data.imageUrl.summonerSpell(spell) : null,
        };
    }

    championSummary(champion: StaticChampion): ChampionSummary {
        return {
            key: champion.key,
            id: champion.id,
            name: champion.name,
            title: champion.title,
            tags: champion.tags,
            icon: this.data.imageUrl.championSquare(champion),
        };
    }

    // --------------------------------------------------------- serializers --

    private buildSummary(): StaticSummary {
        return {
            version: this.data.version,
            language: this.data.language,
            source: this.data.source,
            counts: {
                champions: this.data.championList.length,
                items: this.data.purchasableItems.length,
                runes: this.data.runesById.size,
                summonerSpells: this.data.summonerSpellList.length,
            },
            champions: this.data.championList.map((champion) =>
                this.championSummary(champion),
            ),
        };
    }

    private describeChampion(champion: StaticChampion): Record<string, unknown> {
        const urls = this.data.imageUrl;
        return {
            ...this.championSummary(champion),
            partype: champion.partype,
            info: champion.info ?? null,
            stats: champion.stats,
            splash: urls.championSplash(champion),
            loading: urls.championLoading(champion),
            passive: champion.passive
                ? {
                      name: champion.passive.name,
                      description: champion.passive.description,
                      icon: urls.championPassive(champion),
                  }
                : null,
            spells: champion.spells.map((spell) => ({
                id: spell.id,
                slot: spell.slot,
                name: spell.name,
                description: spell.description,
                cooldown: spell.cooldownBurn,
                cost: spell.costBurn,
                costType: spell.costType,
                range: spell.rangeBurn,
                icon: urls.championSpell(spell),
            })),
        };
    }

    private describeItem(item: StaticItem): Record<string, unknown> {
        return {
            id: item.id,
            name: item.name,
            plaintext: item.plaintext,
            description: item.description,
            gold: item.gold,
            tags: item.tags,
            from: item.from,
            into: item.into,
            depth: item.depth,
            stats: item.stats,
            icon: this.data.imageUrl.item(item),
        };
    }

    private describeRunePath(path: StaticRunePath): Record<string, unknown> {
        return {
            id: path.id,
            key: path.key,
            name: path.name,
            icon: this.data.imageUrl.rune(path),
            slots: path.slots.map((slot) =>
                slot.map((rune: StaticRune) => ({
                    id: rune.id,
                    key: rune.key,
                    name: rune.name,
                    shortDesc: rune.shortDesc,
                    longDesc: rune.longDesc,
                    slot: rune.slot,
                    index: rune.index,
                    icon: this.data.imageUrl.rune(rune),
                })),
            ),
        };
    }

    private describeStatShard(shard: StaticStatShard): Record<string, unknown> {
        return {
            id: shard.id,
            key: shard.key,
            name: shard.name,
            icon: this.data.imageUrl.rune(shard),
            positions: shard.positions,
        };
    }

    private describeSummonerSpell(spell: StaticSummonerSpell): Record<string, unknown> {
        return {
            key: spell.key,
            id: spell.id,
            name: spell.name,
            description: spell.description,
            cooldown: spell.cooldown,
            summonerLevel: spell.summonerLevel,
            modes: spell.modes,
            icon: this.data.imageUrl.summonerSpell(spell),
        };
    }
}
