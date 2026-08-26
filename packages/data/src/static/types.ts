import type { RawImage } from "./ddragon-raw.js";

/**
 * Normalized static game data.
 *
 * "Static" is Riot's own term for the patch-scoped catalogue of champions,
 * items, runes and summoner spells — the things that change when the game
 * patches, not when someone plays a match.
 */

export type StaticImage = RawImage;

export type StaticChampionStats = {
    hp: number;
    hpperlevel: number;
    mp: number;
    mpperlevel: number;
    movespeed: number;
    armor: number;
    armorperlevel: number;
    spellblock: number;
    spellblockperlevel: number;
    attackrange: number;
    hpregen: number;
    hpregenperlevel: number;
    mpregen: number;
    mpregenperlevel: number;
    crit: number;
    critperlevel: number;
    attackdamage: number;
    attackdamageperlevel: number;
    attackspeedperlevel: number;
    attackspeed: number;
};

/** One of Riot's six champion class tags. */
export type ChampionTag =
    "Fighter" | "Mage" | "Assassin" | "Marksman" | "Tank" | "Support";

export type StaticChampionSpell = {
    /** e.g. "AatroxQ". */
    id: string;
    name: string;
    description: string;
    /** "Q" | "W" | "E" | "R", derived from the spell's position. */
    slot: "Q" | "W" | "E" | "R";
    maxrank: number;
    cooldownBurn: string;
    costBurn: string;
    costType: string;
    rangeBurn: string;
    image: StaticImage;
};

export type StaticChampionPassive = {
    name: string;
    description: string;
    image: StaticImage;
};

export type StaticChampion = {
    /** Numeric champion key as a string, e.g. "266". The dataset key. */
    key: string;
    /** Data Dragon id, e.g. "Aatrox" / "MonkeyKing". */
    id: string;
    name: string;
    title: string;
    tags: ChampionTag[];
    /** Resource bar name, e.g. "Mana", "Energy", "Blood Well". */
    partype: string;
    image: StaticImage;
    stats: StaticChampionStats;
    spells: StaticChampionSpell[];
    passive: StaticChampionPassive | undefined;
    /** Riot's 0-10 ratings, when the snapshot carries them. */
    info:
        | { attack: number; defense: number; magic: number; difficulty: number }
        | undefined;
};

export type StaticItemGold = {
    base: number;
    total: number;
    sell: number;
    purchasable: boolean;
};

export type StaticItem = {
    /** Numeric item id. */
    id: number;
    name: string;
    /** Riot's rich-text description (contains markup tags). */
    description: string;
    /** Short human-readable summary. */
    plaintext: string;
    /** Search aliases Riot ships with the item ("bork", "botrk", …). */
    colloq: string[];
    gold: StaticItemGold;
    tags: string[];
    /** Components this item is built from. */
    from: number[];
    /** Items this item builds into. */
    into: number[];
    /** Map id -> whether the item is available there (11 = Summoner's Rift). */
    maps: Record<number, boolean>;
    /** Flat stat modifiers, using Riot's `FlatPhysicalDamageMod`-style keys. */
    stats: Record<string, number>;
    /** How deep in a build tree the item sits (1 = basic). */
    depth: number;
    consumed: boolean;
    inStore: boolean;
    requiredChampion: string | undefined;
    image: StaticImage;
};

export type StaticRune = {
    id: number;
    /** e.g. "Electrocute". */
    key: string;
    name: string;
    shortDesc: string;
    longDesc: string;
    /** Path-relative icon, e.g. "perk-images/Styles/…png". */
    icon: string;
    /** Id of the path this rune belongs to. */
    path: number;
    /** 0 = keystone row, 1-3 = minor rows. */
    slot: number;
    /** Index within the slot. */
    index: number;
    /**
     * Alias of {@link StaticRune.slot}, kept because Riot's own tooling calls
     * the keystone row "tier 0".
     */
    tier: number;
};

export type StaticRunePath = {
    id: number;
    /** e.g. "Domination". */
    key: string;
    name: string;
    icon: string;
    /** Runes of this path, grouped by slot (index 0 = keystones). */
    slots: StaticRune[][];
};

export type StaticSummonerSpell = {
    /** Numeric spell key, e.g. 4 for Flash. */
    key: number;
    /** Data Dragon id, e.g. "SummonerFlash". */
    id: string;
    name: string;
    description: string;
    cooldown: number;
    summonerLevel: number;
    /** Game modes the spell is available in, e.g. "CLASSIC", "ARAM". */
    modes: string[];
    image: StaticImage;
};

/** The three stat shard rows. */
export type StatShardSlot = "offense" | "flex" | "defense";

export type StaticStatShard = {
    id: number;
    /** e.g. "AdaptiveForce". */
    key: string;
    name: string;
    /** Path-relative icon, e.g. "perk-images/StatMods/…png". */
    icon: string;
    /** Rows this shard can be picked in; a shard may appear in two rows. */
    positions: { slot: StatShardSlot; slotIndex: number; index: number }[];
};

/** Data Dragon CDN URL builders, bound to a patch version. */
export type ImageUrls = {
    version: string;
    championSquare(champion: StaticChampion | string): string;
    championLoading(champion: StaticChampion | string, skin?: number): string;
    championSplash(champion: StaticChampion | string, skin?: number): string;
    championPassive(champion: StaticChampion): string;
    championSpell(spell: StaticChampionSpell): string;
    item(item: StaticItem | number): string;
    rune(rune: StaticRune | StaticRunePath | StaticStatShard | string): string;
    summonerSpell(spell: StaticSummonerSpell | string): string;
    /** Sprite sheet a Data Dragon image belongs to. */
    sprite(image: StaticImage): string;
};

export type StaticData = {
    /** Patch this data describes, e.g. "16.17.1". */
    version: string;
    /** Language of the snapshot, e.g. "en_US". */
    language: string;
    /** Where the data came from: the bundled snapshot or a downloaded patch. */
    source: "bundled" | "cache";
    /** Directory the files were read from. */
    directory: string;

    championsByKey: Map<string, StaticChampion>;
    championsById: Map<string, StaticChampion>;
    /** Every champion, sorted by name. */
    championList: StaticChampion[];

    itemsById: Map<number, StaticItem>;
    /** Items that can actually be bought on Summoner's Rift. */
    purchasableItems: StaticItem[];

    runesById: Map<number, StaticRune>;
    runePathsById: Map<number, StaticRunePath>;
    /** Rune paths in Data Dragon order. */
    runePathList: StaticRunePath[];

    summonerSpellsById: Map<number, StaticSummonerSpell>;
    /** Summoner spells playable in Summoner's Rift draft, sorted by name. */
    summonerSpellList: StaticSummonerSpell[];

    statShardsById: Map<number, StaticStatShard>;
    /** The three shard rows, offense first. */
    statShardRows: StaticStatShard[][];

    imageUrl: ImageUrls;
};
