import { ApiError, parseErrorBody } from "./errors";
import type {
    AccountLookupResponse,
    AccountMeResponse,
    AnalyzePayload,
    BansPayload,
    BansRequest,
    BuildsPayload,
    BuildsQuery,
    ConfigResponse,
    ConfigUpdate,
    ConfigUpdateResponse,
    DatasetProvidersResponse,
    DatasetQuery,
    DatasetRefreshResponse,
    DatasetResponse,
    DraftRequest,
    HealthResponse,
    LcuChampSelectResponse,
    LcuStatus,
    LcuSummonerResponse,
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
 * The typed HTTP client. One function per documented route, nothing else.
 *
 * The app is always same-origin — Vite proxies `/api` in development and the
 * Fastify server serves `dist/` in production — so URLs are relative and no
 * base URL has to be configured. `VITE_API_BASE` exists only for the Electron
 * shell, which may load the UI from a file URL.
 */

const BASE: string = (import.meta.env?.VITE_API_BASE ?? "").replace(/\/$/, "");

export type RequestOptions = {
    signal?: AbortSignal;
    /** Extra headers; `Content-Type` is set automatically for JSON bodies. */
    headers?: Record<string, string>;
};

export type QueryValue = string | number | boolean | undefined | null;

/** Builds `?a=1&b=2`, dropping empty values so `?role=` never happens. */
export function buildQuery(params: Record<string, QueryValue>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "") continue;
        search.set(
            key,
            typeof value === "boolean" ? (value ? "1" : "0") : String(value),
        );
    }
    const query = search.toString();
    return query.length > 0 ? `?${query}` : "";
}

export function apiUrl(path: string): string {
    return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (text.length === 0) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

/**
 * The single place a `fetch` happens. Turns every failure into an
 * {@link ApiError} — including a dead server, which becomes `NETWORK_ERROR`
 * rather than an opaque `TypeError: Failed to fetch`.
 */
export async function request<T>(
    path: string,
    init: RequestInit & RequestOptions = {},
): Promise<T> {
    const url = apiUrl(path);
    let response: Response;
    try {
        response = await fetch(url, {
            ...init,
            headers: {
                Accept: "application/json",
                ...(init.body === undefined
                    ? {}
                    : { "Content-Type": "application/json" }),
                ...init.headers,
            },
        });
    } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") throw cause;
        throw new ApiError({
            code: "NETWORK_ERROR",
            message: "Le serveur DraftPredict est injoignable.",
            status: 0,
            endpoint: path,
            cause,
        });
    }

    const body = await readBody(response);

    if (!response.ok) {
        const envelope = parseErrorBody(body);
        throw new ApiError({
            code: envelope?.code ?? `HTTP_${response.status}`,
            message: envelope?.message ?? response.statusText ?? "Erreur serveur",
            status: response.status,
            details: envelope?.details,
            endpoint: path,
        });
    }

    return body as T;
}

function get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>(path, { method: "GET", ...options });
}

function post<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
): Promise<T> {
    return request<T>(path, {
        method: "POST",
        body: JSON.stringify(body ?? {}),
        ...options,
    });
}

// ------------------------------------------------------------------ routes ---

export const api = {
    /** `GET /api/health` — dataset provider, static patch, LCU, Riot key. */
    health: (options?: RequestOptions) => get<HealthResponse>("/api/health", options),

    config: {
        /** `GET /api/config` — the key is never in here. */
        get: (options?: RequestOptions) => get<ConfigResponse>("/api/config", options),
        /** `POST /api/config` — only the fields you send are changed. */
        update: (patch: ConfigUpdate, options?: RequestOptions) =>
            post<ConfigUpdateResponse>("/api/config", patch, options),
    },

    static: {
        summary: (options?: RequestOptions) =>
            get<StaticSummary>("/api/static/summary", options),
        champions: (options?: RequestOptions) =>
            get<StaticChampionsResponse>("/api/static/champions", options),
        items: (options?: RequestOptions) =>
            get<StaticItemsResponse>("/api/static/items", options),
        runes: (options?: RequestOptions) =>
            get<StaticRunesResponse>("/api/static/runes", options),
        summonerSpells: (options?: RequestOptions) =>
            get<StaticSummonerSpellsResponse>("/api/static/summoner-spells", options),
        /** Forgiving champion search: `mf`, `MissF`, `fortune` all work. */
        search: (query: string, limit?: number, options?: RequestOptions) =>
            get<StaticSearchResponse>(
                `/api/static/search${buildQuery({ q: query, limit })}`,
                options,
            ),
    },

    dataset: {
        /** `include: "full"` returns the whole dataset — tens of megabytes. */
        get: (query: DatasetQuery = {}, options?: RequestOptions) =>
            get<DatasetResponse>(`/api/dataset${buildQuery({ ...query })}`, options),
        providers: (options?: RequestOptions) =>
            get<DatasetProvidersResponse>("/api/dataset/providers", options),
        /** Bypasses both cache tiers and broadcasts `dataset:update`. */
        refresh: (
            body: Pick<DatasetQuery, "rank" | "region" | "patch"> = {},
            options?: RequestOptions,
        ) => post<DatasetRefreshResponse>("/api/dataset/refresh", body, options),
    },

    draft: {
        analyze: (body: DraftRequest, options?: RequestOptions) =>
            post<AnalyzePayload>("/api/draft/analyze", body, options),
        /** Covers every open ally role unless `roles` narrows it. */
        suggestions: (body: SuggestionsRequest, options?: RequestOptions) =>
            post<SuggestionsPayload>("/api/draft/suggestions", body, options),
        bans: (body: BansRequest, options?: RequestOptions) =>
            post<BansPayload>("/api/draft/bans", body, options),
    },

    /** `championKey` accepts `"266"` or `"Aatrox"`. */
    builds: (championKey: string, query: BuildsQuery = {}, options?: RequestOptions) =>
        get<BuildsPayload>(
            `/api/builds/${encodeURIComponent(championKey)}${buildQuery({ ...query })}`,
            options,
        ),

    account: {
        /** `riotId` is `"Nom#TAG"`; the `#` is encoded here. */
        me: (options?: RequestOptions) =>
            get<AccountMeResponse>("/api/account/me", options),
        lookup: (riotId: string, platform?: string, options?: RequestOptions) =>
            get<AccountLookupResponse>(
                `/api/account/lookup${buildQuery({ riotId, platform })}`,
                options,
            ),
        profile: (puuid: string, platform?: string, options?: RequestOptions) =>
            get<ProfileResponse>(
                `/api/account/${encodeURIComponent(puuid)}/profile${buildQuery({ platform })}`,
                options,
            ),
        matches: (
            puuid: string,
            params: { count?: number; platform?: string; refresh?: boolean } = {},
            options?: RequestOptions,
        ) =>
            get<MatchesResponse>(
                `/api/account/${encodeURIComponent(puuid)}/matches${buildQuery({ ...params })}`,
                options,
            ),
        /** Expensive: reads `count` matches through the rate limiter. */
        playstyle: (
            puuid: string,
            params: { count?: number; platform?: string; refresh?: boolean } = {},
            options?: RequestOptions,
        ) =>
            get<PlaystyleResponse>(
                `/api/account/${encodeURIComponent(puuid)}/playstyle${buildQuery({ ...params })}`,
                options,
            ),
        live: (puuid: string, platform?: string, options?: RequestOptions) =>
            get<LiveGameResponse>(
                `/api/account/${encodeURIComponent(puuid)}/live${buildQuery({ platform })}`,
                options,
            ),
    },

    lcu: {
        status: (options?: RequestOptions) =>
            get<LcuStatus>("/api/lcu/status", options),
        /** 404 `LCU_NO_SUMMONER` when no client is connected. */
        summoner: (options?: RequestOptions) =>
            get<LcuSummonerResponse>("/api/lcu/summoner", options),
        /** Same content as the `champselect:update` WebSocket frame. */
        champSelect: (options?: RequestOptions) =>
            get<LcuChampSelectResponse>("/api/lcu/champ-select", options),
    },
};

export type ApiClient = typeof api;
