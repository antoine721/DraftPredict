import { execFile } from "node:child_process";
import type { LcuCredentials } from "../types.js";
import type { DiscoveryEnvironment } from "./paths.js";

/**
 * Credential discovery from the client's own command line.
 *
 * `LeagueClientUx` is launched with its remoting port and token as flags:
 *
 * ```
 * "C:\Riot Games\League of Legends\LeagueClientUx.exe" "--remoting-auth-token=abc" "--app-port=52459" …
 * ```
 *
 * This is the fallback for the (common) case where the lockfile is present but
 * unreadable: a client installed under another user account, a Wine prefix we
 * did not guess, or Windows holding the file open mid-write.
 *
 * Note the near-miss flags: `--riotclient-auth-token` / `--riotclient-app-port`
 * belong to the *Riot Client*, a different process with a different API. The
 * patterns below match only the `--app-port` / `--remoting-auth-token` pair.
 */

/** Process name of the League Client UX process on Windows. */
export const LCU_PROCESS_NAME = "LeagueClientUx.exe";

const PORT_PATTERN = /--app-port=["']?(\d{1,5})["']?/;
const TOKEN_PATTERN = /--remoting-auth-token=["']?([^"'\s]+)["']?/;
const PID_PATTERN = /--app-pid=["']?(\d{1,10})["']?/;

/** What one command line told us. All fields optional — callers validate. */
export type ParsedCommandLine = {
    port?: number;
    password?: string;
    pid?: number;
};

/** Pulls `--app-port` / `--remoting-auth-token` / `--app-pid` out of one line. */
export function parseCommandLine(commandLine: string): ParsedCommandLine {
    const parsed: ParsedCommandLine = {};

    const port = PORT_PATTERN.exec(commandLine)?.[1];
    if (port) {
        const value = Number.parseInt(port, 10);
        if (Number.isInteger(value) && value > 0 && value <= 65_535)
            parsed.port = value;
    }

    const token = TOKEN_PATTERN.exec(commandLine)?.[1];
    if (token) parsed.password = token;

    const pid = PID_PATTERN.exec(commandLine)?.[1];
    if (pid) {
        const value = Number.parseInt(pid, 10);
        if (Number.isInteger(value) && value > 0) parsed.pid = value;
    }

    return parsed;
}

/**
 * Scans a whole process listing (`ps axww -o args`, `wmic … GET CommandLine`,
 * `Get-CimInstance`) and returns the first line that carries both a port and a
 * token.
 */
export function credentialsFromProcessList(output: string): LcuCredentials | null {
    for (const line of output.split(/\r?\n/)) {
        if (!line.includes("--app-port=") || !line.includes("--remoting-auth-token=")) {
            continue;
        }
        const parsed = parseCommandLine(line);
        if (parsed.port === undefined || !parsed.password) continue;
        return {
            port: parsed.port,
            password: parsed.password,
            // The client always serves the remoting API over TLS; the command
            // line carries no protocol flag to tell us otherwise.
            protocol: "https",
            ...(parsed.pid !== undefined ? { pid: parsed.pid } : {}),
            source: "process",
        };
    }
    return null;
}

/** Result of running one discovery command. */
export type CommandResult = { stdout: string; stderr: string };

/** Runs a command and returns its output. Injected so tests never spawn. */
export type CommandRunner = (
    command: string,
    args: readonly string[],
) => Promise<CommandResult>;

/** How long a discovery command may take before we give up on it. */
export const COMMAND_TIMEOUT_MS = 5_000;

/** Default runner: `execFile`, with a timeout and no shell. */
export const defaultCommandRunner: CommandRunner = (command, args) =>
    new Promise((resolve, reject) => {
        execFile(
            command,
            [...args],
            {
                encoding: "utf8",
                timeout: COMMAND_TIMEOUT_MS,
                windowsHide: true,
                maxBuffer: 4 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                // A non-zero exit still carries usable stdout (`wmic` prints
                // "No Instance(s) Available." and exits 1), so resolve when we
                // got anything at all and only reject when we got nothing.
                const out = typeof stdout === "string" ? stdout : "";
                const err = typeof stderr === "string" ? stderr : "";
                if (error && out.length === 0) {
                    reject(error);
                    return;
                }
                resolve({ stdout: out, stderr: err });
            },
        );
    });

/** The commands to try, in order, for a platform. */
export function processListCommands(
    platform: NodeJS.Platform,
): { command: string; args: string[] }[] {
    if (platform === "win32") {
        return [
            {
                command: "powershell.exe",
                args: [
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    `Get-CimInstance Win32_Process -Filter "Name = '${LCU_PROCESS_NAME}'" | ` +
                        "Select-Object -ExpandProperty CommandLine",
                ],
            },
            {
                command: "wmic",
                args: [
                    "PROCESS",
                    "WHERE",
                    `name='${LCU_PROCESS_NAME}'`,
                    "GET",
                    "CommandLine",
                ],
            },
        ];
    }

    // macOS and Linux: `ps axww` prints full, unwrapped command lines. The
    // `-o args=` form omits the header, which keeps parsing trivial.
    return [
        { command: "ps", args: ["axww", "-o", "args="] },
        { command: "ps", args: ["-A", "-o", "args="] },
    ];
}

export type ProcessDiscoveryOptions = {
    run?: CommandRunner;
    /** Overrides the command list entirely. */
    commands?: { command: string; args: string[] }[];
};

/**
 * Asks the OS for the client's command line.
 *
 * Never throws: a missing `ps`, a locked-down PowerShell or a machine with no
 * client running all end up as `null`.
 */
export async function discoverFromProcessList(
    environment: DiscoveryEnvironment,
    options: ProcessDiscoveryOptions = {},
): Promise<LcuCredentials | null> {
    const run = options.run ?? defaultCommandRunner;
    const commands = options.commands ?? processListCommands(environment.platform);

    for (const { command, args } of commands) {
        let result: CommandResult;
        try {
            result = await run(command, args);
        } catch {
            continue;
        }
        const credentials = credentialsFromProcessList(result.stdout);
        if (credentials) return credentials;
    }
    return null;
}
