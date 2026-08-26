import { describe, expect, it, vi } from "vitest";
import { discoverCredentials } from "./discover.js";
import { PORT_ENV, PROTOCOL_ENV, TOKEN_ENV, credentialsFromEnv } from "./env.js";

const LOCKFILE = "LeagueClient:24824:52459:lockfile-token:https";
const PROCESS_LINE =
    "LeagueClientUx --remoting-auth-token=process-token --app-port=61234 --app-pid=7";

function options(overrides: Parameters<typeof discoverCredentials>[0] = {}) {
    return {
        platform: "linux" as NodeJS.Platform,
        env: {},
        homedir: "/home/sona",
        ...overrides,
    };
}

describe("credentialsFromEnv", () => {
    it("reads a port/token pair", () => {
        expect(
            credentialsFromEnv({ [PORT_ENV]: "1234", [TOKEN_ENV]: "secret" }),
        ).toEqual({
            port: 1234,
            password: "secret",
            protocol: "https",
            source: "env",
        });
    });

    it("allows an http override for a fake client", () => {
        expect(
            credentialsFromEnv({
                [PORT_ENV]: "1234",
                [TOKEN_ENV]: "secret",
                [PROTOCOL_ENV]: "HTTP",
            })?.protocol,
        ).toBe("http");
    });

    it.each([
        ["no token", { [PORT_ENV]: "1234" }],
        ["no port", { [TOKEN_ENV]: "secret" }],
        ["blank values", { [PORT_ENV]: " ", [TOKEN_ENV]: " " }],
        ["port not a number", { [PORT_ENV]: "not-a-port", [TOKEN_ENV]: "secret" }],
        ["port out of range", { [PORT_ENV]: "99999", [TOKEN_ENV]: "secret" }],
    ])("ignores %s", (_name, env) => {
        expect(credentialsFromEnv(env)).toBeNull();
    });
});

describe("discoverCredentials", () => {
    it("prefers the environment over everything else", async () => {
        const readFile = vi.fn(() => LOCKFILE);
        const run = vi.fn();

        const credentials = await discoverCredentials(
            options({
                env: { [PORT_ENV]: "1234", [TOKEN_ENV]: "secret" },
                readFile,
                run,
            }),
        );

        expect(credentials).toMatchObject({ port: 1234, source: "env" });
        expect(readFile).not.toHaveBeenCalled();
        expect(run).not.toHaveBeenCalled();
    });

    it("falls back to the lockfile", async () => {
        const run = vi.fn();
        const credentials = await discoverCredentials(
            options({ readFile: () => LOCKFILE, run }),
        );

        expect(credentials).toMatchObject({
            port: 52459,
            password: "lockfile-token",
            source: "lockfile",
        });
        expect(run).not.toHaveBeenCalled();
    });

    it("falls back to the process list when the lockfile is unreadable", async () => {
        const credentials = await discoverCredentials(
            options({
                readFile: () => undefined,
                run: async () => ({ stdout: PROCESS_LINE, stderr: "" }),
            }),
        );

        expect(credentials).toMatchObject({
            port: 61234,
            password: "process-token",
            pid: 7,
            source: "process",
        });
    });

    it("returns null when the client is simply not running", async () => {
        expect(
            await discoverCredentials(
                options({
                    readFile: () => undefined,
                    run: async () => ({ stdout: "", stderr: "" }),
                }),
            ),
        ).toBeNull();
    });

    it("never throws when a strategy blows up", async () => {
        const logger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const credentials = await discoverCredentials(
            options({
                readFile: () => {
                    throw new Error("EACCES");
                },
                run: async () => ({ stdout: PROCESS_LINE, stderr: "" }),
                logger,
            }),
        );

        expect(credentials?.source).toBe("process");
        expect(logger.debug).toHaveBeenCalled();
    });

    it("honours an explicit strategy list", async () => {
        const readFile = vi.fn(() => LOCKFILE);

        expect(
            await discoverCredentials(
                options({
                    readFile,
                    strategies: ["env", "process"],
                    run: async () => ({ stdout: "", stderr: "" }),
                }),
            ),
        ).toBeNull();
        expect(readFile).not.toHaveBeenCalled();
    });
});
