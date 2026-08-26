import { useEffect, useMemo, useRef, useState } from "react";
import type { Role } from "@draftpredict/core";
import {
    useBanSuggestions,
    useDraftAnalysis,
    useLiveChampSelect,
    useSuggestions,
    type ApiError,
} from "../../api";
import type {
    AnalyzePayload,
    BansPayload,
    DraftRequest,
    SuggestionsPayload,
} from "../../api/types";
import { boardIsEmpty, selectAnalyzeRequest, useDraftStore } from "../../state";
import type { PickerTarget, RankInfo, Ranking } from "./types";

/**
 * The draft view's data layer.
 *
 * Two decisions live here rather than in the components:
 *
 * - **Requests are memoised on the fields they read.** `selectAnalyzeRequest`
 *   builds a fresh object every call, and a zustand selector that returns a
 *   new object on every render loops forever. The request is therefore built
 *   inside `useMemo`, keyed on the primitive slices it depends on.
 * - **The League Client's own analysis is preferred when it is comparable.**
 *   The server already analysed the champ-select frame it pushed; re-asking
 *   for the same board is a wasted round trip. But the pushed analysis uses
 *   the *server's* rank/region/risk, so it is only used while the user has not
 *   overridden any of them locally.
 */

/** The body of `POST /api/draft/analyze` for the current board. */
export function useAnalyzeRequest(): DraftRequest {
    const board = useDraftStore((state) => state.board);
    const riskLevel = useDraftStore((state) => state.riskLevel);
    const rank = useDraftStore((state) => state.rank);
    const region = useDraftStore((state) => state.region);
    const minGames = useDraftStore((state) => state.minGames);
    const ignoreChampionWinrates = useDraftStore(
        (state) => state.ignoreChampionWinrates,
    );
    // The dependencies are exactly the fields the selector reads, so reading
    // the store inside the memo cannot go stale.
    return useMemo(
        () => selectAnalyzeRequest(useDraftStore.getState()),
        [board, riskLevel, rank, region, minGames, ignoreChampionWinrates],
    );
}

/** `true` when the analysis config is entirely the server's own. */
export function useUsesServerConfig(): boolean {
    const riskLevel = useDraftStore((state) => state.riskLevel);
    const rank = useDraftStore((state) => state.rank);
    const region = useDraftStore((state) => state.region);
    const minGames = useDraftStore((state) => state.minGames);
    const ignoreChampionWinrates = useDraftStore(
        (state) => state.ignoreChampionWinrates,
    );
    return (
        riskLevel === null &&
        rank === null &&
        region === null &&
        minGames === null &&
        ignoreChampionWinrates === null
    );
}

export type AnalysisSource = {
    analysis: AnalyzePayload | null;
    /** The analysis came straight from the League Client push. */
    fromLive: boolean;
    isLoading: boolean;
    isFetching: boolean;
    error: ApiError | null;
    refetch: () => void;
};

/** The win probability of the current board, from the socket or the API. */
export function useAnalysisSource(request: DraftRequest): AnalysisSource {
    const followClient = useDraftStore((state) => state.followClient);
    const serverConfig = useUsesServerConfig();
    const live = useLiveChampSelect();

    const liveAnalysis =
        followClient && serverConfig && live.active ? live.analysis : null;

    const query = useDraftAnalysis(liveAnalysis ? null : request);

    return {
        analysis: liveAnalysis ?? query.data ?? null,
        fromLive: liveAnalysis !== null,
        isLoading: liveAnalysis ? false : query.isLoading,
        isFetching: liveAnalysis ? false : query.isFetching,
        error: liveAnalysis ? null : (query.error ?? null),
        refetch: () => {
            void query.refetch();
        },
    };
}

/** Pick suggestions for every open ally role. */
export function useDraftSuggestions(
    request: DraftRequest,
    limit: number,
    enabled: boolean,
): {
    payload: SuggestionsPayload | null;
    isLoading: boolean;
    error: ApiError | null;
} {
    const suggestionsRequest = useMemo(() => ({ ...request, limit }), [request, limit]);
    const query = useSuggestions(enabled ? suggestionsRequest : null);
    return {
        payload: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error ?? null,
    };
}

/** Ban suggestions, most threatening first. */
export function useDraftBanSuggestions(
    request: DraftRequest,
    limit: number,
    enabled: boolean,
): { payload: BansPayload | null; isLoading: boolean; error: ApiError | null } {
    const bansRequest = useMemo(() => ({ ...request, limit }), [request, limit]);
    const query = useBanSuggestions(enabled ? bansRequest : null);
    return {
        payload: query.data ?? null,
        isLoading: query.isLoading,
        error: query.error ?? null,
    };
}

const META_LIMIT = 100;

/**
 * The context-free ranking of every champion in every role: a sweep of an
 * empty board with the user's rank/region/risk. It is what the meta tier list
 * shows, what orders the picker for an enemy slot, and where the picker gets
 * its "who plays this role" filter.
 */
export function useMetaRanking(request: DraftRequest, enabled: boolean) {
    const metaRequest = useMemo(() => {
        const next: DraftRequest & { limit: number } = {
            team: [],
            enemy: [],
            limit: META_LIMIT,
        };
        if (request.config) next.config = request.config;
        if (request.rank) next.rank = request.rank;
        if (request.region) next.region = request.region;
        return next;
    }, [request.config, request.rank, request.region]);

    const query = useSuggestions(enabled ? metaRequest : null);
    return { payload: query.data ?? null, isLoading: query.isLoading };
}

function rankingOf(payload: SuggestionsPayload | null, role: Role | null): Ranking {
    const byKey = new Map<string, RankInfo>();
    if (!payload) return { byKey, contextual: false, isLoading: false };
    for (const bucket of payload.roles) {
        if (role !== null && bucket.role !== role) continue;
        for (const entry of bucket.suggestions) {
            byKey.set(entry.key, {
                winrate: entry.winrate,
                games: entry.games,
                delta: entry.winrateDelta,
                rating: entry.rating,
            });
        }
    }
    return { byKey, contextual: false, isLoading: false };
}

/** Champions with a usable sample in each role, from the meta sweep. */
export function rolePools(payload: SuggestionsPayload | null): Map<Role, Set<string>> {
    const pools = new Map<Role, Set<string>>();
    for (const bucket of payload?.roles ?? []) {
        pools.set(
            bucket.role,
            new Set(bucket.suggestions.map((suggestion) => suggestion.key)),
        );
    }
    return pools;
}

/**
 * The numbers the picker shows for the slot it is filling.
 *
 * When the slot is an open **ally** role, the server can rank champions
 * against the champions already on the board — that is the ranking worth
 * showing. For an enemy slot, a filled slot or a ban, no such ranking exists,
 * so the context-free meta sweep is used and the UI says so.
 */
export function usePickerRanking(
    request: DraftRequest,
    target: PickerTarget | null,
    metaPayload: SuggestionsPayload | null,
    metaLoading: boolean,
): Ranking {
    const board = useDraftStore((state) => state.board);
    const contextual =
        target !== null &&
        target.mode === "pick" &&
        target.team === "ally" &&
        !board.ally[target.role];

    const contextualRequest = useMemo(() => {
        if (!target || !contextual) return null;
        return { ...request, limit: META_LIMIT, roles: [target.role] };
    }, [request, contextual, target?.role, target?.team, target?.mode]);

    const query = useSuggestions(contextualRequest);

    return useMemo(() => {
        if (contextual) {
            const ranking = rankingOf(query.data ?? null, target?.role ?? null);
            if (ranking.byKey.size > 0) {
                return { ...ranking, contextual: true, isLoading: false };
            }
            return {
                byKey: rankingOf(metaPayload, target?.role ?? null).byKey,
                contextual: false,
                isLoading: query.isLoading || metaLoading,
            };
        }
        return {
            byKey: rankingOf(metaPayload, target?.role ?? null).byKey,
            contextual: false,
            isLoading: metaLoading,
        };
    }, [
        contextual,
        query.data,
        query.isLoading,
        metaPayload,
        metaLoading,
        target?.role,
    ]);
}

/** `true` while the board holds nothing at all. */
export function useBoardIsEmpty(): boolean {
    const board = useDraftStore((state) => state.board);
    return boardIsEmpty(board);
}

/**
 * A champ-select timer that keeps counting between two pushes: the League
 * Client sends the remaining milliseconds a few times a second at best, and a
 * frozen countdown looks broken.
 */
export function useCountdown(timerMs: number | null, updatedAt: number | null): number {
    const [now, setNow] = useState(() => Date.now());
    const base = useRef({ timerMs, updatedAt });
    base.current = { timerMs, updatedAt };

    useEffect(() => {
        if (timerMs === null || timerMs <= 0) return;
        const id = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(id);
    }, [timerMs, updatedAt]);

    if (timerMs === null) return 0;
    if (updatedAt === null) return timerMs;
    return Math.max(0, timerMs - (now - updatedAt));
}
