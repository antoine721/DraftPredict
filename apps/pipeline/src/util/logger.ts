/**
 * The pipeline's logging seam.
 *
 * Long-running collection runs are watched from a terminal, so this writes to
 * the console — but it goes through one place so that (a) levels can be turned
 * down in tests, and (b) every message is passed through a redactor before it
 * is printed. The Riot API key must never reach a log file.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
    silent: 100,
};

export type PipelineLogger = {
    level: LogLevel;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    /** Redacts secrets out of an arbitrary string. */
    redact(text: string): string;
};

export type CreateLoggerOptions = {
    level?: LogLevel;
    prefix?: string;
    /** Literal secrets that must never be printed (an API key, typically). */
    secrets?: readonly (string | undefined)[];
    /** Sink, injected by tests. */
    write?: (level: Exclude<LogLevel, "silent">, line: string) => void;
};

export const REDACTED = "[REDACTED]";

/** Escapes a literal for use inside a RegExp. */
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createLogger(options: CreateLoggerOptions = {}): PipelineLogger {
    const prefix = options.prefix ?? "pipeline";
    const secrets = (options.secrets ?? []).filter(
        (secret): secret is string => typeof secret === "string" && secret.length >= 8,
    );
    const patterns = secrets.map((secret) => new RegExp(escapeRegExp(secret), "g"));

    const redact = (text: string): string => {
        let output = text;
        for (const pattern of patterns) output = output.replace(pattern, REDACTED);
        // Riot keys have a fixed shape; catch any that were not passed in.
        return output.replace(/RGAPI-[0-9a-fA-F-]{8,}/g, REDACTED);
    };

    const write =
        options.write ??
        ((level: Exclude<LogLevel, "silent">, line: string): void => {
            const sink =
                level === "error"
                    ? console.error
                    : level === "warn"
                      ? console.warn
                      : level === "debug"
                        ? console.debug
                        : console.info;
            sink(line);
        });

    const logger: PipelineLogger = {
        level: options.level ?? "info",
        redact,
        debug: (message, ...args) => emit("debug", message, args),
        info: (message, ...args) => emit("info", message, args),
        warn: (message, ...args) => emit("warn", message, args),
        error: (message, ...args) => emit("error", message, args),
    };

    function emit(
        level: Exclude<LogLevel, "silent">,
        message: string,
        args: unknown[],
    ): void {
        if (LEVEL_ORDER[level] < LEVEL_ORDER[logger.level]) return;
        const rendered = args.length > 0 ? `${message} ${args.map(render).join(" ")}` : message;
        write(level, redact(`[${prefix}] ${rendered}`));
    }

    return logger;
}

function render(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack ?? value.message;
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/** A logger that drops everything — the default in tests. */
export const silentLogger: PipelineLogger = createLogger({ level: "silent" });
