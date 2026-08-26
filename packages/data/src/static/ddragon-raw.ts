/**
 * The raw shapes of the Data Dragon files shipped in `assets/ddragon/<version>`.
 *
 * These mirror the JSON exactly (including Riot's inconsistent casing) and are
 * only used while loading; the rest of the app consumes the normalized types
 * in `./types.ts`.
 */

export type RawImage = {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
};

export type RawChampionSpell = {
    id: string;
    name: string;
    description: string;
    tooltip?: string;
    maxrank: number;
    cooldown?: number[];
    cooldownBurn?: string;
    cost?: number[];
    costBurn?: string;
    costType?: string;
    range?: (number | string)[];
    rangeBurn?: string;
    image: RawImage;
    resource?: string;
};

export type RawChampionPassive = {
    name: string;
    description: string;
    image: RawImage;
};

export type RawChampionStats = Record<string, number>;

export type RawChampion = {
    id: string;
    key: string;
    name: string;
    title: string;
    image: RawImage;
    lore?: string;
    blurb?: string;
    tags: string[];
    partype: string;
    info?: { attack: number; defense: number; magic: number; difficulty: number };
    stats: RawChampionStats;
    spells?: RawChampionSpell[];
    passive?: RawChampionPassive;
};

export type RawChampionFile = {
    type: string;
    format?: string;
    version: string;
    data: Record<string, RawChampion>;
    keys?: Record<string, string>;
};

export type RawItem = {
    name: string;
    description?: string;
    colloq?: string;
    plaintext?: string;
    from?: string[];
    into?: string[];
    image: RawImage;
    gold?: { base: number; total: number; sell: number; purchasable: boolean };
    tags?: string[];
    maps?: Record<string, boolean>;
    stats?: Record<string, number>;
    depth?: number;
    consumed?: boolean;
    inStore?: boolean;
    hideFromAll?: boolean;
    requiredChampion?: string;
    requiredAlly?: string;
    specialRecipe?: number;
};

export type RawItemFile = {
    type: string;
    version: string;
    basic?: unknown;
    data: Record<string, RawItem>;
    groups?: { id: string; MaxGroupOwnable: string }[];
    tree?: { header: string; tags: string[] }[];
};

export type RawRune = {
    id: number;
    key: string;
    icon: string;
    name: string;
    shortDesc: string;
    longDesc: string;
};

export type RawRuneSlot = {
    runes: RawRune[];
};

export type RawRunePath = {
    id: number;
    key: string;
    icon: string;
    name: string;
    slots: RawRuneSlot[];
};

export type RawRuneFile = RawRunePath[];

export type RawSummonerSpell = {
    id: string;
    name: string;
    description: string;
    tooltip?: string;
    maxrank: number;
    cooldown?: number[];
    cooldownBurn?: string;
    cost?: number[];
    costBurn?: string;
    costType?: string;
    key: string;
    summonerLevel: number;
    modes: string[];
    image: RawImage;
};

export type RawSummonerFile = {
    type: string;
    version: string;
    data: Record<string, RawSummonerSpell>;
};

/** `meta.json` written next to each snapshot by the vendoring script. */
export type SnapshotMeta = {
    version: string;
    language?: string;
    source?: string;
    fetchedAt?: string;
};
