import type {
    ChampionData,
    ChampionRoleData,
    Dataset,
    ItemData,
    Role,
    RuneData,
    RunePathData,
    StatShardData,
    SummonerSpellData,
} from "@draftpredict/core";
import {
    DATASET_VERSION,
    ROLES,
    defaultChampionData,
    removeRankBias as applyRemoveRankBias,
} from "@draftpredict/core";
import type { StaticData } from "@draftpredict/data";

import type { MatchRecord, ParticipantRecord } from "./types.js";

export type DatasetAccumulatorOptions = {
    /** Champion list and item/rune/spell catalogues for the finished dataset. */
    staticData?: StaticData;
    /** Dataset `version` field. Defaults to DraftGap dataset v5. */
    version?: string;
    /** Dataset `date` field. Defaults to the day `finish()` runs. */
    date?: string;
    /**
     * Emit an entry for every champion in the static data, even one nobody
     * played. `analyzeChampion` indexes `championData[key].statsByRole[role]`
     * without a guard, so a dataset that is missing a pickable champion makes
     * the engine throw. Default `true`.
     */
    includeAllChampions?: boolean;
    /** Record the matchup matrix. Default `true`. */
    matchups?: boolean;
    /** Record the synergy matrix. Default `true`. */
    synergies?: boolean;
};

export type FinishOptions = {
    /** Drop matchup/synergy entries with fewer games than this. */
    minGames?: number;
    /** Shift every winrate so the average champion sits at exactly 50%. */
    removeRankBias?: boolean;
    date?: string;
};

/**
 * Folds matches into a DraftGap-v5 {@link Dataset}, one match at a time.
 *
 * Nothing but the growing dataset is held: `add()` never keeps a reference to
 * the record it was given, so a build can stream a hundred gigabytes of shards
 * through a process whose peak memory is the size of the output.
 *
 * What one match contributes:
 *
 *  - 10 champion-role samples (`games`, `wins`, damage totals, a time bucket);
 *  - 50 matchup samples — every ally against every enemy, recorded from both
 *    sides so `analyzeMatchups`, which averages the two directions, sees a
 *    consistent count;
 *  - 40 synergy samples — every ordered pair of team mates on both teams.
 */
export class DatasetAccumulator {
    private readonly championData = new Map<string, ChampionData>();
    private readonly options: DatasetAccumulatorOptions;
    private readonly recordMatchups: boolean;
    private readonly recordSynergies: boolean;

    private matchCount = 0;
    private participantCount = 0;

    constructor(options: DatasetAccumulatorOptions = {}) {
        this.options = options;
        this.recordMatchups = options.matchups ?? true;
        this.recordSynergies = options.synergies ?? true;
    }

    get matches(): number {
        return this.matchCount;
    }

    get participants(): number {
        return this.participantCount;
    }

    /** Champion keys seen in at least one match. */
    get championKeys(): string[] {
        return [...this.championData.keys()];
    }

    add(record: MatchRecord): void {
        this.matchCount += 1;

        for (const participant of record.participants) {
            this.participantCount += 1;
            const roleData = this.roleData(participant.championKey, participant.role);

            roleData.games += 1;
            if (participant.win) roleData.wins += 1;

            roleData.damageProfile.magic += participant.damage.magic;
            roleData.damageProfile.physical += participant.damage.physical;
            roleData.damageProfile.true += participant.damage.true;

            if (record.timeBucket !== null) {
                const bucket = roleData.statsByTime[record.timeBucket];
                bucket.games += 1;
                if (participant.win) bucket.wins += 1;
            }
        }

        if (this.recordMatchups) this.addMatchups(record.participants);
        if (this.recordSynergies) this.addSynergies(record.participants);
    }

    private addMatchups(participants: readonly ParticipantRecord[]): void {
        for (const self of participants) {
            const roleData = this.roleData(self.championKey, self.role);
            for (const other of participants) {
                if (other.teamId === self.teamId) continue;
                const bucket = roleData.matchup[other.role];
                const entry = (bucket[other.championKey] ??= {
                    championKey: other.championKey,
                    wins: 0,
                    games: 0,
                });
                entry.games += 1;
                if (self.win) entry.wins += 1;
            }
        }
    }

    private addSynergies(participants: readonly ParticipantRecord[]): void {
        for (const self of participants) {
            const roleData = this.roleData(self.championKey, self.role);
            for (const other of participants) {
                if (other === self || other.teamId !== self.teamId) continue;
                const bucket = roleData.synergy[other.role];
                const entry = (bucket[other.championKey] ??= {
                    championKey: other.championKey,
                    wins: 0,
                    games: 0,
                });
                entry.games += 1;
                if (self.win) entry.wins += 1;
            }
        }
    }

    private roleData(championKey: string, role: Role): ChampionRoleData {
        let champion = this.championData.get(championKey);
        if (!champion) {
            champion = this.newChampion(championKey);
            this.championData.set(championKey, champion);
        }
        return champion.statsByRole[role];
    }

    private newChampion(championKey: string): ChampionData {
        const staticChampion = this.options.staticData?.championsByKey.get(championKey);
        return defaultChampionData(
            championKey,
            staticChampion?.id ?? championKey,
            staticChampion?.name ?? staticChampion?.id ?? championKey,
        );
    }

    /**
     * Materialises the dataset.
     *
     * The champion entries are handed over rather than copied — cloning a
     * multi-gigabyte dataset to be polite would defeat the point of streaming —
     * so treat the accumulator as spent once `finish()` has returned,
     * especially with `removeRankBias`, which rewrites every winrate in place.
     */
    finish(options: FinishOptions = {}): Dataset {
        const staticData = this.options.staticData;

        if (this.options.includeAllChampions !== false && staticData) {
            for (const champion of staticData.championList) {
                if (!this.championData.has(champion.key)) {
                    this.championData.set(champion.key, this.newChampion(champion.key));
                }
            }
        }

        const championData: Record<string, ChampionData> = {};
        for (const [key, champion] of [...this.championData].sort(
            (a, b) => Number(a[0]) - Number(b[0]),
        )) {
            for (const role of ROLES) {
                const roleData = champion.statsByRole[role];
                normalizeDamage(roleData);
                if (options.minGames && options.minGames > 1) {
                    pruneLeaves(roleData, options.minGames);
                }
            }
            championData[key] = champion;
        }

        const dataset: Dataset = {
            version: this.options.version ?? DATASET_VERSION,
            date: options.date ?? this.options.date ?? new Date().toISOString().slice(0, 10),
            championData,
            itemData: buildItemData(staticData),
            runeData: buildRuneData(staticData),
            runePathData: buildRunePathData(staticData),
            statShardData: buildStatShardData(staticData),
            summonerSpellData: buildSummonerSpellData(staticData),
        };

        if (options.removeRankBias) applyRemoveRankBias(dataset);

        return dataset;
    }
}

/**
 * Damage profiles are stored as fractions of the champion's own damage, the
 * same convention the bundled fixture uses, so summing a team's profiles gives
 * a readable distribution.
 */
function normalizeDamage(roleData: ChampionRoleData): void {
    const profile = roleData.damageProfile;
    const total = profile.magic + profile.physical + profile.true;
    if (total <= 0) {
        profile.magic = 0;
        profile.physical = 0;
        profile.true = 0;
        return;
    }
    profile.magic = round4(profile.magic / total);
    profile.physical = round4(profile.physical / total);
    profile.true = round4(profile.true / total);
}

function pruneLeaves(roleData: ChampionRoleData, minGames: number): void {
    for (const role of ROLES) {
        for (const [key, entry] of Object.entries(roleData.matchup[role])) {
            if (entry.games < minGames) delete roleData.matchup[role][key];
        }
        for (const [key, entry] of Object.entries(roleData.synergy[role])) {
            if (entry.games < minGames) delete roleData.synergy[role][key];
        }
    }
}

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

// --- catalogues -------------------------------------------------------------
// Mirrors what `@draftpredict/data`'s fixture generator writes, so a pipeline
// dataset and a fixture dataset are interchangeable for the UI.

function buildItemData(staticData: StaticData | undefined): Record<number, ItemData> {
    if (!staticData) return {};
    const items: Record<number, ItemData> = {};
    for (const item of staticData.purchasableItems) {
        items[item.id] = { id: item.id, name: item.name, gold: item.gold.total };
    }
    return items;
}

function buildRuneData(staticData: StaticData | undefined): Record<number, RuneData> {
    if (!staticData) return {};
    const runes: Record<number, RuneData> = {};
    for (const rune of staticData.runesById.values()) {
        runes[rune.id] = {
            id: rune.id,
            key: rune.key,
            name: rune.name,
            icon: rune.icon,
            pathId: rune.path,
            slot: rune.slot,
            index: rune.index,
        };
    }
    return runes;
}

function buildRunePathData(
    staticData: StaticData | undefined,
): Record<number, RunePathData> {
    if (!staticData) return {};
    const paths: Record<number, RunePathData> = {};
    for (const path of staticData.runePathsById.values()) {
        paths[path.id] = { id: path.id, key: path.key, name: path.name, icon: path.icon };
    }
    return paths;
}

function buildStatShardData(
    staticData: StaticData | undefined,
): Record<number, StatShardData> {
    if (!staticData) return {};
    const shards: Record<number, StatShardData> = {};
    for (const shard of staticData.statShardsById.values()) {
        shards[shard.id] = {
            id: shard.id,
            key: shard.key,
            name: shard.name,
            positions: shard.positions.map((position) => ({
                slot: position.slotIndex,
                index: position.index,
            })),
        };
    }
    return shards;
}

function buildSummonerSpellData(
    staticData: StaticData | undefined,
): Record<number, SummonerSpellData> {
    if (!staticData) return {};
    const spells: Record<number, SummonerSpellData> = {};
    for (const spell of staticData.summonerSpellList) {
        spells[spell.key] = { id: spell.id, key: spell.key, name: spell.name };
    }
    return spells;
}
