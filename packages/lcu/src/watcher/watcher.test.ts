import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
    GameflowPhase,
    LcuChampSelectSession,
    LcuSummoner,
} from "../api/types.js";
import { blindPickSession } from "../testing/champ-select-fixtures.js";
import type { LcuCredentials } from "../types.js";
import { LcuWatcher, type LcuWatcherClient } from "./watcher.js";
import { WAMP_EVENT, type LcuSocketHandlers } from "./socket.js";

const SUMMONER: LcuSummoner = { puuid: "puuid-1", gameName: "Sona", tagLine: "EUW" };

function credentials(port: number): LcuCredentials {
    return { port, password: `token-${port}`, protocol: "https", source: "lockfile" };
}

function frame(uri: string, data: unknown, eventType = "Update"): string {
    return JSON.stringify([WAMP_EVENT, "OnJsonApiEvent", { uri, eventType, data }]);
}

type FakeSocket = {
    handlers: LcuSocketHandlers;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    credentials: LcuCredentials;
};

function harness(
    options: {
        phase?: GameflowPhase;
        session?: LcuChampSelectSession | null;
        useSocket?: boolean;
    } = {},
) {
    const clients: (LcuWatcherClient & {
        getCurrentSummoner: ReturnType<typeof vi.fn>;
        getGameflowPhase: ReturnType<typeof vi.fn>;
        getChampSelectSession: ReturnType<typeof vi.fn>;
        close: ReturnType<typeof vi.fn>;
    })[] = [];
    const sockets: FakeSocket[] = [];

    const state = {
        phase: options.phase ?? ("None" as GameflowPhase),
        session: options.session ?? null,
        summoner: SUMMONER as LcuSummoner | null,
        credentials: [credentials(1111)] as (LcuCredentials | null)[],
        discoverCalls: 0,
    };

    const discover = vi.fn(async () => {
        const next =
            state.credentials[
                Math.min(state.discoverCalls, state.credentials.length - 1)
            ] ?? null;
        state.discoverCalls += 1;
        return next;
    });

    const createClient = vi.fn((creds: LcuCredentials) => {
        const client = {
            credentials: creds,
            getCurrentSummoner: vi.fn(async () => state.summoner),
            getGameflowPhase: vi.fn(async () => state.phase),
            getChampSelectSession: vi.fn(async () => state.session),
            close: vi.fn(),
        };
        clients.push(client);
        return client as LcuWatcherClient;
    });

    const createSocket = vi.fn((creds: LcuCredentials, handlers: LcuSocketHandlers) => {
        const socket: FakeSocket = {
            handlers,
            send: vi.fn(),
            close: vi.fn(),
            credentials: creds,
        };
        sockets.push(socket);
        return socket;
    });

    return { state, discover, createClient, createSocket, clients, sockets };
}

function recorder(watcher: LcuWatcher) {
    const events = {
        connected: [] as (LcuSummoner | null)[],
        disconnected: [] as string[],
        phase: [] as GameflowPhase[],
        session: [] as LcuChampSelectSession[],
        ended: 0,
        summoner: [] as LcuSummoner[],
    };
    watcher.on("connected", (summoner) => events.connected.push(summoner));
    watcher.on("disconnected", (reason) => events.disconnected.push(reason));
    watcher.on("gameflow-phase", (phase) => events.phase.push(phase));
    watcher.on("champ-select", (session) => events.session.push(session));
    watcher.on("champ-select-end", () => (events.ended += 1));
    watcher.on("current-summoner", (summoner) => events.summoner.push(summoner));
    return events;
}

let watchers: LcuWatcher[] = [];

function track(watcher: LcuWatcher): LcuWatcher {
    watchers.push(watcher);
    return watcher;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    for (const watcher of watchers) watcher.stop();
    watchers = [];
    vi.useRealTimers();
});

describe("LcuWatcher — connecting", () => {
    it("polls for the client every 2s until it shows up", async () => {
        const h = harness();
        h.state.credentials = [null, null, credentials(1111)];
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(events.connected).toHaveLength(0);
        expect(h.discover).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2_000);
        expect(h.discover).toHaveBeenCalledTimes(2);
        expect(events.connected).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(2_000);
        expect(events.connected).toEqual([SUMMONER]);
        expect(events.summoner).toEqual([SUMMONER]);
        expect(watcher.isConnected()).toBe(true);
    });

    it("subscribes to OnJsonApiEvent once the socket opens", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);

        expect(h.sockets).toHaveLength(1);
        expect(h.sockets[0]?.credentials.port).toBe(1111);
        h.sockets[0]?.handlers.onOpen?.();
        expect(h.sockets[0]?.send).toHaveBeenCalledWith('[5,"OnJsonApiEvent"]');
        expect(watcher.isPolling()).toBe(false);
    });

    it("reports the phase and session it finds on connect", async () => {
        const h = harness({ phase: "ChampSelect", session: blindPickSession() });
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);

        expect(events.phase).toEqual(["ChampSelect"]);
        expect(events.session).toHaveLength(1);
        expect(watcher.getSession()).not.toBeNull();
        expect(watcher.getPhase()).toBe("ChampSelect");
    });

    it("goes back to looking when the first call fails", async () => {
        const h = harness();
        let attempts = 0;
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: (creds) => {
                    const client = h.createClient(creds);
                    attempts += 1;
                    if (attempts === 1) {
                        (
                            client.getCurrentSummoner as ReturnType<typeof vi.fn>
                        ).mockRejectedValue(new Error("ECONNREFUSED"));
                    }
                    return client;
                },
                createSocket: h.createSocket,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(events.connected).toHaveLength(0);

        // First reconnect delay.
        await vi.advanceTimersByTimeAsync(1_000);
        expect(events.connected).toEqual([SUMMONER]);
    });
});

describe("LcuWatcher — events", () => {
    async function connected(mapContext?: { dataset?: undefined }) {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
                ...(mapContext ? { mapContext } : {}),
            }),
        );
        const events = recorder(watcher);
        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        h.sockets[0]?.handlers.onOpen?.();
        return { h, watcher, events, socket: h.sockets[0]! };
    }

    it("routes champ-select updates", async () => {
        const { socket, events, watcher } = await connected();
        const session = blindPickSession();

        socket.handlers.onMessage?.(frame("/lol-champ-select/v1/session", session));

        expect(events.session).toHaveLength(1);
        expect(watcher.getSession()).toEqual(session);
    });

    it("emits the mapped state when a map context is configured", async () => {
        const { socket, watcher } = await connected({ dataset: undefined });
        const states: unknown[] = [];
        watcher.on("champ-select-state", (state) => states.push(state));

        socket.handlers.onMessage?.(
            frame("/lol-champ-select/v1/session", blindPickSession()),
        );

        expect(states).toHaveLength(1);
        expect(watcher.getState()).toMatchObject({ phase: "FINALIZATION" });
    });

    it("ignores an unchanged session", async () => {
        const { socket, events } = await connected();
        const session = blindPickSession();

        socket.handlers.onMessage?.(frame("/lol-champ-select/v1/session", session));
        socket.handlers.onMessage?.(frame("/lol-champ-select/v1/session", session));
        expect(events.session).toHaveLength(1);

        socket.handlers.onMessage?.(
            frame("/lol-champ-select/v1/session", { ...session, counter: 99 }),
        );
        expect(events.session).toHaveLength(2);
    });

    it("ends champion select on a Delete event", async () => {
        const { socket, events, watcher } = await connected();

        socket.handlers.onMessage?.(
            frame("/lol-champ-select/v1/session", blindPickSession()),
        );
        socket.handlers.onMessage?.(
            frame("/lol-champ-select/v1/session", null, "Delete"),
        );

        expect(events.ended).toBe(1);
        expect(watcher.getSession()).toBeNull();

        // A second delete is not news.
        socket.handlers.onMessage?.(
            frame("/lol-champ-select/v1/session", null, "Delete"),
        );
        expect(events.ended).toBe(1);
    });

    it("ends champion select when the gameflow phase moves on", async () => {
        const { socket, events } = await connected();

        socket.handlers.onMessage?.(
            frame("/lol-gameflow/v1/gameflow-phase", "ChampSelect"),
        );
        socket.handlers.onMessage?.(
            frame("/lol-champ-select/v1/session", blindPickSession()),
        );
        socket.handlers.onMessage?.(
            frame("/lol-gameflow/v1/gameflow-phase", "InProgress"),
        );

        expect(events.phase).toEqual(["None", "ChampSelect", "InProgress"]);
        expect(events.ended).toBe(1);
    });

    it("does not repeat an unchanged phase", async () => {
        const { socket, events } = await connected();

        socket.handlers.onMessage?.(frame("/lol-gameflow/v1/gameflow-phase", "Lobby"));
        socket.handlers.onMessage?.(frame("/lol-gameflow/v1/gameflow-phase", "Lobby"));

        expect(events.phase).toEqual(["None", "Lobby"]);
    });

    it("forwards a summoner change and ignores unrelated uris", async () => {
        const { socket, events } = await connected();

        socket.handlers.onMessage?.(
            frame("/lol-summoner/v1/current-summoner", { puuid: "puuid-2" }),
        );
        socket.handlers.onMessage?.(frame("/lol-chat/v1/me", { availability: "away" }));
        socket.handlers.onMessage?.("not json");

        expect(events.summoner).toEqual([SUMMONER, { puuid: "puuid-2" }]);
        expect(events.session).toHaveLength(0);
    });
});

describe("LcuWatcher — reconnecting", () => {
    it("reconnects with exponential backoff when the client exits", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
                reconnectBaseDelayMs: 1_000,
                reconnectMaxDelayMs: 4_000,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        h.sockets[0]?.handlers.onOpen?.();

        // The client exits: the socket closes and nothing answers any more.
        h.state.credentials = [null];
        h.state.discoverCalls = 0;
        h.sockets[0]?.handlers.onClose?.({ code: 1006, reason: "" });

        expect(events.disconnected).toHaveLength(1);
        expect(watcher.isConnected()).toBe(false);
        expect(h.clients[0]?.close).toHaveBeenCalled();

        const before = h.discover.mock.calls.length;
        await vi.advanceTimersByTimeAsync(999);
        expect(h.discover.mock.calls.length).toBe(before);
        await vi.advanceTimersByTimeAsync(1);
        expect(h.discover.mock.calls.length).toBe(before + 1);

        // Still nothing: the client is gone, so discovery keeps its own pace.
        await vi.advanceTimersByTimeAsync(2_000);
        expect(h.discover.mock.calls.length).toBe(before + 2);
    });

    it("survives the client restarting on a new port", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        h.sockets[0]?.handlers.onOpen?.();

        h.state.credentials = [credentials(2222)];
        h.state.discoverCalls = 0;
        h.sockets[0]?.handlers.onClose?.({ code: 1000, reason: "bye" });
        await vi.advanceTimersByTimeAsync(1_000);

        expect(events.connected).toHaveLength(2);
        expect(h.clients).toHaveLength(2);
        expect(h.clients[1]?.credentials.port).toBe(2222);
        expect(h.sockets[1]?.credentials.port).toBe(2222);
        expect(watcher.getCredentials()?.port).toBe(2222);
    });

    it("emits error only when someone is listening, and never throws", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);

        // No `error` listener: an unhandled EventEmitter error would crash.
        expect(() =>
            h.sockets[0]?.handlers.onError?.(new Error("socket blew up")),
        ).not.toThrow();

        const errors: Error[] = [];
        watcher.on("error", (error) => errors.push(error));
        await vi.advanceTimersByTimeAsync(1_000);
        h.sockets[1]?.handlers.onError?.(new Error("again"));
        expect(errors.map((error) => error.message)).toContain("again");
    });
});

describe("LcuWatcher — polling fallback", () => {
    it("falls back to polling after repeated socket failures", async () => {
        const h = harness({ phase: "ChampSelect", session: blindPickSession() });
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
                maxSocketAttempts: 3,
                reconnectBaseDelayMs: 1_000,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);

        // Three sockets that never open.
        h.sockets[0]?.handlers.onClose?.({ code: 1006, reason: "" });
        await vi.advanceTimersByTimeAsync(1_000);
        h.sockets[1]?.handlers.onClose?.({ code: 1006, reason: "" });
        await vi.advanceTimersByTimeAsync(2_000);
        h.sockets[2]?.handlers.onClose?.({ code: 1006, reason: "" });

        expect(watcher.isPolling()).toBe(true);
        expect(watcher.isConnected()).toBe(true);
        expect(h.createSocket).toHaveBeenCalledTimes(3);

        // Polling picks up champ-select changes every second.
        const seen = events.session.length;
        h.state.session = { ...blindPickSession(), counter: 12 };
        await vi.advanceTimersByTimeAsync(1_000);
        expect(events.session.length).toBe(seen + 1);
    });

    it("polls instead of opening a socket when told to", async () => {
        const h = harness({ phase: "ChampSelect", session: null });
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: null,
                sessionPollIntervalMs: 1_000,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(watcher.isPolling()).toBe(true);

        h.state.session = blindPickSession();
        await vi.advanceTimersByTimeAsync(1_000);
        expect(events.session).toHaveLength(1);

        // The session disappears: champ select ended.
        h.state.session = null;
        await vi.advanceTimersByTimeAsync(1_000);
        expect(events.ended).toBe(1);
    });

    it("treats a failing poll as a disconnect", async () => {
        const h = harness({ phase: "ChampSelect" });
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: null,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);

        h.clients[0]?.getGameflowPhase.mockRejectedValue(new Error("ECONNREFUSED"));
        h.state.credentials = [null];
        h.state.discoverCalls = 0;

        await vi.advanceTimersByTimeAsync(1_000);
        expect(events.disconnected).toHaveLength(1);
        expect(watcher.isConnected()).toBe(false);
    });
});

describe("LcuWatcher — lifecycle", () => {
    it("cleans up timers, sockets and the client on stop", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        h.sockets[0]?.handlers.onOpen?.();

        watcher.stop();

        expect(h.sockets[0]?.close).toHaveBeenCalled();
        expect(h.clients[0]?.close).toHaveBeenCalled();
        expect(events.disconnected).toEqual(["stopped"]);
        expect(watcher.isConnected()).toBe(false);
        expect(watcher.isRunning()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);

        const calls = h.discover.mock.calls.length;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(h.discover.mock.calls.length).toBe(calls);
    });

    it("is idempotent", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );

        watcher.start();
        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        expect(h.discover).toHaveBeenCalledTimes(1);

        watcher.stop();
        watcher.stop();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("can be started again after being stopped", async () => {
        const h = harness();
        const watcher = track(
            new LcuWatcher({
                discover: h.discover,
                createClient: h.createClient,
                createSocket: h.createSocket,
            }),
        );
        const events = recorder(watcher);

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);
        watcher.stop();

        watcher.start();
        await vi.advanceTimersByTimeAsync(0);

        expect(events.connected).toHaveLength(2);
        expect(watcher.isConnected()).toBe(true);
    });
});
