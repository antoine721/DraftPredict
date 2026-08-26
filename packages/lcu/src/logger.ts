/**
 * A minimal logging seam, structurally identical to the one in
 * `@draftpredict/data` so a host can pass the same logger to both packages.
 *
 * Everything in this package that fails softly — a lockfile that cannot be
 * read, a WebSocket that refuses to open, a client that disappeared mid-poll —
 * reports through a {@link Logger} instead of writing to the console, so tests
 * stay quiet and hosts stay in control.
 */
export type Logger = {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
};

/** Drops every message. The default everywhere in this package. */
export const silentLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

/** Writes to the console, prefixed so the source is obvious in a server log. */
export function createConsoleLogger(prefix = "@draftpredict/lcu"): Logger {
    return {
        debug: (message, ...args) => console.debug(`[${prefix}] ${message}`, ...args),
        info: (message, ...args) => console.info(`[${prefix}] ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[${prefix}] ${message}`, ...args),
        error: (message, ...args) => console.error(`[${prefix}] ${message}`, ...args),
    };
}
