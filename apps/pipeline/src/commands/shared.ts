import type { Rank, Region } from "@draftpredict/core";
import { parseRank, parseRegion } from "@draftpredict/core";

import type { LogLevel, PipelineLogger } from "../util/logger.js";
import { createLogger } from "../util/logger.js";

/** Exit codes the CLI uses; `verify` relies on 1 meaning "checks failed". */
export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;

export class UsageError extends Error {
    override readonly name = "UsageError";
}

/** Splits `--queue 420,440` / repeated flags into a list of numbers. */
export function parseNumberList(values: string | string[] | undefined): number[] {
    return toList(values)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
}

export function toList(values: string | string[] | undefined): string[] {
    if (values === undefined) return [];
    const raw = Array.isArray(values) ? values : [values];
    return raw
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}

/**
 * Accepts `2026-08-01`, `2026-08-01T12:00:00Z` and a raw epoch (seconds or
 * milliseconds), and always returns **epoch seconds**, which is what match-v5
 * expects.
 */
export function parseTimestampSeconds(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const text = value.trim();
    if (text.length === 0) return undefined;

    if (/^\d+$/.test(text)) {
        const numeric = Number(text);
        return numeric > 1e11 ? Math.floor(numeric / 1000) : numeric;
    }

    const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
    if (Number.isNaN(parsed)) {
        throw new UsageError(`Could not read "${value}" as a date`);
    }
    return Math.floor(parsed / 1000);
}

export function requireRank(value: string | undefined, fallback: Rank = "PLATINUM_PLUS"): Rank {
    if (value === undefined) return fallback;
    const rank = parseRank(value);
    if (!rank) throw new UsageError(`Unknown rank "${value}"`);
    return rank;
}

export function requireRegion(value: string | undefined, fallback: Region = "ALL"): Region {
    if (value === undefined) return fallback;
    const region = parseRegion(value);
    if (!region) throw new UsageError(`Unknown region "${value}"`);
    return region;
}

/**
 * The Riot API key, from the environment only.
 *
 * Deliberately not a flag: command lines end up in shell history, `ps` output
 * and CI logs. Nothing else in the pipeline ever prints it — the logger
 * redacts it, and the Riot client keeps it out of URLs and errors.
 */
export function readApiKey(env: NodeJS.ProcessEnv = process.env): string {
    const key = (env.RIOT_API_KEY ?? "").trim();
    if (key.length === 0) {
        throw new UsageError(
            "RIOT_API_KEY is not set. Export it (or put it in .env) — it is never passed as a flag.",
        );
    }
    return key;
}

export type CliContext = {
    logger: PipelineLogger;
    /** Where human-readable command output goes. */
    print: (line: string) => void;
    env: NodeJS.ProcessEnv;
};

export function createContext(options: {
    level?: LogLevel;
    secrets?: readonly (string | undefined)[];
    print?: (line: string) => void;
    env?: NodeJS.ProcessEnv;
} = {}): CliContext {
    const logger = createLogger({
        level: options.level ?? "info",
        secrets: options.secrets,
    });
    return {
        logger,
        print: options.print ?? ((line) => console.log(logger.redact(line))),
        env: options.env ?? process.env,
    };
}

export function levelFromFlags(flags: {
    verbose?: boolean;
    quiet?: boolean;
}): LogLevel {
    if (flags.quiet) return "error";
    if (flags.verbose) return "debug";
    return "info";
}

export function formatDuration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
