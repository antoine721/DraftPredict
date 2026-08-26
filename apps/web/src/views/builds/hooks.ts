import { useMemo } from "react";
import type { Dataset, RiskLevel, Role } from "@draftpredict/core";
import type { ApiError, DatasetMeta, ItemDetail } from "../../api";
import { useConfig, useDataset, useStaticItems } from "../../api";
import {
    buildChampionRoleIndex,
    estimateTiers,
    priorGamesFor,
    type ChampionRoleIndex,
    type ChampionRoleRow,
    type TierEstimate,
} from "./stats";

/**
 * Data plumbing for the champion screen.
 *
 * The server has no per-champion statistics route, so the numbers come from
 * the dataset itself, analysed in the browser. That is cheap for the
 * current-patch window (a few hundred kilobytes: winrates only) and expensive
 * for the 30-day window (tens of megabytes: the whole matchup matrix), which
 * is why the two are separate hooks and the second one only runs when the
 * matchup tab asks for it.
 */

/** The prior the server is configured to use — the analysis must agree with it. */
export function useAnalysisPrior(): { priorGames: number; riskLevel: RiskLevel } {
    const config = useConfig();
    const riskLevel = (config.data?.config.riskLevel ?? "medium") as RiskLevel;
    return { priorGames: priorGamesFor(riskLevel), riskLevel };
}

export type ChampionStats = {
    index: ChampionRoleIndex | null;
    tiers: Map<string, TierEstimate>;
    meta: DatasetMeta | null;
    isLoading: boolean;
    error: ApiError | null;
    refetch: () => void;
    rowsFor: (championKey: string) => ChampionRoleRow[];
};

/** Current-patch winrates, pickrates and damage profiles for every champion. */
export function useChampionStats(priorGames: number): ChampionStats {
    const query = useDataset({ include: "full" });
    const dataset = query.data?.dataset ?? null;

    const index = useMemo(
        () => (dataset ? buildChampionRoleIndex(dataset, priorGames) : null),
        [dataset, priorGames],
    );
    const tiers = useMemo(
        () => (index ? estimateTiers(index) : new Map<string, TierEstimate>()),
        [index],
    );

    const meta = query.data?.meta ?? null;
    const { isLoading, error, refetch } = query;

    // A stable object: every filter and lookup downstream is memoised on it.
    return useMemo(
        () => ({
            index,
            tiers,
            meta,
            isLoading,
            error: error ?? null,
            refetch: () => void refetch(),
            rowsFor: (championKey: string) => index?.byChampion.get(championKey) ?? [],
        }),
        [index, tiers, meta, isLoading, error, refetch],
    );
}

export type MatchupDataset = {
    dataset: Dataset | null;
    meta: DatasetMeta | null;
    isLoading: boolean;
    isFetching: boolean;
    error: ApiError | null;
    refetch: () => void;
};

/**
 * The 30-day window, matchup and synergy matrices included.
 *
 * Only this window carries them — the per-patch dataset ships with the maps
 * stripped — and it is heavy, so it is fetched once, kept forever, and only
 * when `enabled`.
 */
export function useMatchupDataset(enabled: boolean): MatchupDataset {
    const query = useDataset(
        { include: "full", window: "full" },
        {
            enabled,
            staleTime: Number.POSITIVE_INFINITY,
            gcTime: Number.POSITIVE_INFINITY,
        },
    );
    return {
        dataset: query.data?.dataset ?? null,
        meta: query.data?.meta ?? null,
        isLoading: enabled && query.isLoading,
        isFetching: query.isFetching,
        error: query.error ?? null,
        refetch: () => void query.refetch(),
    };
}

/** The item catalogue as a lookup table, for gold costs and tooltips. */
export function useItemCatalogue(): Map<number, ItemDetail> {
    const query = useStaticItems();
    return useMemo(() => {
        const map = new Map<number, ItemDetail>();
        for (const item of query.data?.items ?? []) map.set(item.id, item);
        return map;
    }, [query.data]);
}

/** The role to show first: the one the champion is actually played in. */
export function mainRole(rows: readonly ChampionRoleRow[]): Role | null {
    return rows.length > 0 ? rows[0].role : null;
}
