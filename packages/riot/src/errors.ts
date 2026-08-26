/**
 * Typed errors for the Riot API client.
 *
 * Every message produced here goes through {@link redactApiKey} so a key can
 * never leak into a log line, an error report or an HTTP response body.
 */

const RGAPI_PATTERN = /RGAPI-[0-9a-zA-Z-]+/g;
const API_KEY_QUERY_PATTERN = /([?&]api_key=)[^&\s]+/g;

export const REDACTED = "[REDACTED]";

/**
 * Removes anything that looks like a Riot API key from `text`:
 * the `RGAPI-…` shape, an `api_key=` query parameter and, when given, the
 * literal key currently in use (development keys are not always `RGAPI-`).
 */
export function redactApiKey(text: string, apiKey?: string): string {
    let out = text.replace(RGAPI_PATTERN, REDACTED);
    out = out.replace(API_KEY_QUERY_PATTERN, `$1${REDACTED}`);
    if (apiKey && apiKey.length > 0) {
        out = out.split(apiKey).join(REDACTED);
    }
    return out;
}

/** Recursively redacts strings inside a log/metadata object. */
export function redactValue(value: unknown, apiKey?: string): unknown {
    if (typeof value === "string") return redactApiKey(value, apiKey);
    if (Array.isArray(value)) return value.map((item) => redactValue(item, apiKey));
    if (value && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            out[key] = /token|key|authorization/i.test(key)
                ? REDACTED
                : redactValue(item, apiKey);
        }
        return out;
    }
    return value;
}

export type RiotApiErrorOptions = {
    status?: number;
    code?: string;
    endpoint?: string;
    method?: string;
    retryable?: boolean;
    apiKey?: string;
    requestId?: string;
    body?: string;
    cause?: unknown;
};

/** Base class for every error thrown by the client. */
export class RiotApiError extends Error {
    /** HTTP status, `0` for transport/network failures. */
    readonly status: number;
    /** Stable machine readable code, e.g. `NOT_FOUND`, `RATE_LIMITED`. */
    readonly code: string;
    /** Logical endpoint name, e.g. `match-v5.byId`. */
    readonly endpoint: string;
    /** HTTP method of the failed request. */
    readonly method: string;
    /** Whether retrying the exact same request could succeed. */
    readonly retryable: boolean;
    /** Riot's `X-Riot-Edge-Trace-Id`, when present. */
    readonly requestId?: string;
    /** Redacted response body, truncated. */
    readonly body?: string;

    constructor(message: string, options: RiotApiErrorOptions = {}) {
        super(redactApiKey(message, options.apiKey), { cause: options.cause });
        this.name = "RiotApiError";
        this.status = options.status ?? 0;
        this.code = options.code ?? "RIOT_API_ERROR";
        this.endpoint = options.endpoint ?? "unknown";
        this.method = options.method ?? "GET";
        this.retryable = options.retryable ?? false;
        this.requestId = options.requestId;
        this.body =
            options.body === undefined
                ? undefined
                : redactApiKey(options.body, options.apiKey).slice(0, 500);
    }

    /** JSON-safe shape, safe to return from an HTTP API. */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            status: this.status,
            endpoint: this.endpoint,
            retryable: this.retryable,
            message: this.message,
        };
    }
}

/** 401/403 — the key is missing, invalid, expired or lacks the endpoint. */
export class RiotAuthError extends RiotApiError {
    constructor(options: RiotApiErrorOptions = {}) {
        super("Riot API: invalid or expired API key", {
            ...options,
            code:
                options.code ?? (options.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED"),
            status: options.status ?? 401,
            retryable: false,
        });
        this.name = "RiotAuthError";
    }
}

/** 404 — the resource does not exist (unknown Riot ID, no live game, …). */
export class RiotNotFoundError extends RiotApiError {
    constructor(
        message = "Riot API: resource not found",
        options: RiotApiErrorOptions = {},
    ) {
        super(message, {
            ...options,
            code: options.code ?? "NOT_FOUND",
            status: options.status ?? 404,
            retryable: false,
        });
        this.name = "RiotNotFoundError";
    }
}

export type RateLimitType = "application" | "method" | "service" | "unknown";

/** 429 — rate limited; carries `Retry-After` and `X-Rate-Limit-Type`. */
export class RiotRateLimitError extends RiotApiError {
    /** Seconds Riot asked us to wait; `undefined` when the header was absent. */
    readonly retryAfterSeconds?: number;
    readonly limitType: RateLimitType;

    constructor(
        options: RiotApiErrorOptions & {
            retryAfterSeconds?: number;
            limitType?: RateLimitType;
        } = {},
    ) {
        const limitType = options.limitType ?? "unknown";
        const wait =
            options.retryAfterSeconds === undefined
                ? ""
                : ` (retry after ${options.retryAfterSeconds}s)`;
        super(`Riot API: rate limit exceeded [${limitType}]${wait}`, {
            ...options,
            code: options.code ?? "RATE_LIMITED",
            status: options.status ?? 429,
            retryable: true,
        });
        this.name = "RiotRateLimitError";
        this.retryAfterSeconds = options.retryAfterSeconds;
        this.limitType = limitType;
    }
}

/** Transport failure (DNS, TLS, timeout, offline). Always retryable. */
export class RiotNetworkError extends RiotApiError {
    constructor(message: string, options: RiotApiErrorOptions = {}) {
        super(message, {
            ...options,
            code: options.code ?? "NETWORK_ERROR",
            status: 0,
            retryable: true,
        });
        this.name = "RiotNetworkError";
    }
}

export function isRiotApiError(error: unknown): error is RiotApiError {
    return error instanceof RiotApiError;
}

/** True when the error is worth retrying with backoff. */
export function isRetryable(error: unknown): boolean {
    return isRiotApiError(error) && error.retryable;
}
