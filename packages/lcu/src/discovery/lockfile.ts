import { readFileSync } from "node:fs";
import type { LcuCredentials } from "../types.js";
import { lockfileCandidatePaths, type DiscoveryEnvironment } from "./paths.js";

/**
 * The League Client lockfile.
 *
 * One line, five colon-separated fields:
 *
 * ```
 * LeagueClient:24824:52459:sT1JOWLDkC9WJbLQKrs3rw:https
 * name        :pid  :port :password              :protocol
 * ```
 *
 * The file exists only while the client runs, and every field changes between
 * runs. Riot's tokens are URL-safe base64-ish, but nothing documents that, so
 * the parser tolerates a password containing colons by anchoring on the first
 * three fields and the last one.
 */
export type LockfileContents = {
    /** Process name Riot wrote, e.g. `LeagueClient`. */
    name: string;
    pid: number;
    port: number;
    password: string;
    protocol: "https" | "http";
};

/** Parses a raw lockfile. Returns `null` when it is empty or malformed. */
export function parseLockfile(raw: string): LockfileContents | null {
    // The client writes a single line without a trailing newline, but a file
    // copied around by a user may have picked up CRLF or a trailing blank line.
    const line = raw.split(/\r?\n/).find((candidate) => candidate.trim().length > 0);
    if (!line) return null;

    const parts = line.trim().split(":");
    if (parts.length < 5) return null;

    const [name, rawPid, rawPort] = parts as [string, string, string, ...string[]];
    const rawProtocol = parts[parts.length - 1]!;
    const password = parts.slice(3, parts.length - 1).join(":");

    const pid = Number.parseInt(rawPid, 10);
    const port = Number.parseInt(rawPort, 10);
    const protocol = rawProtocol.trim().toLowerCase();

    if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;
    if (password.length === 0) return null;
    if (protocol !== "https" && protocol !== "http") return null;

    return {
        name,
        pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
        port,
        password,
        protocol,
    };
}

/** Parses a lockfile straight into {@link LcuCredentials}. */
export function credentialsFromLockfile(
    raw: string,
    lockfilePath?: string,
): LcuCredentials | null {
    const contents = parseLockfile(raw);
    if (!contents) return null;

    return {
        port: contents.port,
        password: contents.password,
        protocol: contents.protocol,
        ...(contents.pid > 0 ? { pid: contents.pid } : {}),
        source: "lockfile",
        ...(lockfilePath ? { lockfilePath } : {}),
    };
}

/** Reads a text file, or returns `undefined` when it cannot be read. */
export type FileReader = (path: string) => string | undefined;

/** Default reader: `readFileSync`, with every failure treated as "not there". */
export const defaultFileReader: FileReader = (path) => {
    try {
        return readFileSync(path, "utf8");
    } catch {
        // ENOENT (client not running), EACCES (another user's install), EBUSY
        // (Windows, mid-write) — none of them are worth surfacing.
        return undefined;
    }
};

export type LockfileDiscoveryOptions = {
    readFile?: FileReader;
    /** Overrides the candidate list entirely. */
    paths?: readonly string[];
};

/**
 * Walks the candidate lockfile paths and returns the first usable one.
 *
 * Never throws: an unreadable or half-written lockfile is skipped.
 */
export function discoverFromLockfile(
    environment: DiscoveryEnvironment,
    options: LockfileDiscoveryOptions = {},
): LcuCredentials | null {
    const readFile = options.readFile ?? defaultFileReader;
    const paths = options.paths ?? lockfileCandidatePaths(environment);

    for (const path of paths) {
        const raw = readFile(path);
        if (raw === undefined) continue;
        const credentials = credentialsFromLockfile(raw, path);
        if (credentials) return credentials;
    }
    return null;
}
