import type {
    AnalyzeDraftConfig,
    BuildAnalysisResult,
    Dataset,
    EntityAnalysisResult,
    EntityStats,
    PartialBuildDataset,
    Role,
    Skill,
    SkillOrder,
} from "@draftpredict/core";
import { ROLES, analyzeBuild, ratingToWinrate } from "@draftpredict/core";
import { generateFixtureBuildDataset } from "@draftpredict/data";
import type { StaticDataService } from "./static-data.js";

/**
 * Build analysis, resolved for rendering.
 *
 * `@draftpredict/core` rates every item, rune, spell and skill choice but
 * speaks only in ids and ratings. This turns that into sorted lists carrying
 * names, icons, raw winrates and sample sizes — everything the Champion/Build
 * view needs, with no second round-trip to the static catalogue.
 *
 * The build data itself comes from the deterministic bundled fixture: no
 * public build dataset exists offline, and the provider is named in the
 * response so the UI can label it as demo data.
 */

export type BuildMatchupRef = { championKey: string; role: Role };

export type BuildEntry = {
    /** Numeric id for items/runes/spells, or the set/skill string. */
    id: number | string;
    name: string | null;
    icon: string | null;
    /** Multi-item sets and spell pairs resolve to their components. */
    components?: { id: number; name: string | null; icon: string | null }[];
    rating: number;
    /** Raw win rate of the choice in the current patch sample. */
    winrate: number;
    /** `ratingToWinrate(rating) - 0.5`: how much the choice is worth. */
    winrateDelta: number;
    wins: number;
    games: number;
    /** Per-enemy ratings, present when `vs` was supplied. */
    matchups: {
        championKey: string;
        name: string | null;
        role: Role;
        rating: number;
        wins: number;
        games: number;
    }[];
};

export type BuildsPayload = {
    champion: { key: string; id: string | null; name: string | null; icon: string | null };
    role: Role;
    config: AnalyzeDraftConfig;
    source: {
        provider: string;
        description: string;
        /** `true` while the numbers come from the offline fixture. */
        offline: boolean;
        games: number;
        wins: number;
    };
    matchups: { championKey: string; name: string | null; role: Role }[];
    items: {
        boots: BuildEntry[];
        startingSets: BuildEntry[];
        sets: BuildEntry[];
        /** One list per build-order slot: first item, second item, … */
        byOrder: BuildEntry[][];
    };
    runes: {
        primary: BuildEntry[];
        secondary: BuildEntry[];
        shards: { offense: BuildEntry[]; flex: BuildEntry[]; defense: BuildEntry[] };
    };
    summonerSpells: BuildEntry[];
    skills: {
        order: BuildEntry[];
        /** One list per champion level. */
        levels: BuildEntry[][];
    };
};

export const BUILD_PROVIDER = "bundled-fixture";

export class BuildsService {
    constructor(private readonly staticData: StaticDataService) {}

    /** The role a champion is most played in, per the dataset. */
    bestRole(dataset: Dataset, championKey: string): Role {
        const champion = dataset.championData[championKey];
        if (!champion) return 0;
        let best: Role = 0;
        let bestGames = -1;
        for (const role of ROLES) {
            const games = champion.statsByRole[role]?.games ?? 0;
            if (games > bestGames) {
                bestGames = games;
                best = role;
            }
        }
        return best;
    }

    analyze(options: {
        championKey: string;
        role: Role;
        matchups: BuildMatchupRef[];
        config: AnalyzeDraftConfig;
        seed?: number;
    }): BuildsPayload {
        const { championKey, role, matchups, config } = options;

        const { dataset, fullDataset } = generateFixtureBuildDataset({
            championKey,
            role,
            staticData: this.staticData.data,
            matchups,
            ...(options.seed === undefined ? {} : { seed: options.seed }),
        });

        const analysis = analyzeBuild(dataset, fullDataset, config);

        return {
            champion: this.staticData.championRef(championKey),
            role,
            config,
            source: {
                provider: BUILD_PROVIDER,
                description:
                    "Deterministic offline build sample generated from the bundled " +
                    "Data Dragon snapshot",
                offline: true,
                games: dataset.games,
                wins: dataset.wins,
            },
            matchups: matchups.map((matchup) => ({
                championKey: matchup.championKey,
                name: this.staticData.championName(matchup.championKey),
                role: matchup.role,
            })),
            items: this.items(analysis, dataset),
            runes: this.runes(analysis, dataset),
            summonerSpells: this.summonerSpells(analysis, dataset),
            skills: this.skills(analysis, dataset),
        };
    }

    // ---------------------------------------------------------- internals ---

    private items(
        analysis: BuildAnalysisResult,
        dataset: PartialBuildDataset,
    ): BuildsPayload["items"] {
        return {
            boots: this.entries(analysis.items.boots, dataset.items.boots, (id) =>
                this.itemLabel(Number(id)),
            ),
            startingSets: this.entries(
                analysis.items.startingSets,
                dataset.items.startingSets,
                (id) => this.itemSetLabel(String(id)),
            ),
            sets: this.entries(analysis.items.sets, dataset.items.sets, (id) =>
                this.itemSetLabel(String(id)),
            ),
            byOrder: analysis.items.statsByOrder.map((slot, index) =>
                this.entries(slot, dataset.items.statsByOrder[index] ?? {}, (id) =>
                    this.itemLabel(Number(id)),
                ),
            ),
        };
    }

    private runes(
        analysis: BuildAnalysisResult,
        dataset: PartialBuildDataset,
    ): BuildsPayload["runes"] {
        const label = (id: string | number): EntityLabel =>
            this.runeLabel(Number(id));
        return {
            primary: this.entries(analysis.runes.primary, dataset.runes.primary, label),
            secondary: this.entries(
                analysis.runes.secondary,
                dataset.runes.secondary,
                label,
            ),
            shards: {
                offense: this.entries(
                    analysis.runes.shards.offense,
                    dataset.runes.shards.offense,
                    label,
                ),
                flex: this.entries(
                    analysis.runes.shards.flex,
                    dataset.runes.shards.flex,
                    label,
                ),
                defense: this.entries(
                    analysis.runes.shards.defense,
                    dataset.runes.shards.defense,
                    label,
                ),
            },
        };
    }

    private summonerSpells(
        analysis: BuildAnalysisResult,
        dataset: PartialBuildDataset,
    ): BuildEntry[] {
        return this.entries(analysis.summonerSpells, dataset.summonerSpells, (id) =>
            this.spellSetLabel(String(id)),
        );
    }

    private skills(
        analysis: BuildAnalysisResult,
        dataset: PartialBuildDataset,
    ): BuildsPayload["skills"] {
        const skillLabel = (id: string | number): EntityLabel => ({
            name: String(id),
            icon: null,
        });

        return {
            order: this.entries(
                analysis.skills.order as Record<SkillOrder, EntityAnalysisResult>,
                dataset.skills.order,
                skillLabel,
            ),
            levels: analysis.skills.levels.map((level, index) =>
                this.entries(
                    level as Record<Skill, EntityAnalysisResult>,
                    dataset.skills.level[index] ?? {},
                    skillLabel,
                ),
            ),
        };
    }

    /** Sorts one bucket of entities by rating (i.e. by winrate delta) desc. */
    private entries(
        analysed: Record<string, EntityAnalysisResult>,
        stats: Record<string, EntityStats>,
        label: (id: string) => EntityLabel,
    ): BuildEntry[] {
        return Object.entries(analysed)
            .map(([id, result]) => {
                const entityStats = stats[id] ?? { wins: 0, games: 0 };
                const resolved = label(id);
                return {
                    id: /^[0-9]+$/.test(id) ? Number(id) : id,
                    name: resolved.name,
                    icon: resolved.icon,
                    ...(resolved.components === undefined
                        ? {}
                        : { components: resolved.components }),
                    rating: result.totalRating,
                    winrate:
                        entityStats.games === 0
                            ? 0.5
                            : entityStats.wins / entityStats.games,
                    winrateDelta: ratingToWinrate(result.totalRating) - 0.5,
                    wins: entityStats.wins,
                    games: entityStats.games,
                    matchups: result.matchupResult.matchupResults.map((matchup) => ({
                        championKey: matchup.championKey,
                        name: this.staticData.championName(matchup.championKey),
                        role: matchup.role,
                        rating: matchup.rating,
                        wins: matchup.wins,
                        games: matchup.games,
                    })),
                } satisfies BuildEntry;
            })
            .sort((a, b) => b.rating - a.rating);
    }

    private itemLabel(id: number): EntityLabel {
        const ref = this.staticData.itemRef(id);
        return { name: ref.name, icon: ref.icon };
    }

    private itemSetLabel(setId: string): EntityLabel {
        const ids = setId
            .split("_")
            .map((part) => Number.parseInt(part, 10))
            .filter((value) => Number.isFinite(value));
        const components = ids.map((id) => {
            const ref = this.staticData.itemRef(id);
            return { id, name: ref.name, icon: ref.icon };
        });
        return {
            name: components.map((item) => item.name ?? item.id).join(" + "),
            icon: components[0]?.icon ?? null,
            components,
        };
    }

    private runeLabel(id: number): EntityLabel {
        const ref = this.staticData.runeRef(id);
        return { name: ref.name, icon: ref.icon };
    }

    private spellSetLabel(setId: string): EntityLabel {
        const ids = setId
            .split("_")
            .map((part) => Number.parseInt(part, 10))
            .filter((value) => Number.isFinite(value));
        const components = ids.map((id) => {
            const ref = this.staticData.summonerSpellRef(id);
            return { id, name: ref.name, icon: ref.icon };
        });
        return {
            name: components.map((spell) => spell.name ?? spell.id).join(" + "),
            icon: components[0]?.icon ?? null,
            components,
        };
    }
}

type EntityLabel = {
    name: string | null;
    icon: string | null;
    components?: { id: number; name: string | null; icon: string | null }[];
};
