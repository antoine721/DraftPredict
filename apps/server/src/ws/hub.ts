import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { ServerMessage, WsTopic } from "./protocol.js";
import { REPLAYED_MESSAGE_TYPES, WS_TOPICS, topicByMessageType } from "./protocol.js";

/**
 * The connection registry.
 *
 * Clients subscribe to topics, the hub fans messages out to whoever asked for
 * them, and the latest "state" message of each replayed type is kept so a
 * client that connects in the middle of a champion select is immediately up to
 * date instead of waiting for the next LCU event.
 *
 * A dead TCP connection can stay open for a long time; the heartbeat pings
 * every `heartbeatMs` and terminates sockets that never answer.
 */

export type WsClient = {
    id: string;
    socket: WebSocket;
    topics: Set<WsTopic>;
    alive: boolean;
    connectedAt: number;
};

export type WsHubOptions = {
    /** Ping interval in ms. `0` disables the heartbeat. Default 30 000. */
    heartbeatMs?: number;
    now?: () => number;
    /** Called when a send fails; the socket is dropped either way. */
    onError?: (error: unknown, clientId: string) => void;
};

const OPEN = 1;

export class WsHub {
    readonly heartbeatMs: number;

    private readonly clients = new Map<string, WsClient>();
    private readonly replay = new Map<ServerMessage["type"], ServerMessage>();
    private readonly now: () => number;
    private readonly onError: ((error: unknown, clientId: string) => void) | undefined;
    private heartbeat: ReturnType<typeof setInterval> | null = null;
    private closed = false;

    constructor(options: WsHubOptions = {}) {
        this.heartbeatMs = options.heartbeatMs ?? 30_000;
        this.now = options.now ?? Date.now;
        this.onError = options.onError;
        this.startHeartbeat();
    }

    get size(): number {
        return this.clients.size;
    }

    /** Registers a socket, replays the last known state and returns the client. */
    add(socket: WebSocket, staticDataVersion: string): WsClient {
        const client: WsClient = {
            id: randomUUID(),
            socket,
            topics: new Set(WS_TOPICS),
            alive: true,
            connectedAt: this.now(),
        };
        this.clients.set(client.id, client);

        socket.on("pong", () => {
            client.alive = true;
        });
        socket.on("close", () => this.remove(client.id));
        socket.on("error", () => this.remove(client.id));

        this.send(client, {
            type: "hello",
            clientId: client.id,
            topics: [...client.topics],
            heartbeatMs: this.heartbeatMs,
            staticDataVersion,
        });

        for (const type of REPLAYED_MESSAGE_TYPES) {
            const message = this.replay.get(type);
            if (message) this.send(client, message);
        }

        return client;
    }

    remove(clientId: string): void {
        this.clients.delete(clientId);
    }

    get(clientId: string): WsClient | undefined {
        return this.clients.get(clientId);
    }

    subscribe(client: WsClient, topics: WsTopic[]): void {
        for (const topic of topics) client.topics.add(topic);
    }

    unsubscribe(client: WsClient, topics: WsTopic[]): void {
        for (const topic of topics) client.topics.delete(topic);
    }

    /** Sends to one client. Never throws. */
    send(client: WsClient, message: ServerMessage): void {
        if (client.socket.readyState !== OPEN) return;
        try {
            client.socket.send(JSON.stringify(message));
        } catch (error) {
            this.onError?.(error, client.id);
            this.remove(client.id);
        }
    }

    /**
     * Fans a message out to every subscriber of its topic, remembering it when
     * it is one of the replayed state messages.
     */
    broadcast(message: ServerMessage): number {
        if (REPLAYED_MESSAGE_TYPES.includes(message.type)) {
            this.replay.set(message.type, message);
        }
        const topic = topicByMessageType[message.type];
        let sent = 0;
        for (const client of this.clients.values()) {
            if (!client.topics.has(topic)) continue;
            this.send(client, message);
            sent += 1;
        }
        return sent;
    }

    /** Drops a remembered state (e.g. when champion select ends). */
    forget(type: ServerMessage["type"]): void {
        this.replay.delete(type);
    }

    /** Closes every socket and stops the heartbeat. Idempotent. */
    close(code = 1001, reason = "Server shutting down"): void {
        if (this.closed) return;
        this.closed = true;
        if (this.heartbeat) {
            clearInterval(this.heartbeat);
            this.heartbeat = null;
        }
        for (const client of this.clients.values()) {
            try {
                client.socket.close(code, reason);
            } catch {
                // Already gone.
            }
        }
        this.clients.clear();
    }

    private startHeartbeat(): void {
        if (this.heartbeatMs <= 0) return;
        this.heartbeat = setInterval(() => {
            for (const client of this.clients.values()) {
                if (!client.alive) {
                    try {
                        client.socket.terminate();
                    } catch {
                        // Nothing left to terminate.
                    }
                    this.remove(client.id);
                    continue;
                }
                client.alive = false;
                try {
                    client.socket.ping();
                } catch {
                    this.remove(client.id);
                }
            }
        }, this.heartbeatMs);
        this.heartbeat.unref?.();
    }
}
