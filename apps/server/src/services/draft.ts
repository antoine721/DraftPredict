import type {
    AnalyzeChampionResult,
    AnalyzeDraftConfig,
    AnalyzeDuoResult,
    AnalyzeMatchupResult,
    BanSuggestion,
    ChampionDamageProfile,
    Dataset,
    DraftResult,
    Role,
    SerializedDraftState,
    Suggestion,
    WinrateByTime,
} from "@draftpredict/core";
import {
    analyzeDraft,
    getBanSuggestions,
    getDraftResultWinrateByTime,
    getSuggestions,
    getTeamDamageDistribution,
    ratingToWinrate,
    serializeDraftState,
} from "@draftpredict/core";
import type { DatasetPairMeta, ResolvedPair } from "./dataset.js";
import type { StaticDataService } from "./static-data.js";
import { openRoles } from "./draft-schema.js";

/**
 * Turns engine output into the payloads `apps/web` renders.
 *
 * Two things happen here and nowhere else: champion keys are resolved to names
 * and icons (so the UI never has to cross-reference the static catalogue), and
 * ratings are expressed as win-probability deltas, which is the only form a
 * player can read.
 */

export type ChampionRef = {
    key: string;
    id: string | null;
    name: string | null;
    icon: string | null;
};

export type ContributionEntry = {
    /** Champions involved: one for a solo rating, two for duos and matchups. */
    champions: (ChampionRef & { role: Role })[];
    rating: number;
    /** `ratingToWinrate(rating) - 0.5`: the contribution as win probability. */
    winrateDelta: number;
    wins: number;
    games: number;
};

export type DraftBreakdown = {
    allyChampions: { entries: ContributionEntry[]; totalRating: number };
    enemyChampions: { entries: ContributionEntry[]; totalRating: number };
    allyDuos: { entries: ContributionEntry[]; totalRating: number };
    enemyDuos: { entries: ContributionEntry[]; totalRating: number };
    matchups: { entries: ContributionEntry[]; totalRating: number };
};

export type AnalyzePayload = {
    dataset: DatasetPairMeta;
    config: AnalyzeDraftConfig;
    state: SerializedDraftState;
    result: DraftResult;
    breakdown: DraftBreakdown;
    winrateByTime: WinrateByTime[];
    damageDistribution: {
        ally: ChampionDamageProfile & { total: number };
        opponent: ChampionDamageProfile & { total: number };
    };
};

export type SuggestionEntry = ChampionRef & {
    role: Role;
    rating: number;
    winrate: number;
    /** Win probability gained over the current draft. */
    winrateDelta: number;
    /** Games the champion has in this role, in the 30-day sample. */
    games: number;
};

export type SuggestionsPayload = {
    dataset: DatasetPairMeta;
    config: AnalyzeDraftConfig;
    state: SerializedDraftState;
    /** Win probability of the draft as it stands, the delta baseline. */
    baseline: { totalRating: number; winrate: number };
    roles: { role: Role; open: boolean; suggestions: SuggestionEntry[] }[];
    /** Best suggestions across every open role, best first. */
    best: SuggestionEntry[];
};

export type BanEntry = ChampionRef & {
    role: Role;
    rating: number;
    /** Ally win probability if the enemy got this champion. */
    winrate: number;
    /** How much ally win probability this pick would cost (positive = bad). */
    winrateLoss: number;
    games: number;
};

export type BansPayload = {
    dataset: DatasetPairMeta;
    config: AnalyzeDraftConfig;
    state: SerializedDraftState;
    baseline: { totalRating: number; winrate: number };
    bans: BanEntry[];
};

export type DraftInput = {
    team: Map<Role, string>;
    enemy: Map<Role, string>;
    bans: { ally: string[]; opponent: string[] };
};

export class DraftAnalysisService {
    constructor(private readonly staticData: StaticDataService) {}

    ref(key: string): ChampionRef {
        return this.staticData.championRef(key);
    }

    analyze(
        pair: ResolvedPair,
        input: DraftInput,
        config: AnalyzeDraftConfig,
    ): AnalyzePayload {
        const { dataset, fullDataset, meta } = pair;
        const result = analyzeDraft(dataset, fullDataset, input.team, input.enemy, config);
        const winrateByTime = getDraftResultWinrateByTime(
            fullDataset,
            result,
            input.team,
            input.enemy,
            config,
        );

        return {
            dataset: meta,
            config,
            state: serializeDraftState({
                ally: input.team,
                opponent: input.enemy,
                bans: input.bans,
            }),
            result,
            breakdown: this.breakdown(result),
            winrateByTime,
            damageDistribution: {
                ally: withTotal(getTeamDamageDistribution(fullDataset, input.team)),
                opponent: withTotal(
                    getTeamDamageDistribution(fullDataset, input.enemy),
                ),
            },
        };
    }

    suggestions(
        pair: ResolvedPair,
        input: DraftInput,
        config: AnalyzeDraftConfig,
        options: { limit?: number; roles?: Role[] } = {},
    ): SuggestionsPayload {
        const { dataset, fullDataset, meta } = pair;
        const limit = options.limit ?? 10;

        const baselineResult = analyzeDraft(
            dataset,
            fullDataset,
            input.team,
            input.enemy,
            config,
        );

        const all = getSuggestions(dataset, fullDataset, input.team, input.enemy, config);

        const open = openRoles(input.team);
        const wanted =
            options.roles && options.roles.length > 0
                ? options.roles.filter((role) => open.includes(role))
                : open;

        const byRole = new Map<Role, SuggestionEntry[]>();
        for (const role of wanted) byRole.set(role, []);

        for (const suggestion of all) {
            const bucket = byRole.get(suggestion.role);
            if (!bucket || bucket.length >= limit) continue;
            bucket.push(this.suggestionEntry(suggestion, baselineResult, fullDataset));
        }

        const roles = wanted.map((role) => ({
            role,
            open: true,
            suggestions: byRole.get(role) ?? [],
        }));

        const best = [...roles.flatMap((entry) => entry.suggestions)]
            .sort((a, b) => b.winrate - a.winrate)
            .slice(0, limit);

        return {
            dataset: meta,
            config,
            state: serializeDraftState({
                ally: input.team,
                opponent: input.enemy,
                bans: input.bans,
            }),
            baseline: {
                totalRating: baselineResult.totalRating,
                winrate: baselineResult.winrate,
            },
            roles,
            best,
        };
    }

    bans(
        pair: ResolvedPair,
        input: DraftInput,
        config: AnalyzeDraftConfig,
        options: { limit?: number } = {},
    ): BansPayload {
        const { dataset, fullDataset, meta } = pair;
        const limit = options.limit ?? 20;

        const baselineResult = analyzeDraft(
            dataset,
            fullDataset,
            input.team,
            input.enemy,
            config,
        );

        const banned = [...input.bans.ally, ...input.bans.opponent];
        const suggestions = getBanSuggestions(
            dataset,
            fullDataset,
            input.team,
            input.enemy,
            config,
            banned,
        );

        return {
            dataset: meta,
            config,
            state: serializeDraftState({
                ally: input.team,
                opponent: input.enemy,
                bans: input.bans,
            }),
            baseline: {
                totalRating: baselineResult.totalRating,
                winrate: baselineResult.winrate,
            },
            bans: suggestions
                .slice(0, limit)
                .map((suggestion) => this.banEntry(suggestion, baselineResult, fullDataset)),
        };
    }

    // ---------------------------------------------------------- internals ---

    private suggestionEntry(
        suggestion: Suggestion,
        baseline: DraftResult,
        fullDataset: Dataset,
    ): SuggestionEntry {
        return {
            ...this.ref(suggestion.championKey),
            role: suggestion.role,
            rating: suggestion.rating,
            winrate: suggestion.winrate,
            winrateDelta: suggestion.winrate - baseline.winrate,
            games: gamesOf(fullDataset, suggestion.championKey, suggestion.role),
        };
    }

    private banEntry(
        suggestion: BanSuggestion,
        baseline: DraftResult,
        fullDataset: Dataset,
    ): BanEntry {
        return {
            ...this.ref(suggestion.championKey),
            role: suggestion.role,
            rating: suggestion.rating,
            winrate: suggestion.winrate,
            winrateLoss: baseline.winrate - suggestion.winrate,
            games: gamesOf(fullDataset, suggestion.championKey, suggestion.role),
        };
    }

    private breakdown(result: DraftResult): DraftBreakdown {
        return {
            allyChampions: {
                totalRating: result.allyChampionRating.totalRating,
                entries: result.allyChampionRating.championResults.map((entry) =>
                    this.championEntry(entry),
                ),
            },
            enemyChampions: {
                totalRating: result.enemyChampionRating.totalRating,
                entries: result.enemyChampionRating.championResults.map((entry) =>
                    this.championEntry(entry),
                ),
            },
            allyDuos: {
                totalRating: result.allyDuoRating.totalRating,
                entries: result.allyDuoRating.duoResults.map((entry) =>
                    this.pairEntry(entry),
                ),
            },
            enemyDuos: {
                totalRating: result.enemyDuoRating.totalRating,
                entries: result.enemyDuoRating.duoResults.map((entry) =>
                    this.pairEntry(entry),
                ),
            },
            matchups: {
                totalRating: result.matchupRating.totalRating,
                entries: result.matchupRating.matchupResults.map((entry) =>
                    this.pairEntry(entry),
                ),
            },
        };
    }

    private championEntry(entry: AnalyzeChampionResult): ContributionEntry {
        return {
            champions: [{ ...this.ref(entry.championKey), role: entry.role }],
            rating: entry.rating,
            winrateDelta: ratingToWinrate(entry.rating) - 0.5,
            wins: entry.wins,
            games: entry.games,
        };
    }

    private pairEntry(
        entry: AnalyzeDuoResult | AnalyzeMatchupResult,
    ): ContributionEntry {
        return {
            champions: [
                { ...this.ref(entry.championKeyA), role: entry.roleA },
                { ...this.ref(entry.championKeyB), role: entry.roleB },
            ],
            rating: entry.rating,
            winrateDelta: ratingToWinrate(entry.rating) - 0.5,
            wins: entry.wins,
            games: entry.games,
        };
    }
}

function withTotal(
    profile: ChampionDamageProfile,
): ChampionDamageProfile & { total: number } {
    return { ...profile, total: profile.magic + profile.physical + profile.true };
}

function gamesOf(dataset: Dataset, championKey: string, role: Role): number {
    return dataset.championData[championKey]?.statsByRole[role]?.games ?? 0;
}
