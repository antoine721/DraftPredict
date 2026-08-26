import type { Role } from "../Role.js";
import type { Stats } from "../Stats.js";

/** Stats for one build entity (an item, rune, spell set or skill choice). */
export type EntityStats = Stats;

export type PartialBuildDataset = {
    championKey: string;
    role: Role;
    wins: number;
    games: number;

    runes: RunesBuildData;
    items: ItemsBuildData;
    summonerSpells: SummonerSpellsBuildData;
    skills: SkillsBuildData;
};

export type FullBuildDataset = PartialBuildDataset & {
    matchups: BuildMatchupData[];
};

export type BuildMatchupData = {
    championKey: string;
    role: Role;
    wins: number;
    games: number;

    runes: RunesBuildData;
    items: ItemsBuildData;
    summonerSpells: SummonerSpellsBuildData;
    skills: SkillsBuildData;
};

export type RunesBuildData = {
    primary: Record<string, EntityStats>;
    secondary: Record<string, EntityStats>;
    shards: {
        offense: Record<string, EntityStats>;
        defense: Record<string, EntityStats>;
        flex: Record<string, EntityStats>;
    };
};

export type ItemsBuildData = {
    boots: Record<string, EntityStats>;
    /** One record per item slot in the build order (1st item, 2nd item, …). */
    statsByOrder: Record<string, EntityStats>[];
    startingSets: Record<string, EntityStats>;
    sets: Record<string, EntityStats>;
};

export type SummonerSpellsBuildData = Record<string, SummonerSpellStats>;

export type SummonerSpellStats = Stats;

export type Skill = "Q" | "W" | "E" | "R";

export const SKILLS: readonly Skill[] = ["Q", "W", "E", "R"];

export type SkillOrder = "QWE" | "QEW" | "WQE" | "WEQ" | "EQW" | "EWQ";

export const SKILL_ORDERS: readonly SkillOrder[] = [
    "QWE",
    "QEW",
    "WQE",
    "WEQ",
    "EQW",
    "EWQ",
];

export type SkillsBuildData = {
    order: Record<SkillOrder, EntityStats>;
    /** One record per champion level. */
    level: Record<Skill, EntityStats>[];
};
