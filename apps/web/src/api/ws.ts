import { backoffDelay } from "../lib/helpers";
import type {
    ClientMessage,
    DatasetPairMeta,
    LcuStatus,
    PublicConfig,
    ServerMessage,
    ServerMessageOf,
    ServerMessageType,
    WsConnectionState,
    WsTopic,
} from "./types";

/**
 * The live socket.
 *
 * One `/ws` connection carries champion select, LCU status, config and dataset
 * updates. Two details drive this implementation:
 *
 * 1. The server sends `hello` and replays the last `lcu:status`,
 *    `champselect:update`, `config:update` and `dataset:update` *the instant*
 *    the socket is accepted. `onmessage` is therefore assigned synchronously,
 *    in the same tick as the `new WebSocket(...)`, or those frames are lost.
 * 2. The League Client comes and goes, laptops sleep, the dev server restarts.
 *    A dropped socket reconnects on its own with exponential backoff and full
 *    jitter, and the replay on reconnect repaints the UI — so a reconnect is
 *    invisible rather than a blank screen.
 *
 * This class is framework-free; `useLiveSocket()` wraps it for React.
 */

type Handler<T extends ServerMessageType> = (message: ServerMessageOf<T>) => void;

export type LiveSocketOptions = {
    /** Defaults to `ws(s)://<host>/ws`. */
    url?: string;
    /** Reconnect after an unexpected close. Default `true`. */
    reconnect?: boolean;
    baseDelayMs?: number;
    maxDelayMs?: number;
    /** App-level ping interval. Default 25 s. */
    pingIntervalMs?: number;
    /** Force a reconnect after this long without a single frame. Default 70 s. */
    idleTimeoutMs?: number;
    /** Injectable for tests. */
    factory?: (url: string) => WebSocket;
};

/** The last state of everything the server replays, kept for late subscribers. */
export type LiveSnapshot = {
    lcu: LcuStatus | null;
    champSelect: ServerMessageOf<"champselect:update"> | null;
    config: PublicConfig | null;
    dataset: DatasetPairMeta | null;
    /** `null` until the first `hello`. */
    clientId: string | null;
    staticDataVersion: string | null;
};

export function defaultWsUrl(): string {
    if (typeof window === "undefined") return "ws://localhost:4700/ws";
    const base = import.meta.env?.VITE_API_BASE;
    if (base) {
        return `${base.replace(/^http/, "ws").replace(/\/$/, "")}/ws`;
    }
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/ws`;
}

const REPLAYED: ServerMessageType[] = [
    "lcu:status",
    "champselect:update",
    "config:update",
    "dataset:update",
];

export class LiveSocket {
    private readonly options: Required<Omit<LiveSocketOptions, "url" | "factory">> & {
        url: string;
        factory: (url: string) => WebSocket;
    };

    private socket: WebSocket | null = null;
    private attempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private lastFrameAt = 0;
    private disposed = false;
    private stopped = false;
    private state: WsConnectionState = "closed";

    private readonly handlers = new Map<ServerMessageType, Set<(m: never) => void>>();
    private readonly anyHandlers = new Set<(message: ServerMessage) => void>();
    private readonly stateHandlers = new Set<(state: WsConnectionState) => void>();

    private snapshot: LiveSnapshot = {
        lcu: null,
        champSelect: null,
        config: null,
        dataset: null,
        clientId: null,
        staticDataVersion: null,
    };

    constructor(options: LiveSocketOptions = {}) {
        this.options = {
            url: options.url ?? defaultWsUrl(),
            reconnect: options.reconnect ?? true,
            baseDelayMs: options.baseDelayMs ?? 500,
            maxDelayMs: options.maxDelayMs ?? 15_000,
            pingIntervalMs: options.pingIntervalMs ?? 25_000,
            idleTimeoutMs: options.idleTimeoutMs ?? 70_000,
            factory: options.factory ?? ((url) => new WebSocket(url)),
        };
    }

    // ------------------------------------------------------------- state ---

    getState(): WsConnectionState {
        return this.state;
    }

    getSnapshot(): LiveSnapshot {
        return this.snapshot;
    }

    get isOpen(): boolean {
        return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
    }

    // -------------------------------------------------------- connection ---

    connect(): void {
        if (this.disposed) return;
        this.stopped = false;
        if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
        this.clearReconnect();
        this.setState(this.attempt === 0 ? "connecting" : "reconnecting");

        let socket: WebSocket;
        try {
            socket = this.options.factory(this.options.url);
        } catch {
            this.scheduleReconnect();
            return;
        }
        this.socket = socket;

        // A failed connection fires `close` in browsers but only `error` in
        // Node's undici WebSocket, and a live socket can fire both. `settled`
        // makes the teardown happen exactly once either way.
        let settled = false;
        const settle = () => {
            if (settled) return;
            settled = true;
            this.stopPing();
            if (this.socket === socket) this.socket = null;
            if (this.disposed || this.stopped) {
                this.setState("closed");
                return;
            }
            this.scheduleReconnect();
        };

        // Assigned synchronously: `hello` and the replayed state can arrive
        // before this function returns.
        socket.onmessage = (event: MessageEvent) => this.handleFrame(event.data);
        socket.onopen = () => {
            this.attempt = 0;
            this.lastFrameAt = Date.now();
            this.setState("open");
            this.startPing();
        };
        socket.onerror = () => {
            if (socket.readyState === WebSocket.OPEN) return;
            settle();
        };
        socket.onclose = settle;
    }

    /**
     * Closes the socket and stops reconnecting, but keeps the listeners — a
     * later `connect()` brings everything back. This is what a React effect
     * cleanup calls, so React 19's StrictMode double-mount is harmless.
     */
    close(): void {
        this.stopped = true;
        this.clearReconnect();
        this.stopPing();
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            socket.onclose = null;
            socket.onmessage = null;
            socket.onerror = null;
            socket.onopen = null;
            try {
                socket.close(1000, "client closed");
            } catch {
                // Already closing.
            }
        }
        this.setState("closed");
    }

    /** Closes for good and drops every listener. The instance is spent. */
    dispose(): void {
        this.disposed = true;
        this.close();
        this.handlers.clear();
        this.anyHandlers.clear();
        this.stateHandlers.clear();
    }

    /** Drops the current socket and reconnects immediately. */
    reconnectNow(): void {
        if (this.disposed) return;
        this.attempt = 0;
        this.stopped = false;
        const socket = this.socket;
        this.socket = null;
        if (socket) {
            socket.onclose = null;
            try {
                socket.close(4000, "manual reconnect");
            } catch {
                // Ignored.
            }
        }
        this.stopPing();
        this.connect();
    }

    // ----------------------------------------------------------- sending ---

    /** `true` when the frame was handed to an open socket. */
    send(message: ClientMessage): boolean {
        if (!this.isOpen || !this.socket) return false;
        try {
            this.socket.send(JSON.stringify(message));
            return true;
        } catch {
            return false;
        }
    }

    subscribe(topics?: WsTopic[]): boolean {
        return this.send(
            topics ? { type: "subscribe", topics } : { type: "subscribe" },
        );
    }

    unsubscribe(topics?: WsTopic[]): boolean {
        return this.send(
            topics ? { type: "unsubscribe", topics } : { type: "unsubscribe" },
        );
    }

    // --------------------------------------------------------- listening ---

    /** Subscribes to one message type. Returns the unsubscribe function. */
    on<T extends ServerMessageType>(type: T, handler: Handler<T>): () => void {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as (m: never) => void);
        return () => {
            set?.delete(handler as (m: never) => void);
        };
    }

    onAny(handler: (message: ServerMessage) => void): () => void {
        this.anyHandlers.add(handler);
        return () => {
            this.anyHandlers.delete(handler);
        };
    }

    onStateChange(handler: (state: WsConnectionState) => void): () => void {
        this.stateHandlers.add(handler);
        return () => {
            this.stateHandlers.delete(handler);
        };
    }

    // ---------------------------------------------------------- internals ---

    private setState(state: WsConnectionState): void {
        if (this.state === state) return;
        this.state = state;
        for (const handler of this.stateHandlers) handler(state);
    }

    private handleFrame(data: unknown): void {
        this.lastFrameAt = Date.now();
        if (typeof data !== "string") return;
        let message: ServerMessage;
        try {
            message = JSON.parse(data) as ServerMessage;
        } catch {
            return;
        }
        if (typeof message !== "object" || message === null) return;
        if (typeof (message as { type?: unknown }).type !== "string") return;

        this.remember(message);

        const set = this.handlers.get(message.type);
        if (set) {
            for (const handler of set) {
                (handler as (m: ServerMessage) => void)(message);
            }
        }
        for (const handler of this.anyHandlers) handler(message);
    }

    /** Keeps the latest replayed state so late subscribers are never blank. */
    private remember(message: ServerMessage): void {
        switch (message.type) {
            case "hello":
                this.snapshot = {
                    ...this.snapshot,
                    clientId: message.clientId,
                    staticDataVersion: message.staticDataVersion,
                };
                break;
            case "lcu:status":
                this.snapshot = { ...this.snapshot, lcu: message.status };
                break;
            case "champselect:update":
                this.snapshot = { ...this.snapshot, champSelect: message };
                break;
            case "champselect:end":
                this.snapshot = { ...this.snapshot, champSelect: null };
                break;
            case "config:update":
                this.snapshot = { ...this.snapshot, config: message.config };
                break;
            case "dataset:update":
                this.snapshot = { ...this.snapshot, dataset: message.dataset };
                break;
            default:
                break;
        }
    }

    private startPing(): void {
        this.stopPing();
        if (this.options.pingIntervalMs <= 0) return;
        this.pingTimer = setInterval(() => {
            if (!this.isOpen) return;
            const idleFor = Date.now() - this.lastFrameAt;
            if (
                this.options.idleTimeoutMs > 0 &&
                idleFor > this.options.idleTimeoutMs
            ) {
                // The socket looks alive but nothing is coming through.
                this.reconnectNow();
                return;
            }
            this.send({ type: "ping" });
        }, this.options.pingIntervalMs);
    }

    private stopPing(): void {
        if (this.pingTimer !== null) clearInterval(this.pingTimer);
        this.pingTimer = null;
    }

    private clearReconnect(): void {
        if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }

    private scheduleReconnect(): void {
        if (!this.options.reconnect || this.disposed || this.stopped) {
            this.setState("closed");
            return;
        }
        this.setState("reconnecting");
        const delay = backoffDelay(
            this.attempt,
            this.options.baseDelayMs,
            this.options.maxDelayMs,
        );
        this.attempt += 1;
        this.clearReconnect();
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }
}

/** Message types the server replays on connect — exported for documentation. */
export const REPLAYED_MESSAGE_TYPES: readonly ServerMessageType[] = REPLAYED;
