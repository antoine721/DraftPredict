import { DEFAULT_CACHE_TTLS, TtlCache, type RiotMethod } from "./cache.js";
import {
    RiotApiError,
    RiotAuthError,
    RiotNetworkError,
    RiotNotFoundError,
    RiotRateLimitError,
    redactApiKey,
    redactValue,
    type RateLimitType,
} from "./errors.js";
import { RateLimiter, type RateLimitRule } from "./rate-limiter.js";

/** Minimal structural subset of the WHATWG `Response`. */
export type RiotResponseLike = {
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
};

export type RiotFetchInit = {
    method: string;
    headers: Record<string, string>;
    signal?: AbortSignal;
};

/** Structural subset of `fetch`; the global `fetch` satisfies it. */
export type RiotFetch = (url: string, init: RiotFetchInit) => Promise<RiotResponseLike>;

export type LogMeta = Record<string, unknown>;

export type Logger = {
    debug?: (message: string, meta?: LogMeta) => void;
    info?: (message: string, meta?: LogMeta) => void;
    warn?: (message: string, meta?: LogMeta) => void;
    error?: (message: string, meta?: LogMeta) => void;
};

export type RateLimitEvent = {
    /** Logical endpoint that was limited. */
    method: string;
    limitType: RateLimitType;
    /** Seconds Riot asked us to wait, when the header was present. */
    retryAfterSeconds?: number;
    /** Milliseconds this client will actually wait before retrying. */
    waitMs: number;
    /** 0-based attempt index that got limited. */
    attempt: number;
    willRetry: boolean;
};

export type RiotHttpOptions = {
    apiKey: string;
    fetch?: RiotFetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    /** Returns a number in [0,1); injected for deterministic tests. */
    jitter?: () => number;
    logger?: Logger;
    rateLimiter?: RateLimiter;
    rateLimits?: readonly RateLimitRule[];
    methodRateLimits?: Record<string, readonly RateLimitRule[]>;
    cache?: TtlCache<unknown> | false;
    ttls?: Partial<Record<RiotMethod, number>>;
    /** Retries for 429 and 5xx responses. Default 3. */
    maxRetries?: number;
    /** First backoff step in ms. Default 500. */
    retryBaseDelayMs?: number;
    /** Backoff ceiling in ms. Default 20_000. */
    retryMaxDelayMs?: number;
    /** Per-request timeout in ms; `0` disables it. Default 10_000. */
    timeoutMs?: number;
    onRateLimit?: (event: RateLimitEvent) => void;
    userAgent?: string;
};

export type RiotRequestSpec = {
    /** Logical method name, used for cache TTL, rate limits and errors. */
    method: RiotMethod;
    url: string;
    /** Overrides the default TTL for this method. */
    ttlMs?: number;
    /** Overrides the derived cache key (defaults to `method + url`). */
    cacheKey?: string;
};

const defaultSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/** Parses `Retry-After`; Riot always sends whole seconds. */
export function parseRetryAfter(value: string | null): number | undefined {
    if (value === null) return undefined;
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds) && seconds >= 0) return seconds;
    const date = Date.parse(value);
    if (Number.isNaN(date)) return undefined;
    return Math.max(0, (date - Date.now()) / 1000);
}

export function parseLimitType(value: string | null): RateLimitType {
    switch ((value ?? "").trim().toLowerCase()) {
        case "application":
            return "application";
        case "method":
            return "method";
        case "service":
            return "service";
        default:
            return "unknown";
    }
}

/**
 * Exponential backoff with "full jitter": the delay is uniformly drawn from
 * `[base * 2^attempt / 2, base * 2^attempt]`, capped at `maxDelayMs`.
 */
export function computeBackoffMs(
    attempt: number,
    baseMs: number,
    maxMs: number,
    jitter: number,
): number {
    const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt));
    const bounded = Math.min(1, Math.max(0, jitter));
    return Math.round(exponential * (0.5 + 0.5 * bounded));
}

/**
 * Executes Riot API requests: rate limiting, retries with backoff, TTL cache,
 * typed errors and always-redacted logging.
 */
export class RiotHttpClient {
    readonly rateLimiter: RateLimiter;
    readonly cache: TtlCache<unknown> | undefined;

    private readonly apiKey: string;
    private readonly fetchImpl: RiotFetch;
    private readonly now: () => number;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly jitter: () => number;
    private readonly logger: Logger;
    private readonly ttls: Record<string, number>;
    private readonly maxRetries: number;
    private readonly retryBaseDelayMs: number;
    private readonly retryMaxDelayMs: number;
    private readonly timeoutMs: number;
    private readonly onRateLimit?: (event: RateLimitEvent) => void;
    private readonly userAgent: string;

    constructor(options: RiotHttpOptions) {
        if (!options.apiKey) {
            throw new RiotAuthError({ code: "MISSING_API_KEY" });
        }
        this.apiKey = options.apiKey;
        const globalFetch = (globalThis as { fetch?: RiotFetch }).fetch;
        const fetchImpl = options.fetch ?? globalFetch;
        if (!fetchImpl) {
            throw new Error(
                "No fetch implementation available; pass `fetch` to the Riot client.",
            );
        }
        this.fetchImpl = fetchImpl;
        this.now = options.now ?? (() => Date.now());
        this.sleep = options.sleep ?? defaultSleep;
        this.jitter = options.jitter ?? Math.random;
        this.logger = options.logger ?? {};
        this.rateLimiter =
            options.rateLimiter ??
            new RateLimiter({
                rules: options.rateLimits,
                methodRules: options.methodRateLimits,
                now: this.now,
                sleep: this.sleep,
            });
        this.cache =
            options.cache === false
                ? undefined
                : (options.cache ?? new TtlCache<unknown>({ now: this.now }));
        this.ttls = { ...DEFAULT_CACHE_TTLS, ...options.ttls };
        this.maxRetries = options.maxRetries ?? 3;
        this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
        this.retryMaxDelayMs = options.retryMaxDelayMs ?? 20_000;
        this.timeoutMs = options.timeoutMs ?? 10_000;
        this.onRateLimit = options.onRateLimit;
        this.userAgent = options.userAgent ?? "DraftPredict/0.1 (+riot-client)";
    }

    /** Redacts the API key out of any string. Exposed for callers' logs. */
    redact(text: string): string {
        return redactApiKey(text, this.apiKey);
    }

    private log(
        level: "debug" | "info" | "warn" | "error",
        message: string,
        meta?: LogMeta,
    ): void {
        const sink = this.logger[level];
        if (!sink) return;
        sink(
            this.redact(message),
            meta ? (redactValue(meta, this.apiKey) as LogMeta) : undefined,
        );
    }

    private ttlFor(spec: RiotRequestSpec): number {
        return spec.ttlMs ?? this.ttls[spec.method] ?? 0;
    }

    /**
     * GETs `spec.url`, returning parsed JSON. Throws typed Riot errors.
     *
     * Cached values are returned by reference — treat them as read-only.
     */
    async request<T>(spec: RiotRequestSpec): Promise<T> {
        const cacheKey = spec.cacheKey ?? `${spec.method} ${spec.url}`;
        const ttl = this.ttlFor(spec);
        if (this.cache && ttl > 0) {
            const cached = this.cache.get(cacheKey) as T | undefined;
            if (cached !== undefined) {
                this.log("debug", `cache hit ${spec.method}`);
                return cached;
            }
        }
        const value = await this.execute<T>(spec);
        if (this.cache && ttl > 0) this.cache.set(cacheKey, value, ttl);
        return value;
    }

    /** Like {@link request} but maps a 404 to `null`. */
    async requestOrNull<T>(spec: RiotRequestSpec): Promise<T | null> {
        try {
            return await this.request<T>(spec);
        } catch (error) {
            if (error instanceof RiotNotFoundError) return null;
            throw error;
        }
    }

    private async execute<T>(spec: RiotRequestSpec): Promise<T> {
        let lastError: RiotApiError | undefined;
        for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
            await this.rateLimiter.acquire(spec.method);
            let response: RiotResponseLike;
            try {
                response = await this.send(spec);
            } catch (error) {
                const networkError = new RiotNetworkError(
                    `Riot API request failed: ${errorMessage(error)}`,
                    {
                        endpoint: spec.method,
                        apiKey: this.apiKey,
                        cause: error,
                    },
                );
                lastError = networkError;
                if (attempt >= this.maxRetries) throw networkError;
                const delay = computeBackoffMs(
                    attempt,
                    this.retryBaseDelayMs,
                    this.retryMaxDelayMs,
                    this.jitter(),
                );
                this.log("warn", `network error, retrying in ${delay}ms`, {
                    method: spec.method,
                    attempt,
                });
                await this.sleep(delay);
                continue;
            }

            if (response.status >= 200 && response.status < 300) {
                const body = await response.text();
                if (body.length === 0) return undefined as unknown as T;
                try {
                    return JSON.parse(body) as T;
                } catch (error) {
                    throw new RiotApiError("Riot API returned malformed JSON", {
                        status: response.status,
                        code: "INVALID_JSON",
                        endpoint: spec.method,
                        apiKey: this.apiKey,
                        cause: error,
                    });
                }
            }

            const error = await this.toError(spec, response);
            lastError = error;

            if (error instanceof RiotRateLimitError) {
                const limitType = error.limitType;
                const backoff = computeBackoffMs(
                    attempt,
                    this.retryBaseDelayMs,
                    this.retryMaxDelayMs,
                    this.jitter(),
                );
                const retryAfterMs = (error.retryAfterSeconds ?? 0) * 1000;
                const waitMs = Math.max(retryAfterMs, backoff);
                const willRetry = attempt < this.maxRetries;
                if (limitType === "method") {
                    this.rateLimiter.penalize(waitMs / 1000, {
                        scope: "method",
                        method: spec.method,
                    });
                } else if (limitType !== "service") {
                    this.rateLimiter.penalize(waitMs / 1000);
                }
                this.onRateLimit?.({
                    method: spec.method,
                    limitType,
                    retryAfterSeconds: error.retryAfterSeconds,
                    waitMs,
                    attempt,
                    willRetry,
                });
                this.log("warn", `rate limited (${limitType}), waiting ${waitMs}ms`, {
                    method: spec.method,
                    attempt,
                });
                if (!willRetry) throw error;
                // For application/method limits the limiter itself now holds
                // every request back until the penalty expires, so the next
                // `acquire()` does the waiting. A `service` limit is not our
                // budget, so we simply back off here.
                if (limitType === "service") await this.sleep(waitMs);
                continue;
            }

            if (!error.retryable || attempt >= this.maxRetries) throw error;

            const delay = computeBackoffMs(
                attempt,
                this.retryBaseDelayMs,
                this.retryMaxDelayMs,
                this.jitter(),
            );
            this.log("warn", `HTTP ${error.status}, retrying in ${delay}ms`, {
                method: spec.method,
                attempt,
            });
            await this.sleep(delay);
        }
        /* istanbul ignore next — the loop always throws or returns. */
        throw (
            lastError ??
            new RiotApiError("Riot API request failed", {
                endpoint: spec.method,
                apiKey: this.apiKey,
            })
        );
    }

    private async send(spec: RiotRequestSpec): Promise<RiotResponseLike> {
        const headers: Record<string, string> = {
            // The key travels in the header only — never in the URL.
            "X-Riot-Token": this.apiKey,
            Accept: "application/json",
            "User-Agent": this.userAgent,
        };
        const init: RiotFetchInit = { method: "GET", headers };
        if (this.timeoutMs > 0 && typeof AbortController === "function") {
            const controller = new AbortController();
            const timer = setTimeout(() => {
                controller.abort();
            }, this.timeoutMs);
            init.signal = controller.signal;
            try {
                return await this.fetchImpl(spec.url, init);
            } finally {
                clearTimeout(timer);
            }
        }
        return this.fetchImpl(spec.url, init);
    }

    private async toError(
        spec: RiotRequestSpec,
        response: RiotResponseLike,
    ): Promise<RiotApiError> {
        const body = await safeText(response);
        const requestId = response.headers.get("X-Riot-Edge-Trace-Id") ?? undefined;
        const base = {
            status: response.status,
            endpoint: spec.method,
            apiKey: this.apiKey,
            requestId,
            body,
        };
        if (response.status === 401 || response.status === 403) {
            return new RiotAuthError(base);
        }
        if (response.status === 404) {
            return new RiotNotFoundError(`Riot API: not found (${spec.method})`, base);
        }
        if (response.status === 429) {
            return new RiotRateLimitError({
                ...base,
                retryAfterSeconds: parseRetryAfter(response.headers.get("Retry-After")),
                limitType: parseLimitType(response.headers.get("X-Rate-Limit-Type")),
            });
        }
        if (response.status >= 500) {
            return new RiotApiError(
                `Riot API: server error ${response.status} (${spec.method})`,
                { ...base, code: serverCode(response.status), retryable: true },
            );
        }
        return new RiotApiError(
            `Riot API: request failed with status ${response.status} (${spec.method})`,
            { ...base, code: clientCode(response.status), retryable: false },
        );
    }
}

function serverCode(status: number): string {
    if (status === 502) return "BAD_GATEWAY";
    if (status === 503) return "SERVICE_UNAVAILABLE";
    if (status === 504) return "GATEWAY_TIMEOUT";
    return "INTERNAL_SERVER_ERROR";
}

function clientCode(status: number): string {
    if (status === 400) return "BAD_REQUEST";
    if (status === 405) return "METHOD_NOT_ALLOWED";
    if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
    return `HTTP_${status}`;
}

async function safeText(response: RiotResponseLike): Promise<string | undefined> {
    try {
        return await response.text();
    } catch {
        return undefined;
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}
