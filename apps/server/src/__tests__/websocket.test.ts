import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { generateFixtureDataset } from "@draftpredict/data";
import { LcuService } from "../lcu/service.js";
import type { ServerMessage } from "../ws/protocol.js";
import type { TestApp } from "../testing/harness.js";
import { createTestApp, testStaticData } from "../testing/harness.js";
import { FakeLcuWatcher, champSelectState } from "../testing/fake-watcher.js";

let harness: TestApp | undefined;
let championKeys: string[];

beforeAll(() => {
    championKeys = Object.keys(
        generateFixtureDataset({ window: "patch", staticData: testStaticData() })
            .championData,
    );
});

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

/**
 * Opens `/ws` and collects every frame, in order.
 *
 * The listener is attached in `onInit`, before the handshake completes: the
 * server sends `hello` and the replayed state the instant it accepts the
 * socket, and a listener added after `injectWS` resolves would miss them.
 */
async function connect(
    app: FastifyInstance,
): Promise<{ socket: WebSocket; messages: ServerMessage[] }> {
    const messages: ServerMessage[] = [];
    const socket = await app.injectWS("/ws", undefined, {
        onInit: (ws: WebSocket) => {
            ws.on("message", (data: unknown) => {
                messages.push(JSON.parse(String(data)) as ServerMessage);
            });
        },
    });
    return { socket, messages };
}

async function waitFor<T>(
    predicate: () => T | undefined,
    timeoutMs = 5000,
): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = predicate();
        if (value !== undefined) return value;
        if (Date.now() > deadline) throw new Error("timed out waiting for a message");
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
}

describe("GET /ws", () => {
    it("greets a new client with hello and the current LCU status", async () => {
        harness = await createTestApp({ startLcu: true });

        const { socket, messages } = await connect(harness.app);

        const hello = await waitFor(() =>
            messages.find((message) => message.type === "hello"),
        );
        expect(hello).toMatchObject({
            type: "hello",
            topics: expect.arrayContaining(["champselect", "draft"]),
        });

        await waitFor(() => messages.find((m) => m.type === "lcu:status"));
        socket.close();
    });

    it("analyses a manually edited draft sent over the socket", async () => {
        harness = await createTestApp();

        const { socket, messages } = await connect(harness.app);

        socket.send(
            JSON.stringify({
                type: "draft:set",
                requestId: "req-1",
                team: [[0, championKeys[0]]],
                enemy: [[0, championKeys[1]]],
                suggestions: false,
            }),
        );

        const analysis = await waitFor(() =>
            messages.find((message) => message.type === "draft:analysis"),
        );

        expect(analysis).toMatchObject({ requestId: "req-1", suggestions: null });
        if (analysis.type !== "draft:analysis") throw new Error("wrong message");
        expect(analysis.analysis.result.winrate).toBeGreaterThan(0);
        expect(analysis.analysis.dataset.provider).toBe("bundled-fixture");

        socket.close();
    });

    it("answers an invalid draft:set with an error frame, not a disconnect", async () => {
        harness = await createTestApp();

        const { socket, messages } = await connect(harness.app);

        socket.send(
            JSON.stringify({
                type: "draft:set",
                requestId: "bad",
                team: [[0, "999999"]],
                enemy: [],
            }),
        );

        const error = await waitFor(() =>
            messages.find((message) => message.type === "error"),
        );

        expect(error).toMatchObject({
            type: "error",
            requestId: "bad",
            error: { code: "UNKNOWN_CHAMPION" },
        });
        expect(socket.readyState).toBe(socket.OPEN);

        socket.close();
    });

    it("replies to ping with pong", async () => {
        harness = await createTestApp();

        const { socket, messages } = await connect(harness.app);

        socket.send(JSON.stringify({ type: "ping" }));

        const pong = await waitFor(() =>
            messages.find((message) => message.type === "pong"),
        );
        expect(pong.type).toBe("pong");

        socket.close();
    });

    it("broadcasts config:update when settings change", async () => {
        harness = await createTestApp();

        const { socket, messages } = await connect(harness.app);
        await waitFor(() => messages.find((message) => message.type === "hello"));

        await harness.app.inject({
            method: "POST",
            url: "/api/config",
            payload: { minGames: 750 },
        });

        const update = await waitFor(() =>
            messages.find((message) => message.type === "config:update"),
        );
        if (update.type !== "config:update") throw new Error("wrong message");
        expect(update.config.minGames).toBe(750);
        // Even here the key stays server-side.
        expect(update.config).not.toHaveProperty("riotApiKey");

        socket.close();
    });

    it("stops sending messages for topics a client unsubscribed from", async () => {
        harness = await createTestApp();

        const { socket, messages } = await connect(harness.app);

        await waitFor(() => messages.find((message) => message.type === "hello"));
        socket.send(JSON.stringify({ type: "unsubscribe", topics: ["config"] }));
        // Give the server a turn to process the subscription change.
        await new Promise((resolve) => setTimeout(resolve, 50));

        await harness.app.inject({
            method: "POST",
            url: "/api/config",
            payload: { minGames: 400 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(messages.find((message) => message.type === "config:update")).toBeUndefined();
        socket.close();
    });
});

describe("champ select over the WebSocket", () => {
    it("broadcasts an analysed champselect:update when the LCU fires", async () => {
        const watcher = new FakeLcuWatcher();
        harness = await createTestApp({
            lcuWatcher: watcher.asWatcher(),
            startLcu: true,
            lcuDebounceMs: 5,
        });

        const { socket, messages } = await connect(harness.app);
        await waitFor(() => messages.find((message) => message.type === "hello"));

        watcher.connect({ puuid: "puuid-1", gameName: "Moi", tagLine: "EUW" });
        watcher.pushChampSelect(
            champSelectState({
                ally: [
                    [0, championKeys[0]],
                    [1, championKeys[1]],
                ],
                opponent: [[0, championKeys[2]]],
                bans: { ally: [championKeys[3]], opponent: [championKeys[4]] },
            }),
        );

        const update = await waitFor(() =>
            messages.find((message) => message.type === "champselect:update"),
        );
        if (update.type !== "champselect:update") throw new Error("wrong message");

        expect(update.state.ally).toEqual([
            [0, championKeys[0]],
            [1, championKeys[1]],
        ]);
        expect(update.state.bans.ally).toEqual([championKeys[3]]);
        expect(update.analysis.result.winrate).toBeGreaterThan(0);
        expect(update.suggestions.roles.map((role) => role.role)).toEqual([2, 3, 4]);

        // The same state is available over REST for clients that connect late.
        const rest = await harness.app.inject({ url: "/api/lcu/champ-select" });
        expect(rest.json().inChampSelect).toBe(true);
        expect(rest.json().state.ally).toEqual(update.state.ally);

        socket.close();
    });

    it("replays the last champ select to a client that connects late", async () => {
        const watcher = new FakeLcuWatcher();
        harness = await createTestApp({
            lcuWatcher: watcher.asWatcher(),
            startLcu: true,
            lcuDebounceMs: 5,
        });

        watcher.connect();
        watcher.pushChampSelect(
            champSelectState({ ally: [[2, championKeys[0]]], opponent: [] }),
        );
        await waitFor(() =>
            harness?.app.ctx.lcu.getCurrent() === null
                ? undefined
                : harness?.app.ctx.lcu.getCurrent(),
        );

        const { socket, messages } = await connect(harness.app);

        const update = await waitFor(() =>
            messages.find((message) => message.type === "champselect:update"),
        );
        expect(update.type).toBe("champselect:update");

        socket.close();
    });

    it("coalesces a burst of LCU events into a single analysis", async () => {
        const watcher = new FakeLcuWatcher();
        const harnessLocal = await createTestApp({
            lcuWatcher: watcher.asWatcher(),
            startLcu: true,
            lcuDebounceMs: 40,
        });
        harness = harnessLocal;

        const { socket, messages } = await connect(harnessLocal.app);
        await waitFor(() => messages.find((message) => message.type === "hello"));

        watcher.connect();
        for (let i = 0; i < 10; i++) {
            watcher.pushChampSelect(
                champSelectState({ ally: [[0, championKeys[i]]], opponent: [] }),
            );
        }

        await waitFor(() =>
            messages.find((message) => message.type === "champselect:update"),
        );
        await new Promise((resolve) => setTimeout(resolve, 150));

        const updates = messages.filter(
            (message) => message.type === "champselect:update",
        );
        expect(updates.length).toBeLessThanOrEqual(2);

        // The newest state wins.
        const last = updates.at(-1);
        if (last?.type !== "champselect:update") throw new Error("wrong message");
        expect(last.state.ally).toEqual([[0, championKeys[9]]]);

        socket.close();
    });

    it("survives an LCU failure instead of taking the server down", async () => {
        const watcher = new FakeLcuWatcher();
        harness = await createTestApp({
            lcuWatcher: watcher.asWatcher(),
            startLcu: true,
        });

        watcher.emit("error", new Error("LCU socket closed unexpectedly"));

        const health = await harness.app.inject({ url: "/api/health" });
        expect(health.statusCode).toBe(200);
        expect(health.json().lcu.lastError).toContain("LCU socket closed");
    });
});

describe("LcuService", () => {
    it("does nothing at all when no watcher is configured", () => {
        const service = new LcuService({
            watcher: null,
            config: {
                get: () => ({ lcuEnabled: true }),
            } as never,
            dataset: {} as never,
            draft: {} as never,
        });

        service.start();
        expect(service.isEnabled()).toBe(false);
        expect(service.status().connected).toBe(false);
        service.stop();
    });
});
