/**
 * Errors this package throws.
 *
 * The rule everywhere else in the package: "the client is not running" is not
 * an error — discovery returns `null`, the watcher stays in its polling loop.
 * These types are for things that genuinely went wrong once we believed we had
 * a client to talk to.
 */

/** Base class, so callers can `catch (e) { if (e instanceof LcuError) … }`. */
export class LcuError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = "LcuError";
        if (options?.cause !== undefined) this.cause = options.cause;
    }
}

/** The socket could not be opened, or died mid-request. */
export class LcuConnectionError extends LcuError {
    /** Node's `error.code`, e.g. `ECONNREFUSED`, when there was one. */
    readonly code: string | undefined;

    constructor(message: string, options?: { cause?: unknown; code?: string }) {
        super(message, options);
        this.name = "LcuConnectionError";
        this.code = options?.code;
    }
}

/** The LCU answered with a non-2xx status. */
export class LcuHttpError extends LcuError {
    readonly status: number;
    readonly method: string;
    readonly path: string;
    /** Raw response body, truncated; the LCU puts a JSON error envelope here. */
    readonly body: string;
    /** `errorCode` from the LCU's error envelope, when it sent one. */
    readonly errorCode: string | undefined;

    constructor(args: {
        status: number;
        method: string;
        path: string;
        body: string;
        errorCode?: string;
        message?: string;
    }) {
        super(
            args.message ??
                `LCU ${args.method} ${args.path} failed with ${args.status}` +
                    (args.errorCode ? ` (${args.errorCode})` : ""),
        );
        this.name = "LcuHttpError";
        this.status = args.status;
        this.method = args.method;
        this.path = args.path;
        this.body = args.body;
        this.errorCode = args.errorCode;
    }
}

/** The response was not the JSON we expected. */
export class LcuParseError extends LcuError {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "LcuParseError";
    }
}

/** A request timed out. */
export class LcuTimeoutError extends LcuError {
    readonly timeoutMs: number;

    constructor(timeoutMs: number, method: string, path: string) {
        super(`LCU ${method} ${path} timed out after ${timeoutMs}ms`);
        this.name = "LcuTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

/**
 * A write action was attempted while `allowActions` is off.
 *
 * Acting on the champ-select session on the player's behalf can be considered
 * scripting by Riot, so it is opt-in and never enabled by default.
 */
export class LcuActionsDisabledError extends LcuError {
    constructor(action: string) {
        super(
            `LCU action "${action}" is disabled: construct the client with ` +
                `{ allowActions: true } to enable it. Automating champion select ` +
                `may be considered scripting by Riot — it is off by default.`,
        );
        this.name = "LcuActionsDisabledError";
    }
}

/** Extracts `error.code` from an unknown thrown value. */
export function errorCodeOf(error: unknown): string | undefined {
    if (typeof error !== "object" || error === null) return undefined;
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
}

/** Node error codes that mean "nobody is listening / the client went away". */
const DISCONNECT_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ECONNABORTED",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "ENOTFOUND",
    "EPIPE",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ERR_SOCKET_CONNECTION_TIMEOUT",
]);

/** True when the error means the League Client is simply not there any more. */
export function isDisconnectError(error: unknown): boolean {
    if (error instanceof LcuConnectionError) {
        return error.code === undefined || DISCONNECT_CODES.has(error.code);
    }
    if (error instanceof LcuTimeoutError) return true;
    const code = errorCodeOf(error);
    return code !== undefined && DISCONNECT_CODES.has(code);
}

/** A short human-readable reason, safe to log. */
export function describeError(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
}
