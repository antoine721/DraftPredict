import { describe, expect, it, vi } from "vitest";
import { LcuClient } from "./client.js";
import {
    LcuActionsDisabledError,
    LcuConnectionError,
    LcuHttpError,
    LcuParseError,
} from "./errors.js";
import type { LcuHttpRequest, LcuHttpResponse } from "./http/transport.js";
import type { LcuCredentials } from "./types.js";

const CREDENTIALS: LcuCredentials = {
    port: 52459,
    password: "sT1JOWLDkC9WJbLQKrs3rw",
    protocol: "https",
    source: "lockfile",
};

type Responder = (request: LcuHttpRequest) => Partial<LcuHttpResponse>;

function makeClient(responder: Responder, allowActions = false) {
    const calls: LcuHttpRequest[] = [];
    const transport = vi.fn(async (request: LcuHttpRequest) => {
        calls.push(request);
        const response = responder(request);
        return {
            status: response.status ?? 200,
            headers: response.headers ?? {},
            body: response.body ?? "",
        };
    });
    const client = new LcuClient({
        credentials: CREDENTIALS,
        transport,
        allowActions,
    });
    return { client, calls, transport };
}

function json(body: unknown): Partial<LcuHttpResponse> {
    return { status: 200, body: JSON.stringify(body) };
}

describe("LcuClient", () => {
    it("authenticates every call as riot:<token>", async () => {
        const { client, calls } = makeClient(() => json({ puuid: "p" }));
        await client.getCurrentSummoner();

        const expected = `Basic ${Buffer.from(`riot:${CREDENTIALS.password}`).toString("base64")}`;
        expect(calls[0]?.headers.authorization).toBe(expected);
        expect(calls[0]?.headers.accept).toBe("application/json");
        expect(client.baseUrl).toBe("https://127.0.0.1:52459");
    });

    it("refuses to be pointed at a host that is not loopback", () => {
        expect(
            () =>
                new LcuClient({
                    credentials: CREDENTIALS,
                    host: "bucket.draftgap.com",
                    transport: vi.fn(),
                }),
        ).toThrow(/loopback/);
    });

    it("reads the current summoner", async () => {
        const { client, calls } = makeClient(() =>
            json({
                puuid: "abc",
                gameName: "Sona",
                tagLine: "EUW",
                summonerLevel: 300,
            }),
        );

        await expect(client.getCurrentSummoner()).resolves.toMatchObject({
            puuid: "abc",
            gameName: "Sona",
        });
        expect(calls[0]?.path).toBe("/lol-summoner/v1/current-summoner");
    });

    it("treats a 404 as a state, not a failure", async () => {
        const { client } = makeClient(() => ({
            status: 404,
            body: JSON.stringify({
                errorCode: "RPC_ERROR",
                httpStatus: 404,
                message: "No active delegate",
            }),
        }));

        await expect(client.getChampSelectSession()).resolves.toBeNull();
        await expect(client.getCurrentSummoner()).resolves.toBeNull();
        await expect(client.getRankedStats("puuid-1")).resolves.toBeNull();
    });

    it("throws a typed error for any other failure status", async () => {
        const { client } = makeClient(() => ({
            status: 500,
            body: JSON.stringify({ errorCode: "INTERNAL_ERROR", message: "boom" }),
        }));

        const failure = client.getGameflowPhase();
        await expect(failure).rejects.toBeInstanceOf(LcuHttpError);
        await expect(failure).rejects.toMatchObject({
            status: 500,
            errorCode: "INTERNAL_ERROR",
            path: "/lol-gameflow/v1/gameflow-phase",
        });
    });

    it("reads the gameflow phase, which is a bare JSON string", async () => {
        const { client } = makeClient(() => ({ status: 200, body: '"ChampSelect"' }));
        await expect(client.getGameflowPhase()).resolves.toBe("ChampSelect");
    });

    it("returns empty lists rather than null for the champion endpoints", async () => {
        const { client, calls } = makeClient(() => ({ status: 404, body: "" }));

        await expect(client.getGridChampions()).resolves.toEqual([]);
        await expect(client.getPickableChampionIds()).resolves.toEqual([]);
        await expect(client.getBannableChampionIds()).resolves.toEqual([]);
        await expect(client.getOwnedChampions()).resolves.toEqual([]);

        expect(calls.map((call) => call.path)).toEqual([
            "/lol-champ-select/v1/all-grid-champions",
            "/lol-champ-select/v1/pickable-champion-ids",
            "/lol-champ-select/v1/bannable-champion-ids",
            "/lol-champions/v1/owned-champions-minimal",
        ]);
    });

    it("reads pickable and bannable ids", async () => {
        const { client } = makeClient((request) =>
            request.path.includes("pickable") ? json([103, 64]) : json([238]),
        );

        await expect(client.getPickableChampionIds()).resolves.toEqual([103, 64]);
        await expect(client.getBannableChampionIds()).resolves.toEqual([238]);
    });

    it("reads ranked stats for a puuid and for the current summoner", async () => {
        const { client, calls } = makeClient(() =>
            json({
                queueMap: { RANKED_SOLO_5x5: { tier: "EMERALD", division: "II" } },
            }),
        );

        await client.getRankedStats("a b/c");
        await client.getCurrentSummonerRanked();

        expect(calls[0]?.path).toBe("/lol-ranked/v1/ranked-stats/a%20b%2Fc");
        expect(calls[1]?.path).toBe("/lol-ranked/v1/current-ranked-stats");
    });

    it("reads the gameflow session", async () => {
        const { client } = makeClient(() => json({ phase: "ChampSelect" }));
        await expect(client.getGameflowSession()).resolves.toMatchObject({
            phase: "ChampSelect",
        });
    });

    it("exposes generic verbs with JSON bodies", async () => {
        const { client, calls } = makeClient(() => json({ ok: true }));

        await client.post("/lol-lobby/v2/lobby", { queueId: 420 });
        await client.patch("/anything", { a: 1 });
        await client.put("/anything", { a: 1 });
        await client.delete("/anything");

        expect(calls[0]).toMatchObject({
            method: "POST",
            path: "/lol-lobby/v2/lobby",
            body: '{"queueId":420}',
        });
        expect(calls[0]?.headers["content-type"]).toBe("application/json");
        expect(calls[0]?.headers["content-length"]).toBe("15");
        expect(calls.map((call) => call.method)).toEqual([
            "POST",
            "PATCH",
            "PUT",
            "DELETE",
        ]);
    });

    it("accepts an empty body from a 204", async () => {
        const { client } = makeClient(() => ({ status: 204, body: "" }));
        await expect(client.post("/x", { a: 1 })).resolves.toBeUndefined();
    });

    it("reports a body that is not JSON", async () => {
        const { client } = makeClient(() => ({ status: 200, body: "<html>nope" }));
        await expect(client.get("/x")).rejects.toBeInstanceOf(LcuParseError);
    });

    it("pings without throwing when the client vanished", async () => {
        const { client } = makeClient(() => {
            throw new LcuConnectionError("gone", { code: "ECONNREFUSED" });
        });
        await expect(client.ping()).resolves.toBe(false);
    });

    it("pings true when the client answers", async () => {
        const { client } = makeClient(() => ({ status: 200, body: '"None"' }));
        await expect(client.ping()).resolves.toBe(true);
    });

    it("passes per-call timeouts and abort signals through", async () => {
        const { client, calls } = makeClient(() => json({}));
        const controller = new AbortController();

        await client.get("/x", { timeoutMs: 250, signal: controller.signal });

        expect(calls[0]?.timeoutMs).toBe(250);
        expect(calls[0]?.signal).toBe(controller.signal);
    });

    describe("actions", () => {
        it("refuses to hover a champion unless actions are explicitly allowed", async () => {
            const { client, transport } = makeClient(() => json({}));

            await expect(client.hoverChampion(11, 103)).rejects.toBeInstanceOf(
                LcuActionsDisabledError,
            );
            await expect(client.hoverChampion(11, 103)).rejects.toThrow(/scripting/);
            expect(transport).not.toHaveBeenCalled();
            expect(client.allowActions).toBe(false);
        });

        it("hovers through a PATCH on the action once enabled", async () => {
            const { client, calls } = makeClient(
                () => ({ status: 204, body: "" }),
                true,
            );

            await client.hoverChampion(11, 103);

            expect(calls[0]).toMatchObject({
                method: "PATCH",
                path: "/lol-champ-select/v1/session/actions/11",
                body: '{"championId":103}',
            });
        });

        it("exposes no auto-pick, auto-ban or auto-accept", () => {
            const surface = Object.getOwnPropertyNames(LcuClient.prototype);
            expect(surface).not.toContain("pickChampion");
            expect(surface).not.toContain("banChampion");
            expect(surface).not.toContain("acceptMatch");
            expect(surface).toContain("hoverChampion");
        });
    });

    it("closes without an owned agent when a transport was injected", () => {
        const { client } = makeClient(() => json({}));
        expect(() => client.close()).not.toThrow();
    });

    it("builds from credentials", () => {
        const client = LcuClient.fromCredentials(CREDENTIALS, {
            transport: vi.fn(),
        });
        expect(client.credentials).toBe(CREDENTIALS);
    });
});
