import type { Agent } from "node:https";
import {
    LcuActionsDisabledError,
    LcuHttpError,
    LcuParseError,
    describeError,
    isDisconnectError,
} from "./errors.js";
import { silentLogger, type Logger } from "./logger.js";
import { assertLoopbackHost, createLcuAgent } from "./http/agent.js";
import { createNodeTransport, type LcuTransport } from "./http/transport.js";
import { LCU_HOST, basicAuthHeader, lcuBaseUrl, type LcuCredentials } from "./types.js";
import type {
    GameflowPhase,
    LcuChampSelectSession,
    LcuErrorEnvelope,
    LcuGameflowSession,
    LcuGridChampion,
    LcuOwnedChampion,
    LcuRankedStats,
    LcuSummoner,
} from "./api/types.js";

/** HTTP verbs the client uses. */
export type LcuMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type LcuRequestOptions = {
    /** Per-call timeout override, in ms. `0` disables the timeout. */
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Extra headers, merged over the defaults. */
    headers?: Record<string, string>;
};

export type LcuClientOptions = {
    /** Where and how to reach the client. */
    credentials: LcuCredentials;
    /** Replaces the HTTP layer; tests pass a plain function. */
    transport?: LcuTransport;
    /** Shared TLS agent. One is created per client when omitted. */
    agent?: Agent;
    /** Loopback host to bind to. Defaults to `127.0.0.1`, must stay loopback. */
    host?: string;
    /** Default per-request timeout in ms. Default 10 000. */
    timeoutMs?: number;
    /**
     * Enables the write actions (currently only {@link LcuClient.hoverChampion}).
     *
     * **Off by default on purpose**: acting on champion select on the player's
     * behalf may be considered scripting by Riot. Nothing in this package
     * auto-picks, auto-bans or auto-accepts, and it never will.
     */
    allowActions?: boolean;
    logger?: Logger;
};

/** Response bodies longer than this are truncated in error messages. */
const MAX_ERROR_BODY = 512;

/**
 * A typed client for the local League Client API.
 *
 * Every call is an HTTPS request to `https://127.0.0.1:<port>` authenticated
 * with `riot:<remoting token>`. The self-signed certificate is accepted by a
 * dedicated agent scoped to this client — see `http/agent.ts` for why that is
 * safe and what keeps it contained.
 *
 * Endpoints that mean "not right now" (no champ select, no ranked stats)
 * return `null` on 404 instead of throwing: in this API a 404 is a state, not
 * a failure.
 */
export class LcuClient {
    readonly credentials: LcuCredentials;
    readonly baseUrl: string;
    readonly allowActions: boolean;

    private readonly transport: LcuTransport;
    private readonly ownedAgent: Agent | undefined;
    private readonly authorization: string;
    private readonly timeoutMs: number;
    private readonly logger: Logger;

    constructor(options: LcuClientOptions) {
        const host = options.host ?? LCU_HOST;
        assertLoopbackHost(host);

        this.credentials = options.credentials;
        this.baseUrl = lcuBaseUrl(options.credentials);
        this.allowActions = options.allowActions ?? false;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.logger = options.logger ?? silentLogger;
        this.authorization = basicAuthHeader(options.credentials.password);

        if (options.transport) {
            this.transport = options.transport;
            this.ownedAgent = undefined;
        } else {
            // Only create (and later destroy) an agent we own.
            this.ownedAgent = options.agent ?? createLcuAgent();
            this.transport = createNodeTransport({
                port: options.credentials.port,
                protocol: options.credentials.protocol,
                host,
                agent: this.ownedAgent,
            });
        }
    }

    /** Convenience constructor. */
    static fromCredentials(
        credentials: LcuCredentials,
        options: Omit<LcuClientOptions, "credentials"> = {},
    ): LcuClient {
        return new LcuClient({ ...options, credentials });
    }

    /** Releases keep-alive sockets. Safe to call more than once. */
    close(): void {
        this.ownedAgent?.destroy();
    }

    // ------------------------------------------------------------- generic ---

    /** Raw request. Throws {@link LcuHttpError} on a non-2xx status. */
    async request<T>(
        method: LcuMethod,
        path: string,
        body?: unknown,
        options: LcuRequestOptions = {},
    ): Promise<T> {
        const result = await this.requestOrStatus<T>(method, path, body, options);
        if (result.ok) return result.value;
        throw result.error;
    }

    /** `GET`, parsed as JSON. */
    get<T>(path: string, options?: LcuRequestOptions): Promise<T> {
        return this.request<T>("GET", path, undefined, options);
    }

    /** `GET`, with 404 mapped to `null`. */
    async getOptional<T>(
        path: string,
        options: LcuRequestOptions = {},
    ): Promise<T | null> {
        const result = await this.requestOrStatus<T>("GET", path, undefined, options);
        if (result.ok) return result.value;
        if (result.error.status === 404) return null;
        throw result.error;
    }

    /** `POST` with a JSON body. */
    post<T>(path: string, body?: unknown, options?: LcuRequestOptions): Promise<T> {
        return this.request<T>("POST", path, body, options);
    }

    /** `PATCH` with a JSON body. */
    patch<T>(path: string, body?: unknown, options?: LcuRequestOptions): Promise<T> {
        return this.request<T>("PATCH", path, body, options);
    }

    /** `PUT` with a JSON body. */
    put<T>(path: string, body?: unknown, options?: LcuRequestOptions): Promise<T> {
        return this.request<T>("PUT", path, body, options);
    }

    /** `DELETE`. */
    delete<T>(path: string, options?: LcuRequestOptions): Promise<T> {
        return this.request<T>("DELETE", path, undefined, options);
    }

    // ----------------------------------------------------------- endpoints ---

    /** The logged-in summoner, or `null` while the client is still starting. */
    getCurrentSummoner(options?: LcuRequestOptions): Promise<LcuSummoner | null> {
        return this.getOptional<LcuSummoner>(
            "/lol-summoner/v1/current-summoner",
            options,
        );
    }

    /** The champ-select session, or `null` when not in champion select. */
    getChampSelectSession(
        options?: LcuRequestOptions,
    ): Promise<LcuChampSelectSession | null> {
        return this.getOptional<LcuChampSelectSession>(
            "/lol-champ-select/v1/session",
            options,
        );
    }

    /** Current gameflow phase (`"None"`, `"ChampSelect"`, `"InProgress"`, …). */
    async getGameflowPhase(options?: LcuRequestOptions): Promise<GameflowPhase> {
        // This endpoint answers with a bare JSON string.
        const phase = await this.get<GameflowPhase>(
            "/lol-gameflow/v1/gameflow-phase",
            options,
        );
        return typeof phase === "string" ? phase : "None";
    }

    /** The full gameflow session (queue, map, game data). */
    getGameflowSession(
        options?: LcuRequestOptions,
    ): Promise<LcuGameflowSession | null> {
        return this.getOptional<LcuGameflowSession>(
            "/lol-gameflow/v1/session",
            options,
        );
    }

    /** Every champion in the champ-select grid, with pick/ban intent flags. */
    async getGridChampions(options?: LcuRequestOptions): Promise<LcuGridChampion[]> {
        const champions = await this.getOptional<LcuGridChampion[]>(
            "/lol-champ-select/v1/all-grid-champions",
            options,
        );
        return champions ?? [];
    }

    /** Champion ids the local player may pick right now. */
    async getPickableChampionIds(options?: LcuRequestOptions): Promise<number[]> {
        const ids = await this.getOptional<number[]>(
            "/lol-champ-select/v1/pickable-champion-ids",
            options,
        );
        return ids ?? [];
    }

    /** Champion ids the local player may ban right now. */
    async getBannableChampionIds(options?: LcuRequestOptions): Promise<number[]> {
        const ids = await this.getOptional<number[]>(
            "/lol-champ-select/v1/bannable-champion-ids",
            options,
        );
        return ids ?? [];
    }

    /** Champions the account owns (minimal payload). */
    async getOwnedChampions(options?: LcuRequestOptions): Promise<LcuOwnedChampion[]> {
        const champions = await this.getOptional<LcuOwnedChampion[]>(
            "/lol-champions/v1/owned-champions-minimal",
            options,
        );
        return champions ?? [];
    }

    /** Ranked stats for any puuid. */
    getRankedStats(
        puuid: string,
        options?: LcuRequestOptions,
    ): Promise<LcuRankedStats | null> {
        return this.getOptional<LcuRankedStats>(
            `/lol-ranked/v1/ranked-stats/${encodeURIComponent(puuid)}`,
            options,
        );
    }

    /** Ranked stats for the logged-in summoner. */
    getCurrentSummonerRanked(
        options?: LcuRequestOptions,
    ): Promise<LcuRankedStats | null> {
        return this.getOptional<LcuRankedStats>(
            "/lol-ranked/v1/current-ranked-stats",
            options,
        );
    }

    /** True when the client answers. Never throws. */
    async ping(options?: LcuRequestOptions): Promise<boolean> {
        try {
            await this.getGameflowPhase(options);
            return true;
        } catch (error) {
            if (!isDisconnectError(error)) {
                this.logger.debug(`LCU ping failed: ${describeError(error)}`);
            }
            return false;
        }
    }

    // ------------------------------------------------------------- actions ---

    /**
     * Hovers a champion for one of the local player's actions.
     *
     * This is the *only* write this package performs, and it is gated behind
     * `allowActions`. Automating champion select may be considered scripting by
     * Riot — off by default. Auto-pick, auto-ban and auto-accept are
     * deliberately not implemented.
     */
    async hoverChampion(
        actionId: number,
        championId: number,
        options?: LcuRequestOptions,
    ): Promise<void> {
        if (!this.allowActions) throw new LcuActionsDisabledError("hoverChampion");
        await this.patch<unknown>(
            `/lol-champ-select/v1/session/actions/${actionId}`,
            { championId },
            options,
        );
    }

    // -------------------------------------------------------------- internal ---

    private async requestOrStatus<T>(
        method: LcuMethod,
        path: string,
        body: unknown,
        options: LcuRequestOptions,
    ): Promise<{ ok: true; value: T } | { ok: false; error: LcuHttpError }> {
        const serialized = body === undefined ? undefined : JSON.stringify(body);
        const headers: Record<string, string> = {
            authorization: this.authorization,
            accept: "application/json",
            ...(serialized !== undefined
                ? {
                      "content-type": "application/json",
                      "content-length": String(Buffer.byteLength(serialized)),
                  }
                : {}),
            ...options.headers,
        };

        const response = await this.transport({
            method,
            path,
            headers,
            ...(serialized !== undefined ? { body: serialized } : {}),
            timeoutMs: options.timeoutMs ?? this.timeoutMs,
            ...(options.signal ? { signal: options.signal } : {}),
        });

        if (response.status < 200 || response.status >= 300) {
            const envelope = parseErrorEnvelope(response.body);
            return {
                ok: false,
                error: new LcuHttpError({
                    status: response.status,
                    method,
                    path,
                    body: response.body.slice(0, MAX_ERROR_BODY),
                    ...(envelope?.errorCode ? { errorCode: envelope.errorCode } : {}),
                }),
            };
        }

        return { ok: true, value: parseJsonBody<T>(response.body, method, path) };
    }
}

function parseJsonBody<T>(body: string, method: string, path: string): T {
    // 204 and friends legitimately have no body.
    if (body.trim().length === 0) return undefined as T;
    try {
        return JSON.parse(body) as T;
    } catch (error) {
        throw new LcuParseError(
            `LCU ${method} ${path} returned a body that is not JSON`,
            { cause: error },
        );
    }
}

function parseErrorEnvelope(body: string): LcuErrorEnvelope | undefined {
    if (body.trim().length === 0) return undefined;
    try {
        const parsed: unknown = JSON.parse(body);
        if (typeof parsed === "object" && parsed !== null) {
            return parsed as LcuErrorEnvelope;
        }
    } catch {
        // The LCU occasionally answers with plain text; nothing to extract.
    }
    return undefined;
}
