import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    credentialsFromLockfile,
    defaultFileReader,
    discoverFromLockfile,
    parseLockfile,
} from "./lockfile.js";
import { lockfileCandidatePaths, LOCKFILE_PATH_ENV } from "./paths.js";
import type { DiscoveryEnvironment } from "./paths.js";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));

const mockedReadFileSync = vi.mocked(readFileSync);

afterEach(() => {
    vi.resetAllMocks();
});

function environment(
    overrides: Partial<DiscoveryEnvironment> = {},
): DiscoveryEnvironment {
    return {
        platform: "win32",
        env: {},
        homedir: "/home/summoner",
        ...overrides,
    };
}

describe("parseLockfile", () => {
    it("parses a real lockfile line", () => {
        expect(
            parseLockfile("LeagueClient:24824:52459:sT1JOWLDkC9WJbLQKrs3rw:https"),
        ).toEqual({
            name: "LeagueClient",
            pid: 24824,
            port: 52459,
            password: "sT1JOWLDkC9WJbLQKrs3rw",
            protocol: "https",
        });
    });

    it("tolerates trailing newlines and CRLF", () => {
        expect(parseLockfile("LeagueClient:1:2:abc:https\r\n")?.port).toBe(2);
        expect(parseLockfile("\nLeagueClient:1:2:abc:https\n\n")?.password).toBe("abc");
    });

    it("keeps a password that contains colons", () => {
        expect(parseLockfile("LeagueClient:10:443:a:b:c:https")?.password).toBe(
            "a:b:c",
        );
    });

    it("accepts a plain http lockfile", () => {
        expect(parseLockfile("LeagueClient:1:2:tok:http")?.protocol).toBe("http");
    });

    it("keeps a zero pid rather than inventing one", () => {
        expect(parseLockfile("LeagueClient:notapid:2:tok:https")?.pid).toBe(0);
    });

    it.each([
        ["empty", ""],
        ["whitespace", "   \n"],
        ["too few fields", "LeagueClient:24824:52459:https"],
        ["no password", "LeagueClient:24824:52459::https"],
        ["port not a number", "LeagueClient:24824:port:token:https"],
        ["port out of range", "LeagueClient:24824:70000:token:https"],
        ["unknown protocol", "LeagueClient:24824:52459:token:ftp"],
    ])("rejects a %s lockfile", (_name, raw) => {
        expect(parseLockfile(raw)).toBeNull();
    });
});

describe("credentialsFromLockfile", () => {
    it("produces credentials tagged with their source and path", () => {
        const credentials = credentialsFromLockfile(
            "LeagueClient:24824:52459:token:https",
            "C:\\Riot Games\\League of Legends\\lockfile",
        );
        expect(credentials).toEqual({
            port: 52459,
            password: "token",
            protocol: "https",
            pid: 24824,
            source: "lockfile",
            lockfilePath: "C:\\Riot Games\\League of Legends\\lockfile",
        });
    });

    it("omits the pid when the lockfile did not carry one", () => {
        const credentials = credentialsFromLockfile("LeagueClient:0:52459:token:https");
        expect(credentials).not.toHaveProperty("pid");
        expect(credentials).not.toHaveProperty("lockfilePath");
    });

    it("returns null for a malformed lockfile", () => {
        expect(credentialsFromLockfile("nonsense")).toBeNull();
    });
});

describe("defaultFileReader", () => {
    it("reads a file as utf8", () => {
        mockedReadFileSync.mockReturnValue("LeagueClient:1:2:tok:https");
        expect(defaultFileReader("/tmp/lockfile")).toBe("LeagueClient:1:2:tok:https");
        expect(mockedReadFileSync).toHaveBeenCalledWith("/tmp/lockfile", "utf8");
    });

    it("swallows every filesystem error", () => {
        mockedReadFileSync.mockImplementation(() => {
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        });
        expect(defaultFileReader("/nope")).toBeUndefined();
    });
});

describe("discoverFromLockfile", () => {
    it("returns the first readable, well-formed lockfile", () => {
        const readFile = vi.fn((path: string) =>
            path === "/second" ? "LeagueClient:9:1234:tok:https" : undefined,
        );

        const credentials = discoverFromLockfile(environment(), {
            readFile,
            paths: ["/first", "/second", "/third"],
        });

        expect(credentials).toMatchObject({ port: 1234, source: "lockfile" });
        expect(readFile).toHaveBeenCalledTimes(2);
    });

    it("skips a half-written lockfile and keeps looking", () => {
        const readFile = vi.fn((path: string) =>
            path === "/broken" ? "LeagueClient:9:" : "LeagueClient:9:9999:tok:https",
        );

        const credentials = discoverFromLockfile(environment(), {
            readFile,
            paths: ["/broken", "/good"],
        });

        expect(credentials?.port).toBe(9999);
        expect(credentials?.lockfilePath).toBe("/good");
    });

    it("returns null when nothing is readable", () => {
        expect(
            discoverFromLockfile(environment(), {
                readFile: () => undefined,
                paths: ["/a", "/b"],
            }),
        ).toBeNull();
    });

    it("uses the real reader by default", () => {
        mockedReadFileSync.mockReturnValue("LeagueClient:1:2:tok:https");
        expect(
            discoverFromLockfile(environment(), { paths: ["/lockfile"] })?.port,
        ).toBe(2);
    });
});

describe("lockfileCandidatePaths", () => {
    it("probes the Windows install locations", () => {
        const paths = lockfileCandidatePaths(
            environment({
                platform: "win32",
                env: { LOCALAPPDATA: "C:\\Users\\Sona\\AppData\\Local" },
            }),
        );

        expect(paths[0]).toBe(
            "C:\\Users\\Sona\\AppData\\Local\\Riot Games\\League of Legends\\lockfile",
        );
        expect(paths).toContain("C:\\Riot Games\\League of Legends\\lockfile");
        expect(new Set(paths).size).toBe(paths.length);
    });

    it("probes the macOS application bundle", () => {
        const paths = lockfileCandidatePaths(
            environment({ platform: "darwin", homedir: "/Users/sona" }),
        );

        expect(paths[0]).toBe(
            "/Applications/League of Legends.app/Contents/LoL/lockfile",
        );
        expect(paths).toContain(
            "/Users/sona/Applications/League of Legends.app/Contents/LoL/lockfile",
        );
    });

    it("probes Wine prefixes on Linux, honouring WINEPREFIX", () => {
        const paths = lockfileCandidatePaths(
            environment({
                platform: "linux",
                homedir: "/home/sona",
                env: { WINEPREFIX: "/home/sona/prefixes/lol" },
            }),
        );

        expect(paths[0]).toBe(
            "/home/sona/prefixes/lol/drive_c/Riot Games/League of Legends/lockfile",
        );
        expect(paths).toContain(
            "/home/sona/Games/league-of-legends/drive_c/Riot Games/League of Legends/lockfile",
        );
    });

    it("puts an explicit override first on every platform", () => {
        for (const platform of ["win32", "darwin", "linux"] as const) {
            const paths = lockfileCandidatePaths(
                environment({
                    platform,
                    env: { [LOCKFILE_PATH_ENV]: "/custom/lockfile" },
                }),
            );
            expect(paths[0]).toBe("/custom/lockfile");
        }
    });
});
