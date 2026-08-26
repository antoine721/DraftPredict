import { useMemo } from "react";
import {
    QueryClient,
    useMutation,
    useQuery,
    useQueryClient,
    type UseMutationResult,
    type UseQueryOptions,
} from "@tanstack/react-query";
import { api } from "./client";
import { ApiError, isApiError } from "./errors";
import { queryKeys } from "./keys";
import type {
    AccountLookupResponse,
    AccountMeResponse,
    AnalyzePayload,
    BansPayload,
    BansRequest,
    BuildsPayload,
    BuildsQuery,
    ChampionSummary,
    ConfigResponse,
    ConfigUpdate,
    ConfigUpdateResponse,
    DatasetQuery,
    DatasetResponse,
    DraftRequest,
    HealthResponse,
    LcuChampSelectResponse,
    LcuStatus,
    LiveGameResponse,
    MatchesResponse,
    PlaystyleResponse,
    ProfileResponse,
    StaticChampionsResponse,
    StaticItemsResponse,
    StaticRunesResponse,
    StaticSearchResponse,
    StaticSummary,
    StaticSummonerSpellsResponse,
    SuggestionsPayload,
    SuggestionsRequest,
} from "./types";

/**
 * TanStack Query hooks — the only way a view touches the network.
 *
 * Two rules run through all of them:
 *
 * - **A 4xx is an answer, not a hiccup.** `RIOT_KEY_MISSING` (428),
 *   `UNKNOWN_CHAMPION` and friends are never retried; the view renders the
 *   corresponding state. Only transport faults, 429 and 5xx are retried.
 * - **Static data is immutable for the life of the patch**, so the catalogue is
 *   fetched once and kept forever, while live things (health, LCU, dataset)
 *   refresh on a short stale time and are also pushed over the WebSocket.
 */

const MINUTE = 60_000;

/** Anything below 500 that is not a rate limit is a final answer. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
    if (failureCount >= 2) return false;
    if (!isApiError(error)) return failureCount < 1;
    return error.isRetryable;
}

/** The shared client. `apps/web` creates exactly one, in `main.tsx`. */
export function createQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: shouldRetry,
                retryDelay: (attempt) => Math.min(4000, 400 * 2 ** attempt),
                staleTime: 30_000,
                gcTime: 10 * MINUTE,
                refetchOnWindowFocus: false,
                throwOnError: false,
            },
            mutations: { retry: false },
        },
    });
}

type QueryTweaks<T> = Omit<
    UseQueryOptions<T, ApiError, T, readonly unknown[]>,
    "queryKey" | "queryFn"
>;

// ------------------------------------------------------------------ health ---

export function useHealth(options?: QueryTweaks<HealthResponse>) {
    return useQuery<HealthResponse, ApiError, HealthResponse, readonly unknown[]>({
        queryKey: queryKeys.health,
        queryFn: ({ signal }) => api.health({ signal }),
        staleTime: 15_000,
        refetchInterval: 60_000,
        ...options,
    });
}

// ------------------------------------------------------------------ config ---

export function useConfig(options?: QueryTweaks<ConfigResponse>) {
    return useQuery<ConfigResponse, ApiError, ConfigResponse, readonly unknown[]>({
        queryKey: queryKeys.config,
        queryFn: ({ signal }) => api.config.get({ signal }),
        staleTime: 30_000,
        ...options,
    });
}

/**
 * Saves settings. On success the whole cache that depends on server settings
 * (dataset, drafts, builds, account) is invalidated, because the rank, region
 * and risk level are analysis inputs.
 */
export function useUpdateConfig(): UseMutationResult<
    ConfigUpdateResponse,
    ApiError,
    ConfigUpdate
> {
    const client = useQueryClient();
    return useMutation<ConfigUpdateResponse, ApiError, ConfigUpdate>({
        mutationFn: (patch) => api.config.update(patch),
        onSuccess: (response) => {
            client.setQueryData<ConfigResponse>(queryKeys.config, (previous) =>
                previous ? { ...previous, config: response.config } : previous,
            );
            void client.invalidateQueries({ queryKey: queryKeys.config });
            void client.invalidateQueries({ queryKey: queryKeys.health });
            void client.invalidateQueries({ queryKey: queryKeys.dataset.all });
            void client.invalidateQueries({ queryKey: queryKeys.draft.all });
            void client.invalidateQueries({ queryKey: queryKeys.builds.all });
            void client.invalidateQueries({ queryKey: queryKeys.account.all });
        },
    });
}

/** Whether an API key is configured — the gate of every account feature. */
export function useRiotKeyState(): {
    hasRiotApiKey: boolean;
    preview: string | null;
    source: "default" | "env" | "file" | null;
    platform: string;
    isLoading: boolean;
} {
    const config = useConfig();
    return {
        hasRiotApiKey: config.data?.config.hasRiotApiKey ?? false,
        preview: config.data?.config.riotApiKeyPreview ?? null,
        source: config.data?.config.riotApiKeySource ?? null,
        platform: config.data?.config.platform ?? "euw1",
        isLoading: config.isLoading,
    };
}

// ------------------------------------------------------------------ static ---

const IMMUTABLE = {
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
} as const;

/** The champion catalogue every picker renders. Fetched once per session. */
export function useStaticSummary(options?: QueryTweaks<StaticSummary>) {
    return useQuery<StaticSummary, ApiError, StaticSummary, readonly unknown[]>({
        queryKey: queryKeys.static.summary,
        queryFn: ({ signal }) => api.static.summary({ signal }),
        ...IMMUTABLE,
        ...options,
    });
}

export function useStaticChampions(options?: QueryTweaks<StaticChampionsResponse>) {
    return useQuery<
        StaticChampionsResponse,
        ApiError,
        StaticChampionsResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.static.champions,
        queryFn: ({ signal }) => api.static.champions({ signal }),
        ...IMMUTABLE,
        ...options,
    });
}

export function useStaticItems(options?: QueryTweaks<StaticItemsResponse>) {
    return useQuery<
        StaticItemsResponse,
        ApiError,
        StaticItemsResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.static.items,
        queryFn: ({ signal }) => api.static.items({ signal }),
        ...IMMUTABLE,
        ...options,
    });
}

export function useStaticRunes(options?: QueryTweaks<StaticRunesResponse>) {
    return useQuery<
        StaticRunesResponse,
        ApiError,
        StaticRunesResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.static.runes,
        queryFn: ({ signal }) => api.static.runes({ signal }),
        ...IMMUTABLE,
        ...options,
    });
}

export function useStaticSummonerSpells(
    options?: QueryTweaks<StaticSummonerSpellsResponse>,
) {
    return useQuery<
        StaticSummonerSpellsResponse,
        ApiError,
        StaticSummonerSpellsResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.static.summonerSpells,
        queryFn: ({ signal }) => api.static.summonerSpells({ signal }),
        ...IMMUTABLE,
        ...options,
    });
}

/** Server-side fuzzy search. Prefer {@link useChampionIndex} for local filtering. */
export function useChampionSearch(
    query: string,
    limit = 10,
    options?: QueryTweaks<StaticSearchResponse>,
) {
    return useQuery<
        StaticSearchResponse,
        ApiError,
        StaticSearchResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.static.search(query, limit),
        queryFn: ({ signal }) => api.static.search(query, limit, { signal }),
        enabled: query.trim().length > 0,
        staleTime: 5 * MINUTE,
        ...options,
    });
}

export type ChampionIndex = {
    champions: ChampionSummary[];
    /** Keyed by the dataset key (`"266"`). */
    byKey: Map<string, ChampionSummary>;
    /** Keyed by the Data Dragon id (`"Aatrox"`). */
    byId: Map<string, ChampionSummary>;
    version: string | null;
    source: "bundled" | "cache" | null;
    isLoading: boolean;
    error: ApiError | null;
};

/**
 * The champion catalogue as lookup tables. Every view that has to turn a
 * champion key into a name and an icon uses this instead of re-deriving it.
 */
export function useChampionIndex(): ChampionIndex {
    const query = useStaticSummary();
    return useMemo(() => {
        const champions = query.data?.champions ?? [];
        const byKey = new Map<string, ChampionSummary>();
        const byId = new Map<string, ChampionSummary>();
        for (const champion of champions) {
            byKey.set(champion.key, champion);
            byId.set(champion.id, champion);
        }
        return {
            champions,
            byKey,
            byId,
            version: query.data?.version ?? null,
            source: query.data?.source ?? null,
            isLoading: query.isLoading,
            error: query.error ?? null,
        };
    }, [query.data, query.isLoading, query.error]);
}

// ----------------------------------------------------------------- dataset ---

/**
 * Dataset metadata. `include: "full"` downloads the entire dataset (tens of
 * megabytes) — only ask for it to analyse client-side.
 */
export function useDataset(
    query: DatasetQuery = {},
    options?: QueryTweaks<DatasetResponse>,
) {
    return useQuery<DatasetResponse, ApiError, DatasetResponse, readonly unknown[]>({
        queryKey: queryKeys.dataset.query(query),
        queryFn: ({ signal }) => api.dataset.get(query, { signal }),
        staleTime: 5 * MINUTE,
        ...options,
    });
}

export function useDatasetProviders() {
    return useQuery({
        queryKey: queryKeys.dataset.providers,
        queryFn: ({ signal }) => api.dataset.providers({ signal }),
        staleTime: 5 * MINUTE,
    });
}

/** Forces a provider round-trip; the server broadcasts `dataset:update`. */
export function useRefreshDataset() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: (body: Pick<DatasetQuery, "rank" | "region" | "patch"> = {}) =>
            api.dataset.refresh(body),
        onSuccess: () => {
            void client.invalidateQueries({ queryKey: queryKeys.dataset.all });
            void client.invalidateQueries({ queryKey: queryKeys.draft.all });
            void client.invalidateQueries({ queryKey: queryKeys.builds.all });
            void client.invalidateQueries({ queryKey: queryKeys.health });
        },
    });
}

// ------------------------------------------------------------------- draft ---

/** An empty board is not worth a round-trip. */
function hasChampions(request: DraftRequest | null | undefined): boolean {
    if (!request) return false;
    return request.team.length > 0 || request.enemy.length > 0;
}

/**
 * The win-probability engine. Pass `null` to keep the query idle.
 *
 * `placeholderData: keepPrevious` is deliberate: while the next analysis is in
 * flight the gauge keeps showing the previous number instead of collapsing to
 * a spinner on every pick.
 */
export function useDraftAnalysis(
    request: DraftRequest | null,
    options?: QueryTweaks<AnalyzePayload>,
) {
    return useQuery<AnalyzePayload, ApiError, AnalyzePayload, readonly unknown[]>({
        queryKey: queryKeys.draft.analyze(request ?? { team: [], enemy: [] }),
        queryFn: ({ signal }) => api.draft.analyze(request!, { signal }),
        enabled: hasChampions(request),
        placeholderData: (previous) => previous,
        staleTime: 2 * MINUTE,
        ...options,
    });
}

/**
 * Pick suggestions for every open ally role (or the roles you name).
 * A full sweep is ~340 entries, hence `limit` (default 10 per role).
 */
export function useSuggestions(
    request: SuggestionsRequest | null,
    options?: QueryTweaks<SuggestionsPayload>,
) {
    return useQuery<
        SuggestionsPayload,
        ApiError,
        SuggestionsPayload,
        readonly unknown[]
    >({
        queryKey: queryKeys.draft.suggestions(request ?? { team: [], enemy: [] }),
        queryFn: ({ signal }) => api.draft.suggestions(request!, { signal }),
        enabled: request !== null,
        placeholderData: (previous) => previous,
        staleTime: 2 * MINUTE,
        ...options,
    });
}

/** Ban suggestions, most threatening first. */
export function useBanSuggestions(
    request: BansRequest | null,
    options?: QueryTweaks<BansPayload>,
) {
    return useQuery<BansPayload, ApiError, BansPayload, readonly unknown[]>({
        queryKey: queryKeys.draft.bans(request ?? { team: [], enemy: [] }),
        queryFn: ({ signal }) => api.draft.bans(request!, { signal }),
        enabled: request !== null,
        placeholderData: (previous) => previous,
        staleTime: 2 * MINUTE,
        ...options,
    });
}

// ------------------------------------------------------------------ builds ---

/** `championKey` accepts `"266"` or `"Aatrox"`; `null` keeps the query idle. */
export function useBuilds(
    championKey: string | null,
    query: BuildsQuery = {},
    options?: QueryTweaks<BuildsPayload>,
) {
    return useQuery<BuildsPayload, ApiError, BuildsPayload, readonly unknown[]>({
        queryKey: queryKeys.builds.one(championKey ?? "", query),
        queryFn: ({ signal }) => api.builds(championKey!, query, { signal }),
        enabled: championKey !== null && championKey !== "",
        placeholderData: (previous) => previous,
        staleTime: 5 * MINUTE,
        ...options,
    });
}

// ----------------------------------------------------------------- account ---

/**
 * Every hook below can fail with 428 `RIOT_KEY_MISSING`. That is not an error
 * to log loudly: `error.isRiotKeyMissing` is the signal to render the
 * "connecter mon compte" state.
 */

export function useAccountLookup(
    riotId: string | null,
    platform?: string,
    options?: QueryTweaks<AccountLookupResponse>,
) {
    const trimmed = riotId?.trim() ?? "";
    return useQuery<
        AccountLookupResponse,
        ApiError,
        AccountLookupResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.account.lookup(trimmed, platform),
        queryFn: ({ signal }) => api.account.lookup(trimmed, platform, { signal }),
        enabled: trimmed.includes("#") && trimmed.length >= 3,
        staleTime: 10 * MINUTE,
        ...options,
    });
}

export function useProfile(
    puuid: string | null,
    platform?: string,
    options?: QueryTweaks<ProfileResponse>,
) {
    return useQuery<ProfileResponse, ApiError, ProfileResponse, readonly unknown[]>({
        queryKey: queryKeys.account.profile(puuid ?? "", platform),
        queryFn: ({ signal }) => api.account.profile(puuid!, platform, { signal }),
        enabled: Boolean(puuid),
        staleTime: MINUTE,
        ...options,
    });
}

export function useMatches(
    puuid: string | null,
    params: { count?: number; platform?: string; refresh?: boolean } = {},
    options?: QueryTweaks<MatchesResponse>,
) {
    const count = params.count ?? 20;
    return useQuery<MatchesResponse, ApiError, MatchesResponse, readonly unknown[]>({
        queryKey: queryKeys.account.matches(puuid ?? "", count, params.platform),
        queryFn: ({ signal }) =>
            api.account.matches(puuid!, { ...params, count }, { signal }),
        enabled: Boolean(puuid),
        staleTime: 2 * MINUTE,
        ...options,
    });
}

/**
 * The expensive one: `count` matches read one by one through Riot's rate
 * limiter. Cached 15 minutes server-side; progress arrives as `job:progress`
 * WebSocket frames (`job: "playstyle"`).
 */
export function usePlaystyle(
    puuid: string | null,
    params: { count?: number; platform?: string; refresh?: boolean } = {},
    options?: QueryTweaks<PlaystyleResponse>,
) {
    const count = params.count ?? 50;
    return useQuery<PlaystyleResponse, ApiError, PlaystyleResponse, readonly unknown[]>(
        {
            queryKey: queryKeys.account.playstyle(puuid ?? "", count, params.platform),
            queryFn: ({ signal }) =>
                api.account.playstyle(puuid!, { ...params, count }, { signal }),
            enabled: Boolean(puuid),
            staleTime: 15 * MINUTE,
            ...options,
        },
    );
}

/**
 * Spectator data plus a full draft analysis. Answers 200 with
 * `inGame: false` when the player is not in a game, so poll it freely.
 */
export function useLiveGame(
    puuid: string | null,
    platform?: string,
    options?: QueryTweaks<LiveGameResponse> & { pollMs?: number },
) {
    const { pollMs, ...rest } = options ?? {};
    return useQuery<LiveGameResponse, ApiError, LiveGameResponse, readonly unknown[]>({
        queryKey: queryKeys.account.live(puuid ?? "", platform),
        queryFn: ({ signal }) => api.account.live(puuid!, platform, { signal }),
        enabled: Boolean(puuid),
        staleTime: 20_000,
        refetchInterval: pollMs ?? 30_000,
        ...rest,
    });
}

/**
 * The account the local League client is logged in as.
 *
 * The one account route that needs no Riot API key, which is how a player can
 * connect in a single click. `404 LCU_NO_SUMMONER` and `409 LCU_DISABLED` are
 * part of its contract, so they are rendered as states and never retried.
 */
export function useAccountMe(options?: QueryTweaks<AccountMeResponse>) {
    return useQuery<AccountMeResponse, ApiError, AccountMeResponse, readonly unknown[]>(
        {
            queryKey: queryKeys.account.me,
            queryFn: ({ signal }) => api.account.me({ signal }),
            staleTime: 30_000,
            retry: false,
            ...options,
        },
    );
}

// --------------------------------------------------------------------- LCU ---

/**
 * REST fallback for the LCU status. The WebSocket pushes the same payload —
 * prefer `useLcuLiveStatus()` from the socket context, which falls back to
 * this query while the socket is down.
 */
export function useLcuStatus(options?: QueryTweaks<LcuStatus>) {
    return useQuery<LcuStatus, ApiError, LcuStatus, readonly unknown[]>({
        queryKey: queryKeys.lcu.status,
        queryFn: ({ signal }) => api.lcu.status({ signal }),
        staleTime: 5000,
        ...options,
    });
}

/** The current champion select, already analysed — for a page load mid-draft. */
export function useLcuChampSelect(options?: QueryTweaks<LcuChampSelectResponse>) {
    return useQuery<
        LcuChampSelectResponse,
        ApiError,
        LcuChampSelectResponse,
        readonly unknown[]
    >({
        queryKey: queryKeys.lcu.champSelect,
        queryFn: ({ signal }) => api.lcu.champSelect({ signal }),
        staleTime: 5000,
        ...options,
    });
}
