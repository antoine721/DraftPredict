/**
 * A minimal logging seam.
 *
 * Everything in this package that can fail softly (the static-data updater,
 * the disk cache, remote providers) reports through a {@link Logger} instead
 * of writing to the console directly, so hosts can route it and tests can stay
 * quiet.
 */
export type Logger = {
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
};

/** Drops every message. The default everywhere. */
export const silentLogger: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
};

/** Writes to the console, prefixed so the source is obvious in a server log. */
export function createConsoleLogger(prefix = "@draftpredict/data"): Logger {
    return {
        debug: (message, ...args) => console.debug(`[${prefix}] ${message}`, ...args),
        info: (message, ...args) => console.info(`[${prefix}] ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[${prefix}] ${message}`, ...args),
        error: (message, ...args) => console.error(`[${prefix}] ${message}`, ...args),
    };
}
