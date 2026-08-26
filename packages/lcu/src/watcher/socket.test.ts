import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { LcuCredentials } from "../types.js";
import {
    LCU_WS_SUBPROTOCOL,
    SUBSCRIBE_FRAME,
    WAMP_EVENT,
    createLcuSocket,
    parseLcuEvent,
} from "./socket.js";

// Never open a real socket: `ws` is replaced by a recorder.
const listeners = new Map<string, (...args: unknown[]) => void>();
const constructed: {
    url: string;
    protocol: string;
    options: Record<string, unknown>;
}[] = [];
const sent: string[] = [];
const closed = vi.fn();

vi.mock("ws", () => {
    class FakeWebSocket {
        constructor(url: string, protocol: string, options: Record<string, unknown>) {
            constructed.push({ url, protocol, options });
        }
        on(event: string, handler: (...args: unknown[]) => void) {
            listeners.set(event, handler);
            return this;
        }
        send(data: string) {
            sent.push(data);
        }
        close() {
            closed();
        }
    }
    return { default: FakeWebSocket };
});

const CREDENTIALS: LcuCredentials = {
    port: 52459,
    password: "token",
    protocol: "https",
    source: "lockfile",
};

afterEach(() => {
    listeners.clear();
    constructed.length = 0;
    sent.length = 0;
    closed.mockClear();
});

describe("parseLcuEvent", () => {
    it("decodes a champ-select event", () => {
        const frame = JSON.stringify([
            WAMP_EVENT,
            "OnJsonApiEvent",
            {
                uri: "/lol-champ-select/v1/session",
                eventType: "Update",
                data: { counter: 3 },
            },
        ]);

        expect(parseLcuEvent(frame)).toEqual({
            uri: "/lol-champ-select/v1/session",
            eventType: "Update",
            data: { counter: 3 },
        });
    });

    it("decodes a gameflow phase event", () => {
        const frame = JSON.stringify([
            WAMP_EVENT,
            "OnJsonApiEvent",
            {
                uri: "/lol-gameflow/v1/gameflow-phase",
                eventType: "Update",
                data: "ChampSelect",
            },
        ]);
        expect(parseLcuEvent(frame)?.data).toBe("ChampSelect");
    });

    it("defaults a missing eventType to Update", () => {
        const frame = JSON.stringify([WAMP_EVENT, "OnJsonApiEvent", { uri: "/x" }]);
        expect(parseLcuEvent(frame)?.eventType).toBe("Update");
    });

    it.each([
        ["an empty frame", ""],
        ["a heartbeat", "  "],
        ["invalid JSON", "{not json"],
        ["a non-array frame", '{"uri":"/x"}'],
        ["a subscribe acknowledgement", JSON.stringify([5, "OnJsonApiEvent"])],
        ["an event without a uri", JSON.stringify([WAMP_EVENT, "OnJsonApiEvent", {}])],
        ["a null payload", JSON.stringify([WAMP_EVENT, "OnJsonApiEvent", null])],
    ])("returns null for %s", (_name, frame) => {
        expect(parseLcuEvent(frame)).toBeNull();
    });
});

describe("SUBSCRIBE_FRAME", () => {
    it("is the WAMP subscribe for every JSON API event", () => {
        expect(SUBSCRIBE_FRAME).toBe('[5,"OnJsonApiEvent"]');
    });
});

describe("createLcuSocket", () => {
    it("opens a loopback wss connection with basic auth and the wamp subprotocol", () => {
        createLcuSocket(CREDENTIALS, {});

        expect(constructed[0]?.url).toBe("wss://127.0.0.1:52459");
        expect(constructed[0]?.protocol).toBe(LCU_WS_SUBPROTOCOL);
        expect(constructed[0]?.options).toMatchObject({
            headers: {
                Authorization: `Basic ${Buffer.from("riot:token").toString("base64")}`,
            },
            // Same self-signed certificate as the REST API, same loopback-only
            // containment.
            rejectUnauthorized: false,
        });
        expect(WebSocket).toBeDefined();
    });

    it("forwards open, message, close and error to the handlers", () => {
        const handlers = {
            onOpen: vi.fn(),
            onMessage: vi.fn(),
            onClose: vi.fn(),
            onError: vi.fn(),
        };
        const socket = createLcuSocket(CREDENTIALS, handlers);

        listeners.get("open")?.();
        listeners.get("message")?.(Buffer.from("frame"));
        listeners.get("close")?.(1006, Buffer.from("abnormal"));
        listeners.get("error")?.(new Error("boom"));

        expect(handlers.onOpen).toHaveBeenCalledOnce();
        expect(handlers.onMessage).toHaveBeenCalledWith("frame");
        expect(handlers.onClose).toHaveBeenCalledWith({
            code: 1006,
            reason: "abnormal",
        });
        expect(handlers.onError).toHaveBeenCalledWith(expect.any(Error));

        socket.send("hello");
        socket.close();
        expect(sent).toEqual(["hello"]);
        expect(closed).toHaveBeenCalledOnce();
    });
});
