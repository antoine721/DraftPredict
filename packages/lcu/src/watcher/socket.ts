import WebSocket from "ws";
import { basicAuthHeader, lcuWebSocketUrl, type LcuCredentials } from "../types.js";

/**
 * The LCU event socket.
 *
 * The client speaks a cut-down WAMP over WebSocket with the `wamp`
 * subprotocol. Two message ids matter:
 *
 * ```
 * -> [5, "OnJsonApiEvent"]                                  subscribe to everything
 * <- [8, "OnJsonApiEvent", { uri, eventType, data }]         one event
 * ```
 *
 * `uri` is the REST path that changed (`/lol-champ-select/v1/session`),
 * `eventType` is `Create` | `Update` | `Delete`, and `data` is the same JSON
 * the REST endpoint would return.
 */

/** WAMP message id for SUBSCRIBE. */
export const WAMP_SUBSCRIBE = 5;
/** WAMP message id for EVENT. */
export const WAMP_EVENT = 8;

/** The one topic that carries every JSON API change. */
export const LCU_EVENT_TOPIC = "OnJsonApiEvent";

/** Subprotocol the LCU requires. */
export const LCU_WS_SUBPROTOCOL = "wamp";

/** The subscribe frame, ready to send. */
export const SUBSCRIBE_FRAME = JSON.stringify([WAMP_SUBSCRIBE, LCU_EVENT_TOPIC]);

export type LcuEventType = "Create" | "Update" | "Delete" | (string & {});

/** One decoded LCU event. */
export type LcuEvent = {
    /** REST path that changed, e.g. `/lol-champ-select/v1/session`. */
    uri: string;
    eventType: LcuEventType;
    data: unknown;
};

/**
 * Decodes one socket frame.
 *
 * Returns `null` for anything that is not an `OnJsonApiEvent` payload —
 * heartbeats, subscribe acknowledgements and malformed frames are all normal
 * and must not take the socket down.
 */
export function parseLcuEvent(raw: string): LcuEvent | null {
    if (raw.trim().length === 0) return null;

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (!Array.isArray(parsed) || parsed.length < 3) return null;
    if (parsed[0] !== WAMP_EVENT) return null;

    const payload = parsed[2];
    if (typeof payload !== "object" || payload === null) return null;

    const { uri, eventType, data } = payload as {
        uri?: unknown;
        eventType?: unknown;
        data?: unknown;
    };
    if (typeof uri !== "string" || uri.length === 0) return null;

    return {
        uri,
        eventType: typeof eventType === "string" ? eventType : "Update",
        data,
    };
}

export type LcuSocketHandlers = {
    onOpen?: () => void;
    onMessage?: (data: string) => void;
    onClose?: (info: { code: number; reason: string }) => void;
    onError?: (error: unknown) => void;
};

/** The socket surface the watcher uses; trivial to fake in tests. */
export type LcuSocket = {
    send(data: string): void;
    close(): void;
};

export type LcuSocketFactory = (
    credentials: LcuCredentials,
    handlers: LcuSocketHandlers,
) => LcuSocket;

/**
 * Opens the real LCU WebSocket.
 *
 * `rejectUnauthorized: false` is needed for the same self-signed certificate
 * the REST client faces, and is just as contained: these options apply to this
 * one loopback connection only (see `http/agent.ts` for the full reasoning).
 */
export const createLcuSocket: LcuSocketFactory = (credentials, handlers) => {
    const socket = new WebSocket(lcuWebSocketUrl(credentials), LCU_WS_SUBPROTOCOL, {
        headers: { Authorization: basicAuthHeader(credentials.password) },
        rejectUnauthorized: false,
        perMessageDeflate: false,
        handshakeTimeout: 10_000,
    });

    socket.on("open", () => handlers.onOpen?.());
    socket.on("message", (data: WebSocket.RawData) =>
        handlers.onMessage?.(data.toString()),
    );
    socket.on("close", (code: number, reason: Buffer) =>
        handlers.onClose?.({ code, reason: reason.toString() }),
    );
    socket.on("error", (error: unknown) => handlers.onError?.(error));

    return {
        send: (data: string) => socket.send(data),
        close: () => {
            // `terminate()` after `close()` would race the graceful handshake;
            // the watcher's own timers handle a socket that never closes.
            socket.close();
        },
    };
};
