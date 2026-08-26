import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { runBuild } from "./commands/build.js";
import { runCollect } from "./commands/collect.js";
import { runFixture } from "./commands/fixture.js";
import { runVerify } from "./commands/verify.js";
import type { CliContext } from "./commands/shared.js";
import {
    EXIT_FAILED,
    EXIT_OK,
    EXIT_USAGE,
    UsageError,
    createContext,
    levelFromFlags,
} from "./commands/shared.js";

export const USAGE = `
draftpredict-pipeline <command> [options]

  collect   Walk match histories and store raw matches as JSONL shards
  build     Aggregate shards into a DraftGap-v5 compatible dataset
  verify    Sanity-check a built dataset (non-zero exit on failure)
  fixture   Regenerate the offline fixture dataset

  Run "<command> --help" for the options of a command.

  Global flags: --verbose, --quiet, --help, --version

  The Riot API key is read from RIOT_API_KEY only — never from a flag, so it
  cannot end up in shell history, CI logs or a process list.
`.trim();

export const VERSION = "0.1.0";

export type MainOptions = {
    context?: CliContext;
    env?: NodeJS.ProcessEnv;
    /** Aborts a long-running command; the CLI wires this to SIGINT. */
    signal?: AbortSignal;
};

/**
 * The CLI entry point — a thin wrapper.
 *
 * Every command is a function over plain options in `src/collect`,
 * `src/aggregate`, `src/verify` and `src/fixture`, so the server can trigger a
 * rebuild in-process by calling `buildDatasetFromShards()` directly instead of
 * shelling out.
 */
export async function main(
    argv: readonly string[] = process.argv.slice(2),
    options: MainOptions = {},
): Promise<number> {
    const args = [...argv];
    const flags = {
        verbose: takeFlag(args, "--verbose"),
        quiet: takeFlag(args, "--quiet"),
    };
    const wantsHelp = takeFlag(args, "--help") || takeFlag(args, "-h");
    const wantsVersion = takeFlag(args, "--version");

    const context =
        options.context ??
        createContext({
            level: levelFromFlags(flags),
            secrets: [(options.env ?? process.env).RIOT_API_KEY],
            env: options.env,
        });

    const command = args.shift();

    if (wantsVersion && !command) {
        context.print(VERSION);
        return EXIT_OK;
    }
    if (!command || wantsHelp === true && !command) {
        context.print(USAGE);
        return command ? EXIT_OK : EXIT_USAGE;
    }
    if (wantsHelp) args.push("--help");

    try {
        switch (command) {
            case "collect":
                return await runCollect(args, context, { signal: options.signal });
            case "build":
                return await runBuild(args, context);
            case "verify":
                return await runVerify(args, context);
            case "fixture":
                return await runFixture(args, context);
            case "help":
                context.print(USAGE);
                return EXIT_OK;
            default:
                context.logger.error(`Unknown command "${command}"`);
                context.print(USAGE);
                return EXIT_USAGE;
        }
    } catch (error) {
        if (error instanceof UsageError) {
            context.logger.error(error.message);
            return EXIT_USAGE;
        }
        if (isArgParseError(error)) {
            context.logger.error(context.logger.redact(errorMessage(error)));
            return EXIT_USAGE;
        }
        context.logger.error(context.logger.redact(errorMessage(error)));
        if (error instanceof Error && error.stack) {
            context.logger.debug(context.logger.redact(error.stack));
        }
        return EXIT_FAILED;
    }
}

function takeFlag(args: string[], flag: string): boolean {
    const index = args.indexOf(flag);
    if (index === -1) return false;
    args.splice(index, 1);
    return true;
}

function isArgParseError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code ?? "";
    return code.startsWith("ERR_PARSE_ARGS");
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** True when this module is the process entry point. */
function isEntryPoint(): boolean {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return resolve(entry) === resolve(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    const controller = new AbortController();
    let interrupts = 0;
    const onSignal = (): void => {
        interrupts += 1;
        if (interrupts === 1) {
            console.error(
                "\ninterrupted — finishing the current step and saving state (press Ctrl-C again to force quit)",
            );
            controller.abort();
            return;
        }
        process.exit(130);
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    main(process.argv.slice(2), { signal: controller.signal })
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = EXIT_FAILED;
        });
}
