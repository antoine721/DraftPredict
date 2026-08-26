import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RiotApiClient } from "./client.js";
import { RiotAuthError, RiotNotFoundError, RiotRateLimitError } from "./errors.js";
import { summarizeMatch } from "./match/summary.js";
import { profilePlaystyle } from "./playstyle/profile.js";
import { makeMatch } from "./testing/fixtures.js";

/**
 * End-to-end network test against a local stand-in for the Riot API.
 *
 * Every other test in this package injects a fake `fetch`, which proves the
 * logic but never the wire: URL construction, header transmission, status
 * handling and JSON parsing all stay theoretical. This one runs a real HTTP
 * server on the loopback interface and drives the real client at it, so the
 * request genuinely leaves the process.
 *
 * The only thing it cannot prove is what Riot itself answers. That has to
 * happen on a machine that can reach `api.riotgames.com` with a valid key.
 */

const API_KEY = "RGAPI-00000000-1111-2222-3333-444444444444";
const PUUID = "puuid-under-test";
const UNKNOWN_PUUID = "puuid-that-does-not-exist";

/** Requests the stand-in server received, for assertions after the fact. */
type Seen = { path: string; token: string | null; host: string };

let server: Server;
let port: number;
let seen: Seen[] = [];
/** Flipped by individual tests to make the next call fail a given way. */
let failWith: "none" | "401" | "429" = "none";
let rateLimitedOnce = false;

beforeAll(async () => {
    server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        seen.push({
            path: url.pathname,
            token: request.headers["x-riot-token"] as string | null,
            host: (request.headers["x-forwarded-host"] as string) ?? "",
        });

        const send = (
            status: number,
            body: unknown,
            headers: Record<string, string> = {},
        ) => {
            response.writeHead(status, {
                "content-type": "application/json",
                ...headers,
            });
            response.end(JSON.stringify(body));
        };

        if (failWith === "401") {
            send(401, { status: { status_code: 401, message: "Unauthorized" } });
            return;
        }
        if (failWith === "429" && !rateLimitedOnce) {
            rateLimitedOnce = true;
            send(
                429,
                { status: { status_code: 429, message: "Rate limit exceeded" } },
                { "retry-after": "0", "x-rate-limit-type": "application" },
            );
            return;
        }

        const path = url.pathname;

        if (path.startsWith("/riot/account/v1/accounts/by-riot-id/")) {
            const [tagLine, gameName] = path.split("/").reverse();
            send(200, {
                puuid: PUUID,
                gameName: decodeURIComponent(gameName ?? ""),
                tagLine: decodeURIComponent(tagLine ?? ""),
            });
            return;
        }
        if (path.startsWith("/lol/summoner/v4/summoners/by-puuid/")) {
            if (path.endsWith(UNKNOWN_PUUID)) {
                send(404, { status: { status_code: 404, message: "Data not found" } });
                return;
            }
            send(200, {
                puuid: PUUID,
                profileIconId: 4568,
                revisionDate: 1_700_000_000_000,
                summonerLevel: 340,
            });
            return;
        }
        if (path.startsWith("/lol/league/v4/entries/by-puuid/")) {
            send(200, [
                {
                    queueType: "RANKED_SOLO_5x5",
                    tier: "EMERALD",
                    rank: "II",
                    leaguePoints: 63,
                    wins: 118,
                    losses: 104,
                    hotStreak: false,
                    veteran: false,
                    freshBlood: false,
                    inactive: false,
                },
            ]);
            return;
        }
        if (path.startsWith("/lol/champion-mastery/v4/champion-masteries/by-puuid/")) {
            send(200, [
                {
                    championId: 103,
                    championLevel: 7,
                    championPoints: 210_000,
                    puuid: PUUID,
                },
            ]);
            return;
        }
        if (path.endsWith("/ids")) {
            send(200, ["EUW1_1234567890"]);
            return;
        }
        if (path.startsWith("/lol/match/v5/matches/")) {
            const match = makeMatch({ matchId: "EUW1_1234567890" });
            // Put the account under test in the match so summarize has a subject.
            match.info.participants[2]!.puuid = PUUID;
            match.metadata.participants[2] = PUUID;
            send(200, match);
            return;
        }
        if (path.startsWith("/lol/spectator/v5/active-games/by-summoner/")) {
            send(404, { status: { status_code: 404, message: "Data not found" } });
            return;
        }
        send(404, { status: { status_code: 404, message: "Unknown route" } });
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
});

/**
 * The real client builds `https://euw1.api.riotgames.com/...`. Rewrite only
 * the origin so the path, query and headers it produced are what the server
 * actually receives — and record the host it meant to reach.
 */
function loopbackFetch(): typeof fetch {
    return ((input: string | URL | Request, init?: RequestInit) => {
        const original = new URL(typeof input === "string" ? input : String(input));
        const rewritten = new URL(
            `http://127.0.0.1:${port}${original.pathname}${original.search}`,
        );
        const headers = new Headers(init?.headers);
        headers.set("x-forwarded-host", original.host);
        return fetch(rewritten, { ...init, headers });
    }) as typeof fetch;
}

function makeClient() {
    return new RiotApiClient({
        apiKey: API_KEY,
        platform: "euw1",
        fetch: loopbackFetch(),
    });
}

describe("Riot client over a real socket", () => {
    it("carries the key and the right host on every call, and parses each answer", async () => {
        seen = [];
        failWith = "none";
        const client = makeClient();

        const account = await client.account.byRiotId("Nom", "EUW");
        expect(account).toMatchObject({
            puuid: PUUID,
            gameName: "Nom",
            tagLine: "EUW",
        });

        const summoner = await client.summoner.byPuuid(PUUID);
        expect(summoner.summonerLevel).toBe(340);

        const ranked = await client.league.ranksByPuuid(PUUID);
        expect(ranked.solo).toMatchObject({
            tier: "EMERALD",
            rank: "II",
            leaguePoints: 63,
        });

        const mastery = await client.championMastery.topByPuuid(PUUID, 5);
        expect(mastery[0]?.championId).toBe(103);

        const ids = await client.match.idsByPuuid(PUUID, { count: 1 });
        expect(ids).toEqual(["EUW1_1234567890"]);

        const match = await client.match.byId(ids[0]!);
        const summary = summarizeMatch(match, PUUID);
        expect(summary?.matchId).toBe("EUW1_1234567890");
        // Ten players, both drafts reconstructed: this is what feeds the engine.
        expect(summary?.draft.ally).toHaveLength(5);
        expect(summary?.draft.opponent).toHaveLength(5);

        // A 404 from spectator means "not in game", not a failure.
        await expect(client.spectator.activeGameByPuuid(PUUID)).resolves.toBeNull();

        // The key travelled on every single request, and the account and match
        // routes went to the regional host while the rest went to the platform.
        expect(seen.length).toBeGreaterThanOrEqual(7);
        expect(seen.every((entry) => entry.token === API_KEY)).toBe(true);
        expect(seen[0]?.host).toBe("europe.api.riotgames.com");
        expect(seen[1]?.host).toBe("euw1.api.riotgames.com");
    });

    it("builds a playstyle profile from what the wire returned", async () => {
        seen = [];
        failWith = "none";
        const client = makeClient();

        const ids = await client.match.idsByPuuid(PUUID, { count: 3 });
        const summaries = [];
        for (const id of ids) {
            const match = await client.match.byId(id);
            const summary = summarizeMatch(match, PUUID);
            if (summary) summaries.push(summary);
        }

        const profile = profilePlaystyle(summaries);
        expect(profile.matchesAnalyzed).toBe(summaries.length);
        expect(Object.keys(profile.axes)).toHaveLength(8);
        for (const score of Object.values(profile.axes)) {
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
        }
        expect(profile.archetype.key).toBeTruthy();
    });

    it("turns a 401 into an auth error without leaking the key", async () => {
        failWith = "401";
        const client = makeClient();

        const failure = await client.summoner
            .byPuuid(PUUID)
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(RiotAuthError);
        // This is the exact path a user hits with an expired development key.
        const serialised = `${String(failure)} ${JSON.stringify(failure)}`;
        expect(serialised).not.toContain(API_KEY);
        failWith = "none";
    });

    it("retries a 429 once the rate limit clears", async () => {
        failWith = "429";
        rateLimitedOnce = false;
        const client = makeClient();

        const summoner = await client.summoner.byPuuid(PUUID);

        expect(summoner.summonerLevel).toBe(340);
        expect(rateLimitedOnce).toBe(true);
        failWith = "none";
    });

    it("surfaces a genuine 404 as a not-found error", async () => {
        failWith = "none";
        const client = makeClient();

        const failure = await client.summoner
            .byPuuid(UNKNOWN_PUUID)
            .catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(RiotNotFoundError);
        expect(failure).not.toBeInstanceOf(RiotRateLimitError);
    });
});
