import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SerializedDraftState } from "@draftpredict/core";
import type {
    AnalyzePayload,
    ApiError,
    JobProgress,
    PlaystyleResponse,
} from "../../api";
import {
    api,
    queryKeys,
    useDraftAnalysis,
    useJobProgress,
    usePlaystyle,
    useStaticSummary,
} from "../../api";
import { toast } from "../../app/toast";
import { usePreferencesStore } from "../../state";
import { draftIsAnalysable, accountKey, type SavedAccount } from "./helpers";
import { useSavedAccountsStore } from "./store";

/**
 * The stateful half of the account view.
 *
 * Two things are worth reading closely here. First, the *active* account is
 * three primitive slices of the shared preferences store, never an object
 * selector — zustand v5 re-renders forever if a selector allocates. Second,
 * the playstyle refresh is a manual fetch rather than a `refetch()`: only a
 * deliberate user action may send `refresh=1`, because it makes the server
 * re-read fifty matches through Riot's rate limiter.
 */

export type ActiveAccount = {
    puuid: string;
    riotId: string | null;
    platform: string;
};

/** The account currently connected, from the shared preferences store. */
export function useActiveAccount(): ActiveAccount | null {
    const puuid = usePreferencesStore((state) => state.lastPuuid);
    const riotId = usePreferencesStore((state) => state.lastRiotId);
    const platform = usePreferencesStore((state) => state.lastPlatform);

    return useMemo(
        () =>
            puuid
                ? { puuid, riotId: riotId ?? null, platform: platform ?? "euw1" }
                : null,
        [puuid, riotId, platform],
    );
}

export type AccountActions = {
    /** Connects an account and remembers it in the switcher. */
    connect: (account: Omit<SavedAccount, "lastUsedAt">) => void;
    /** Disconnects without forgetting: the account stays in the switcher. */
    disconnect: () => void;
    /** Removes an account from the switcher, disconnecting it if it was active. */
    forget: (account: Pick<SavedAccount, "puuid" | "platform">) => void;
};

export function useAccountActions(): AccountActions {
    const rememberAccount = usePreferencesStore((state) => state.rememberAccount);
    const forgetAccount = usePreferencesStore((state) => state.forgetAccount);
    const activePuuid = usePreferencesStore((state) => state.lastPuuid);
    const remember = useSavedAccountsStore((state) => state.remember);
    const forgetSaved = useSavedAccountsStore((state) => state.forget);

    const connect = useCallback(
        (account: Omit<SavedAccount, "lastUsedAt">) => {
            rememberAccount({
                puuid: account.puuid,
                riotId: account.riotId,
                platform: account.platform,
            });
            remember(account);
        },
        [rememberAccount, remember],
    );

    const disconnect = useCallback(() => {
        forgetAccount();
    }, [forgetAccount]);

    const forget = useCallback(
        (account: Pick<SavedAccount, "puuid" | "platform">) => {
            forgetSaved(accountKey(account));
            if (activePuuid === account.puuid) forgetAccount();
        },
        [forgetSaved, forgetAccount, activePuuid],
    );

    return useMemo(
        () => ({ connect, disconnect, forget }),
        [connect, disconnect, forget],
    );
}

/** The saved-account list, sorted most recently used first. */
export function useSavedAccounts(): SavedAccount[] {
    const accounts = useSavedAccountsStore((state) => state.accounts);
    return useMemo(
        () => [...accounts].sort((a, b) => b.lastUsedAt - a.lastUsedAt),
        [accounts],
    );
}

export type PlaystyleView = {
    data: PlaystyleResponse | null;
    error: ApiError | null;
    isLoading: boolean;
    isFetching: boolean;
    /** A user-requested recomputation is in flight (`refresh=1`). */
    isRefreshing: boolean;
    /** Live `job:progress` frames for this puuid, or `null` between jobs. */
    progress: JobProgress | null;
    refresh: () => void;
    retry: () => void;
};

/**
 * The playstyle profile, its cache and its progress bar.
 *
 * The server caches a profile for fifteen minutes and streams `job:progress`
 * while it builds one, so the honest UI is: read the cache on mount, show the
 * real stage and match counter while a job runs, and only pay the full price
 * again when the user asks for it.
 */
export function usePlaystyleProfile(
    puuid: string | null,
    count: number,
    platform?: string,
): PlaystyleView {
    const client = useQueryClient();
    const [isRefreshing, setRefreshing] = useState(false);
    const query = usePlaystyle(puuid, { count, ...(platform ? { platform } : {}) });
    const progress = useJobProgress("playstyle", puuid ?? undefined);

    const refresh = useCallback(() => {
        if (!puuid || isRefreshing) return;
        setRefreshing(true);
        api.account
            .playstyle(puuid, {
                count,
                refresh: true,
                ...(platform ? { platform } : {}),
            })
            .then((payload) => {
                client.setQueryData(
                    queryKeys.account.playstyle(puuid, count, platform),
                    payload,
                );
                toast.success(
                    "Profil recalculé",
                    `${payload.sampleSize} parties analysées.`,
                );
            })
            .catch((error: unknown) => {
                toast.fromError(error, "Impossible de recalculer le profil");
            })
            .finally(() => setRefreshing(false));
    }, [puuid, count, platform, client, isRefreshing]);

    const { data, error, isLoading, isFetching, refetch } = query;
    const retry = useCallback(() => void refetch(), [refetch]);

    return useMemo(
        () => ({
            data: data ?? null,
            error: error ?? null,
            isLoading,
            isFetching: isFetching || isRefreshing,
            isRefreshing,
            progress,
            refresh,
            retry,
        }),
        [data, error, isLoading, isFetching, isRefreshing, progress, refresh, retry],
    );
}

export type MatchPrediction = {
    analysis: AnalyzePayload | null;
    error: ApiError | null;
    isLoading: boolean;
};

/**
 * What the draft engine would have predicted before a finished game started.
 *
 * `MatchSummary.draft` is already a `SerializedDraftState`, ally first, so it
 * goes straight into `POST /api/draft/analyze`. The query is keyed on the
 * draft itself and only runs when the row is expanded, so scrolling the
 * history costs nothing.
 */
export function useMatchPrediction(
    draft: SerializedDraftState | null | undefined,
    enabled = true,
): MatchPrediction {
    const request = useMemo(
        () =>
            enabled && draft && draftIsAnalysable(draft)
                ? { team: draft.ally, enemy: draft.opponent, bans: draft.bans }
                : null,
        [draft, enabled],
    );

    // No `keepPreviousData` here: showing the previous game's win probability
    // next to this game's result would be a lie.
    const query = useDraftAnalysis(request, { placeholderData: undefined });

    return useMemo(
        () => ({
            analysis: query.data ?? null,
            error: query.error ?? null,
            isLoading: request !== null && query.isPending,
        }),
        [query.data, query.error, query.isPending, request],
    );
}

/** The Data Dragon patch the bundled static data was built from. */
export function useStaticVersion(): string | null {
    return useStaticSummary().data?.version ?? null;
}
