import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSocket } from "./ws";
import type { ServerMessage } from "./types";

/**
 * The socket is tested against a fake `WebSocket`: no server, no network, no
 * timing luck. What matters is the contract with `apps/server` — `hello` and
 * the replayed state arrive immediately, an `error` frame does not kill the
 * connection, and a drop reconnects on its own.
 */

class FakeSocket {
    static instances: FakeSocket[] = [];

    readyState = 0;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
        FakeSocket.instances.push(this);
    }

    send(data: string): void {
        if (this.readyState !== 1) throw new Error("socket is not open");
        this.sent.push(data);
    }

    close(): void {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.();
    }

    // --- test helpers ---
    accept(): void {
        this.readyState = 1;
        this.onopen?.();
    }

    emit(message: ServerMessage): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    drop(): void {
        this.readyState = 3;
        this.onclose?.();
    }

    failToConnect(): void {
        this.onerror?.();
    }
}

function factory(url: string): WebSocket {
    return new FakeSocket(url) as unknown as WebSocket;
}

function last(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1]!;
}

const HELLO: ServerMessage = {
    type: "hello",
    clientId: "client-1",
    topics: ["lcu", "champselect", "draft", "config", "dataset", "jobs"],
    heartbeatMs: 30_000,
    staticDataVersion: "16.17.1",
};

const LCU_STATUS: ServerMessage = {
    type: "lcu:status",
    status: {
        enabled: true,
        running: true,
        connected: true,
        polling: false,
        phase: "ChampSelect",
        inChampSelect: true,
        summoner: null,
        lastError: null,
        updatedAt: 1,
    },
};

beforeEach(() => {
    FakeSocket.instances = [];
});

afterEach(() => {
    vi.useRealTimers();
});

describe("LiveSocket", () => {
    it("assigns onmessage synchronously so the hello replay is never missed", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        socket.connect();
        // The server sends `hello` the instant it accepts, before `onopen`
        // handling would have had a chance to run in a later tick.
        last().emit(HELLO);
        expect(socket.getSnapshot().clientId).toBe("client-1");
        expect(socket.getSnapshot().staticDataVersion).toBe("16.17.1");
        socket.dispose();
    });

    it("remembers every replayed state for late subscribers", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        socket.connect();
        last().accept();
        last().emit(HELLO);
        last().emit(LCU_STATUS);
        last().emit({
            type: "dataset:update",
            dataset: {
                rank: "PLATINUM_PLUS",
                region: "ALL",
                provider: "bundled-fixture",
                date: "2026-08-26",
                offline: true,
            } as never,
        });
        const snapshot = socket.getSnapshot();
        expect(snapshot.lcu?.connected).toBe(true);
        expect(snapshot.dataset?.offline).toBe(true);
        socket.dispose();
    });

    it("dispatches typed handlers and unsubscribes cleanly", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        const seen: string[] = [];
        const off = socket.on("lcu:status", (message) =>
            seen.push(message.status.phase ?? ""),
        );
        socket.connect();
        last().accept();
        last().emit(LCU_STATUS);
        expect(seen).toEqual(["ChampSelect"]);
        off();
        last().emit(LCU_STATUS);
        expect(seen).toEqual(["ChampSelect"]);
        socket.dispose();
    });

    it("clears the champ select on champselect:end", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        socket.connect();
        last().accept();
        last().emit({
            type: "champselect:update",
            state: { ally: [] } as never,
            analysis: {} as never,
            suggestions: {} as never,
        });
        expect(socket.getSnapshot().champSelect).not.toBeNull();
        last().emit({ type: "champselect:end" });
        expect(socket.getSnapshot().champSelect).toBeNull();
        socket.dispose();
    });

    it("only sends on an open socket, and never throws", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        socket.connect();
        expect(socket.send({ type: "ping" })).toBe(false);
        last().accept();
        expect(socket.send({ type: "ping" })).toBe(true);
        expect(JSON.parse(last().sent[0]!)).toEqual({ type: "ping" });
        socket.dispose();
    });

    it("stays open after an error frame", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        const errors: string[] = [];
        socket.on("error", (message) => errors.push(message.error.code));
        socket.connect();
        last().accept();
        last().emit({
            type: "error",
            requestId: "req-1",
            error: { code: "UNKNOWN_CHAMPION", message: "…" },
        });
        expect(errors).toEqual(["UNKNOWN_CHAMPION"]);
        expect(socket.getState()).toBe("open");
        socket.dispose();
    });

    it("ignores frames that are not JSON objects", () => {
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
        });
        socket.connect();
        last().accept();
        expect(() => last().onmessage?.({ data: "not json" })).not.toThrow();
        expect(() =>
            last().onmessage?.({ data: JSON.stringify([1, 2]) }),
        ).not.toThrow();
        expect(() => last().onmessage?.({ data: new ArrayBuffer(2) })).not.toThrow();
        socket.dispose();
    });

    it("reconnects with backoff after a drop", () => {
        vi.useFakeTimers();
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
            baseDelayMs: 100,
            maxDelayMs: 400,
        });
        socket.connect();
        last().accept();
        expect(socket.getState()).toBe("open");

        last().drop();
        expect(socket.getState()).toBe("reconnecting");
        expect(FakeSocket.instances).toHaveLength(1);

        vi.advanceTimersByTime(500);
        expect(FakeSocket.instances).toHaveLength(2);
        last().accept();
        expect(socket.getState()).toBe("open");
        socket.dispose();
    });

    it("treats a refused connection as a drop (Node fires error, not close)", () => {
        vi.useFakeTimers();
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
            baseDelayMs: 100,
            maxDelayMs: 200,
        });
        socket.connect();
        last().failToConnect();
        expect(socket.getState()).toBe("reconnecting");
        vi.advanceTimersByTime(300);
        expect(FakeSocket.instances).toHaveLength(2);
        socket.dispose();
    });

    it("stops reconnecting once closed, and reconnects again on connect()", () => {
        vi.useFakeTimers();
        const socket = new LiveSocket({
            url: "ws://test/ws",
            factory,
            pingIntervalMs: 0,
            baseDelayMs: 100,
        });
        socket.connect();
        last().accept();

        // What a React effect cleanup does: StrictMode mounts twice.
        socket.close();
        expect(socket.getState()).toBe("closed");
        vi.advanceTimersByTime(2000);
        expect(FakeSocket.instances).toHaveLength(1);

        socket.connect();
        expect(FakeSocket.instances).toHaveLength(2);
        last().accept();
        expect(socket.getState()).toBe("open");

        socket.dispose();
        socket.connect();
        expect(FakeSocket.instances).toHaveLength(2);
    });
});
