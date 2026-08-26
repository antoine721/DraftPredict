import { homedir as osHomedir } from "node:os";
import { silentLogger, type Logger } from "../logger.js";
import type { LcuCredentials } from "../types.js";
import { credentialsFromEnv } from "./env.js";
import { discoverFromLockfile, type FileReader } from "./lockfile.js";
import { discoverFromProcessList, type CommandRunner } from "./process.js";
import type { DiscoveryEnvironment } from "./paths.js";

/** Discovery strategies, in the order they are tried by default. */
export const DISCOVERY_STRATEGIES = ["env", "lockfile", "process"] as const;

export type DiscoveryStrategy = (typeof DISCOVERY_STRATEGIES)[number];

export type DiscoverCredentialsOptions = {
    /** Defaults to `process.platform`. */
    platform?: NodeJS.Platform;
    /** Defaults to `process.env`, read at call time — never at import time. */
    env?: Record<string, string | undefined>;
    /** Defaults to `os.homedir()`. */
    homedir?: string;
    /** Which strategies to run, in order. Defaults to all three. */
    strategies?: readonly DiscoveryStrategy[];
    /** Overrides the lockfile paths that are probed. */
    lockfilePaths?: readonly string[];
    /** Injected file reader; defaults to `readFileSync` with errors swallowed. */
    readFile?: FileReader;
    /** Injected command runner; defaults to `execFile`. */
    run?: CommandRunner;
    /** Overrides the process-listing commands. */
    commands?: { command: string; args: string[] }[];
    logger?: Logger;
};

/**
 * Finds a running League Client.
 *
 * Tried in order:
 *
 * 1. **env** — `DRAFTPREDICT_LCU_PORT` + `DRAFTPREDICT_LCU_TOKEN`, so a test or
 *    a power user can point the app at any client;
 * 2. **lockfile** — the file the client writes into its install directory;
 * 3. **process list** — the client's own command line, which still works when
 *    the lockfile is unreadable.
 *
 * Returns `null` when the client is simply not running — that is the normal
 * case, not an error, and this function never throws for it.
 */
export async function discoverCredentials(
    options: DiscoverCredentialsOptions = {},
): Promise<LcuCredentials | null> {
    const logger = options.logger ?? silentLogger;
    const environment: DiscoveryEnvironment = {
        platform: options.platform ?? process.platform,
        env: options.env ?? process.env,
        homedir: options.homedir ?? safeHomedir(),
    };

    for (const strategy of options.strategies ?? DISCOVERY_STRATEGIES) {
        try {
            const credentials = await runStrategy(strategy, environment, options);
            if (credentials) {
                logger.debug("discovered LCU credentials", {
                    source: credentials.source,
                    port: credentials.port,
                });
                return credentials;
            }
        } catch (error) {
            // A strategy blowing up must not hide the next one.
            logger.debug(`LCU discovery strategy "${strategy}" failed`, error);
        }
    }

    return null;
}

async function runStrategy(
    strategy: DiscoveryStrategy,
    environment: DiscoveryEnvironment,
    options: DiscoverCredentialsOptions,
): Promise<LcuCredentials | null> {
    if (strategy === "env") {
        return credentialsFromEnv(environment.env);
    }
    if (strategy === "lockfile") {
        return discoverFromLockfile(environment, {
            ...(options.readFile ? { readFile: options.readFile } : {}),
            ...(options.lockfilePaths ? { paths: options.lockfilePaths } : {}),
        });
    }
    return discoverFromProcessList(environment, {
        ...(options.run ? { run: options.run } : {}),
        ...(options.commands ? { commands: options.commands } : {}),
    });
}

function safeHomedir(): string {
    try {
        return osHomedir();
    } catch {
        return "";
    }
}
