import type {
    BuildMatchupData,
    EntityStats,
    FullBuildDataset,
    ItemsBuildData,
    Role,
    RunesBuildData,
    Skill,
    SkillsBuildData,
    SummonerSpellsBuildData,
} from "@draftpredict/core";
import {
    BUILD_ITEM_ORDER_LENGTH,
    DATASET_VERSION,
    emptyItemsBuildData,
    emptyRunesBuildData,
    emptySkillsBuildData,
    normalizeItemSetId,
    normalizeSummonerSpellSetId,
} from "@draftpredict/core";

import type { MatchRecord, ParticipantRecord } from "./types.js";

/** Champion levels a skill table covers. */
export const CHAMPION_LEVELS = 18;

/** Minimum number of finished items before an inventory counts as a "set". */
export const MIN_SET_ITEMS = 3;

/**
 * The pipeline's build dataset: one `FullBuildDataset` per champion **and**
 * role, keyed `"<championKey>:<role>"`.
 *
 * `@draftpredict/core` analyses one champion at a time (`analyzeBuild` takes a
 * patch dataset and a 30-day dataset for a single champion/role), so the file
 * is a plain map the server can index into and hand out entry by entry.
 */
export type BuildDatasetFile = {
    version: string;
    date: string;
    patch?: string;
    rank?: string;
    region?: string;
    window?: string;
    /** Matches that contributed. */
    matches?: number;
    entries: Record<string, FullBuildDataset>;
};

export function buildEntryKey(championKey: string, role: Role): string {
    return `${championKey}:${role}`;
}

export type BuildAccumulatorOptions = {
    version?: string;
    date?: string;
    /** Record per-lane-opponent build data. Default `true`. */
    matchups?: boolean;
};

export type BuildFinishOptions = {
    /** Drop champion/role entries below this many games. */
    minGames?: number;
    /** Drop matchup entries below this many games. Defaults to `minGames`. */
    minMatchupGames?: number;
    date?: string;
    patch?: string;
    rank?: string;
    region?: string;
    window?: string;
};

type Entry = FullBuildDataset & {
    matchupIndex: Map<string, BuildMatchupData>;
};

/**
 * Folds matches into per-champion build data: runes, items, summoner spells
 * and skill order, with the lane opponent tracked separately.
 *
 * Items and skills degrade with the input: rune pages, spells, boots and the
 * finished item set come from the match itself, while the item *order*, the
 * starting set and the skill order need the match timeline (`collect
 * --timelines`) and are simply absent otherwise.
 */
export class BuildDatasetAccumulator {
    private readonly entries = new Map<string, Entry>();
    private readonly options: BuildAccumulatorOptions;
    private readonly recordMatchups: boolean;
    private matchCount = 0;

    constructor(options: BuildAccumulatorOptions = {}) {
        this.options = options;
        this.recordMatchups = options.matchups ?? true;
    }

    get size(): number {
        return this.entries.size;
    }

    get matches(): number {
        return this.matchCount;
    }

    add(record: MatchRecord): void {
        this.matchCount += 1;

        for (const participant of record.participants) {
            const entry = this.entry(participant.championKey, participant.role);
            entry.games += 1;
            if (participant.win) entry.wins += 1;
            applyParticipant(entry, participant);

            if (!this.recordMatchups) continue;
            const opponent = record.participants.find(
                (other) =>
                    other.teamId !== participant.teamId && other.role === participant.role,
            );
            if (!opponent) continue;

            const matchup = this.matchup(entry, opponent.championKey, opponent.role);
            matchup.games += 1;
            if (participant.win) matchup.wins += 1;
            applyParticipant(matchup, participant);
        }
    }

    private entry(championKey: string, role: Role): Entry {
        const key = buildEntryKey(championKey, role);
        let entry = this.entries.get(key);
        if (!entry) {
            entry = {
                championKey,
                role,
                wins: 0,
                games: 0,
                runes: emptyRunesBuildData(),
                items: emptyItemsBuildData(BUILD_ITEM_ORDER_LENGTH),
                summonerSpells: {},
                skills: emptySkillsBuildData(CHAMPION_LEVELS),
                matchups: [],
                matchupIndex: new Map(),
            };
            this.entries.set(key, entry);
        }
        return entry;
    }

    private matchup(entry: Entry, championKey: string, role: Role): BuildMatchupData {
        const key = buildEntryKey(championKey, role);
        let matchup = entry.matchupIndex.get(key);
        if (!matchup) {
            matchup = {
                championKey,
                role,
                wins: 0,
                games: 0,
                runes: emptyRunesBuildData(),
                items: emptyItemsBuildData(BUILD_ITEM_ORDER_LENGTH),
                summonerSpells: {},
                skills: emptySkillsBuildData(CHAMPION_LEVELS),
            };
            entry.matchupIndex.set(key, matchup);
            entry.matchups.push(matchup);
        }
        return matchup;
    }

    /** Look one entry up, for tests and for the server's in-process rebuild. */
    get(championKey: string, role: Role): FullBuildDataset | undefined {
        return this.entries.get(buildEntryKey(championKey, role));
    }

    finish(options: BuildFinishOptions = {}): BuildDatasetFile {
        const minGames = options.minGames ?? 0;
        const minMatchupGames = options.minMatchupGames ?? minGames;

        const entries: Record<string, FullBuildDataset> = {};
        for (const [key, entry] of this.entries) {
            if (entry.games < minGames) continue;
            const matchups = entry.matchups.filter(
                (matchup) => matchup.games >= minMatchupGames,
            );
            entries[key] = {
                championKey: entry.championKey,
                role: entry.role,
                wins: entry.wins,
                games: entry.games,
                runes: entry.runes,
                items: entry.items,
                summonerSpells: entry.summonerSpells,
                skills: entry.skills,
                matchups,
            };
        }

        return {
            version: this.options.version ?? DATASET_VERSION,
            date:
                options.date ??
                this.options.date ??
                new Date().toISOString().slice(0, 10),
            patch: options.patch,
            rank: options.rank,
            region: options.region,
            window: options.window,
            matches: this.matchCount,
            entries,
        };
    }
}

type BuildBuckets = {
    runes: RunesBuildData;
    items: ItemsBuildData;
    summonerSpells: SummonerSpellsBuildData;
    skills: SkillsBuildData;
};

function applyParticipant(target: BuildBuckets, participant: ParticipantRecord): void {
    const win = participant.win ? 1 : 0;

    const runes = participant.runes;
    if (runes) {
        for (const perk of runes.primary) bump(target.runes.primary, String(perk), win);
        for (const perk of runes.secondary) {
            bump(target.runes.secondary, String(perk), win);
        }
        if (runes.secondaryPath > 0) {
            bump(target.runes.secondary, String(runes.secondaryPath), win);
        }
        const [offense, flex, defense] = runes.shards;
        if (offense > 0) bump(target.runes.shards.offense, String(offense), win);
        if (flex > 0) bump(target.runes.shards.flex, String(flex), win);
        if (defense > 0) bump(target.runes.shards.defense, String(defense), win);
    }

    if (participant.boots !== undefined) {
        bump(target.items.boots, String(participant.boots), win);
    }
    if (participant.items.length >= MIN_SET_ITEMS) {
        bump(target.items.sets, normalizeItemSetId(participant.items), win);
    }

    const build = participant.build;
    if (build) {
        if (build.startingItems.length > 0) {
            bump(target.items.startingSets, normalizeItemSetId(build.startingItems), win);
        }
        build.itemOrder.forEach((itemId, index) => {
            const slot = target.items.statsByOrder[index];
            if (slot) bump(slot, String(itemId), win);
        });
        if (build.skillOrder) bump(target.skills.order, build.skillOrder, win);
        build.skillLevels.forEach((skill, index) => {
            const level = target.skills.level[index];
            if (level) bump(level as Record<Skill, EntityStats>, skill, win);
        });
    }

    const [first, second] = participant.spells;
    if (first > 0 && second > 0) {
        bump(
            target.summonerSpells,
            normalizeSummonerSpellSetId(`${first}_${second}`),
            win,
        );
    }
}

function bump(bucket: Record<string, EntityStats>, key: string, win: number): void {
    const entry = (bucket[key] ??= { wins: 0, games: 0 });
    entry.games += 1;
    entry.wins += win;
}
