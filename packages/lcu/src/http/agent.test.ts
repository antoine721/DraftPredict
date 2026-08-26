import { describe, expect, it } from "vitest";
import { LcuError } from "../errors.js";
import { assertLoopbackHost, createLcuAgent, isLoopbackHost } from "./agent.js";

describe("isLoopbackHost", () => {
    it.each(["127.0.0.1", "localhost", "LOCALHOST", "::1", "[::1]", "127.9.9.9"])(
        "accepts %s",
        (host) => {
            expect(isLoopbackHost(host)).toBe(true);
        },
    );

    it.each([
        "192.168.1.10",
        "example.com",
        "0.0.0.0",
        "10.0.0.1",
        "127.0.0.1.evil.com",
    ])("rejects %s", (host) => {
        expect(isLoopbackHost(host)).toBe(false);
    });
});

describe("assertLoopbackHost", () => {
    it("passes for loopback", () => {
        expect(() => assertLoopbackHost("127.0.0.1")).not.toThrow();
    });

    it("refuses to let the self-signed exception escape the machine", () => {
        expect(() => assertLoopbackHost("api.riotgames.com")).toThrow(LcuError);
        expect(() => assertLoopbackHost("api.riotgames.com")).toThrow(/loopback/);
    });
});

describe("createLcuAgent", () => {
    it("accepts the LCU's self-signed certificate, and nothing else", () => {
        const agent = createLcuAgent();
        try {
            // The exception is scoped to this agent instance: it is passed only
            // to requests aimed at 127.0.0.1, and the global agent is untouched.
            expect(agent.options.rejectUnauthorized).toBe(false);
            expect(agent.options.keepAlive).toBe(true);
            expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
        } finally {
            agent.destroy();
        }
    });

    it("takes socket tuning options", () => {
        const agent = createLcuAgent({ keepAlive: false, maxSockets: 2 });
        try {
            expect(agent.options.keepAlive).toBe(false);
            expect(agent.maxSockets).toBe(2);
        } finally {
            agent.destroy();
        }
    });
});
