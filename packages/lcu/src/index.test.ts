import { describe, expect, it } from "vitest";
import * as lcu from "./index.js";

/**
 * The public surface is a cross-package contract: apps/server and
 * apps/desktop import these names. Losing one is a breaking change, so the
 * list is asserted rather than assumed.
 */
const PUBLIC_API = [
    // discovery
    "discoverCredentials",
    "credentialsFromEnv",
    "credentialsFromLockfile",
    "credentialsFromProcessList",
    "parseLockfile",
    "parseCommandLine",
    "discoverFromLockfile",
    "discoverFromProcessList",
    "lockfileCandidatePaths",
    "processListCommands",
    // client
    "LcuClient",
    "connectToLcu",
    "createLcuAgent",
    "createNodeTransport",
    "isLoopbackHost",
    "assertLoopbackHost",
    // champ select
    "mapChampSelectSession",
    "assignRoles",
    "parseAssignedPosition",
    "championKeyOf",
    "emptyChampSelectState",
    // watcher
    "LcuWatcher",
    "createLcuSocket",
    "parseLcuEvent",
    // errors and helpers
    "LcuError",
    "LcuHttpError",
    "LcuConnectionError",
    "LcuTimeoutError",
    "LcuParseError",
    "LcuActionsDisabledError",
    "isDisconnectError",
    "basicAuthHeader",
    "lcuBaseUrl",
    "lcuWebSocketUrl",
    "silentLogger",
    "createConsoleLogger",
] as const;

describe("@draftpredict/lcu public API", () => {
    it.each(PUBLIC_API)("exports %s", (name) => {
        expect(lcu[name]).toBeDefined();
    });

    it("does not leak test-only helpers", () => {
        expect(lcu).not.toHaveProperty("makeRoleDataset");
        expect(lcu).not.toHaveProperty("rankedDraftSession");
    });

    it("builds a loopback base url and auth header", () => {
        const credentials = {
            port: 52459,
            password: "token",
            protocol: "https",
            source: "lockfile",
        } as const;

        expect(lcu.lcuBaseUrl(credentials)).toBe("https://127.0.0.1:52459");
        expect(lcu.lcuWebSocketUrl(credentials)).toBe("wss://127.0.0.1:52459");
        expect(lcu.basicAuthHeader("token")).toBe(
            `Basic ${Buffer.from("riot:token").toString("base64")}`,
        );
    });

    it("knows the gameflow phases", () => {
        expect(lcu.isKnownGameflowPhase("ChampSelect")).toBe(true);
        expect(lcu.isKnownGameflowPhase("Nonsense")).toBe(false);
        expect(lcu.GAMEFLOW_PHASES).toContain("InProgress");
    });
});
