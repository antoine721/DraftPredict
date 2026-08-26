import { describe, expect, it, vi } from "vitest";
import { LcuClient } from "./client.js";
import { connectToLcu } from "./connect.js";
import { PORT_ENV, TOKEN_ENV } from "./discovery/env.js";

describe("connectToLcu", () => {
    it("returns a client for a running League Client", async () => {
        const client = await connectToLcu({
            transport: vi.fn(),
            discovery: {
                platform: "linux",
                homedir: "/home/sona",
                env: { [PORT_ENV]: "52459", [TOKEN_ENV]: "token" },
            },
        });

        expect(client).toBeInstanceOf(LcuClient);
        expect(client?.baseUrl).toBe("https://127.0.0.1:52459");
        expect(client?.credentials.source).toBe("env");
        expect(client?.allowActions).toBe(false);
    });

    it("returns null when nothing is running", async () => {
        const client = await connectToLcu({
            transport: vi.fn(),
            discovery: {
                platform: "linux",
                homedir: "/home/sona",
                env: {},
                readFile: () => undefined,
                run: async () => ({ stdout: "", stderr: "" }),
            },
        });

        expect(client).toBeNull();
    });
});
