import { execFile } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryEnvironment } from "./paths.js";
import {
    COMMAND_TIMEOUT_MS,
    credentialsFromProcessList,
    defaultCommandRunner,
    discoverFromProcessList,
    parseCommandLine,
    processListCommands,
} from "./process.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

const mockedExecFile = vi.mocked(execFile);

afterEach(() => {
    vi.resetAllMocks();
});

/** `Get-CimInstance Win32_Process … | Select-Object -ExpandProperty CommandLine`. */
const WINDOWS_COMMAND_LINE =
    '"C:\\Riot Games\\League of Legends\\LeagueClientUx.exe" ' +
    '"--riotclient-auth-token=nEvErUsEtHiSoNe" "--riotclient-app-port=52458" ' +
    '"--remoting-auth-token=sT1JOWLDkC9WJbLQKrs3rw" "--app-port=52459" ' +
    '"--install-directory=C:\\Riot Games\\League of Legends" "--app-pid=24824" ' +
    '"--output-base-dir=C:\\Riot Games\\League of Legends" "--no-rads"';

/** `ps axww -o args=` on macOS. */
const UNIX_COMMAND_LINE =
    "/Applications/League of Legends.app/Contents/LoL/LeagueClientUx.app/Contents/" +
    "MacOS/LeagueClientUx --riotclient-auth-token=nEvErUsEtHiSoNe " +
    "--riotclient-app-port=52458 --remoting-auth-token=abcDEF-123_xy " +
    "--app-port=61234 --install-directory=/Applications/League of Legends.app " +
    "--app-pid=1234 --locale=en_GB";

function environment(
    overrides: Partial<DiscoveryEnvironment> = {},
): DiscoveryEnvironment {
    return { platform: "linux", env: {}, homedir: "/home/sona", ...overrides };
}

describe("parseCommandLine", () => {
    it("parses a quoted Windows command line", () => {
        expect(parseCommandLine(WINDOWS_COMMAND_LINE)).toEqual({
            port: 52459,
            password: "sT1JOWLDkC9WJbLQKrs3rw",
            pid: 24824,
        });
    });

    it("parses an unquoted Unix command line", () => {
        expect(parseCommandLine(UNIX_COMMAND_LINE)).toEqual({
            port: 61234,
            password: "abcDEF-123_xy",
            pid: 1234,
        });
    });

    it("never confuses the Riot Client's own flags for the LCU's", () => {
        const parsed = parseCommandLine(
            "--riotclient-app-port=11111 --riotclient-auth-token=WRONG " +
                "--app-port=22222 --remoting-auth-token=RIGHT",
        );
        expect(parsed.port).toBe(22222);
        expect(parsed.password).toBe("RIGHT");
    });

    it("ignores an out-of-range port", () => {
        expect(
            parseCommandLine("--app-port=99999 --remoting-auth-token=t").port,
        ).toBeUndefined();
    });

    it("returns an empty result for an unrelated process", () => {
        expect(parseCommandLine("/usr/bin/node server.js")).toEqual({});
    });
});

describe("credentialsFromProcessList", () => {
    it("finds the client among a full process listing", () => {
        const listing = [
            "/sbin/launchd",
            "/usr/libexec/UserEventAgent (Aqua)",
            "/Applications/Riot Client.app/Contents/MacOS/RiotClientServices " +
                "--riotclient-app-port=52458 --riotclient-auth-token=other",
            UNIX_COMMAND_LINE,
            "ps axww -o args=",
        ].join("\n");

        expect(credentialsFromProcessList(listing)).toEqual({
            port: 61234,
            password: "abcDEF-123_xy",
            pid: 1234,
            protocol: "https",
            source: "process",
        });
    });

    it("handles CRLF output from wmic", () => {
        const listing = `CommandLine\r\n\r\n${WINDOWS_COMMAND_LINE}\r\n\r\n`;
        expect(credentialsFromProcessList(listing)?.port).toBe(52459);
    });

    it("returns null when the client is not running", () => {
        expect(credentialsFromProcessList("No Instance(s) Available.\n")).toBeNull();
    });

    it("ignores a line that carries only half the credentials", () => {
        expect(credentialsFromProcessList("LeagueClientUx --app-port=1234")).toBeNull();
    });
});

describe("processListCommands", () => {
    it("uses CIM then wmic on Windows", () => {
        const commands = processListCommands("win32");
        expect(commands[0]?.command).toBe("powershell.exe");
        expect(commands[0]?.args.join(" ")).toContain("LeagueClientUx.exe");
        expect(commands[1]?.command).toBe("wmic");
    });

    it("uses ps everywhere else", () => {
        for (const platform of ["darwin", "linux"] as const) {
            expect(processListCommands(platform)[0]).toEqual({
                command: "ps",
                args: ["axww", "-o", "args="],
            });
        }
    });
});

describe("discoverFromProcessList", () => {
    it("tries the next command when the first one fails", async () => {
        const run = vi
            .fn()
            .mockRejectedValueOnce(new Error("spawn wmic ENOENT"))
            .mockResolvedValueOnce({ stdout: UNIX_COMMAND_LINE, stderr: "" });

        const credentials = await discoverFromProcessList(environment(), {
            run,
            commands: [
                { command: "wmic", args: [] },
                { command: "ps", args: [] },
            ],
        });

        expect(credentials?.port).toBe(61234);
        expect(run).toHaveBeenCalledTimes(2);
    });

    it("returns null when no command finds a client", async () => {
        const run = vi.fn().mockResolvedValue({ stdout: "init\nbash\n", stderr: "" });
        expect(await discoverFromProcessList(environment(), { run })).toBeNull();
    });

    it("never throws when spawning is impossible", async () => {
        const run = vi.fn().mockRejectedValue(new Error("EPERM"));
        expect(await discoverFromProcessList(environment(), { run })).toBeNull();
    });
});

describe("defaultCommandRunner", () => {
    it("runs the command without a shell and with a timeout", async () => {
        mockedExecFile.mockImplementation(((
            _command: string,
            _args: string[],
            _options: unknown,
            callback: (error: unknown, stdout: string, stderr: string) => void,
        ) => {
            callback(null, UNIX_COMMAND_LINE, "");
            return undefined;
        }) as unknown as typeof execFile);

        const result = await defaultCommandRunner("ps", ["axww"]);

        expect(result.stdout).toBe(UNIX_COMMAND_LINE);
        expect(mockedExecFile).toHaveBeenCalledWith(
            "ps",
            ["axww"],
            expect.objectContaining({ timeout: COMMAND_TIMEOUT_MS, windowsHide: true }),
            expect.any(Function),
        );
    });

    it("keeps stdout from a command that exited non-zero", async () => {
        mockedExecFile.mockImplementation(((
            _command: string,
            _args: string[],
            _options: unknown,
            callback: (error: unknown, stdout: string, stderr: string) => void,
        ) => {
            callback(new Error("exit 1"), WINDOWS_COMMAND_LINE, "some warning");
            return undefined;
        }) as unknown as typeof execFile);

        await expect(defaultCommandRunner("wmic", [])).resolves.toMatchObject({
            stdout: WINDOWS_COMMAND_LINE,
        });
    });

    it("rejects when the command produced nothing at all", async () => {
        mockedExecFile.mockImplementation(((
            _command: string,
            _args: string[],
            _options: unknown,
            callback: (error: unknown, stdout: string, stderr: string) => void,
        ) => {
            callback(new Error("spawn ENOENT"), "", "");
            return undefined;
        }) as unknown as typeof execFile);

        await expect(defaultCommandRunner("ps", [])).rejects.toThrow("spawn ENOENT");
    });
});
