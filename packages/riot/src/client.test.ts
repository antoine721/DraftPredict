import { describe, expect, it } from "vitest";

import { RiotApiClient } from "./client.js";
import { RiotApiError } from "./errors.js";
import { mockFetch, type MockResponse } from "./testing/mock-fetch.js";

const KEY = "RGAPI-12345678-90ab-cdef-1234-567890abcdef";

function makeClient(responses: readonly MockResponse[] = [{ body: {} }]) {
    const fetch = mockFetch(responses);
    let now = 0;
    const client = new RiotApiClient({
        apiKey: KEY,
        platform: "euw1",
        fetch: fetch.fetch,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
        },
        jitter: () => 1,
        timeoutMs: 0,
    });
    return { client, fetch };
}

const lastUrl = (fetch: ReturnType<typeof mockFetch>): string =>
    fetch.calls[fetch.calls.length - 1]!.url;

describe("RiotApiClient routing", () => {
    it("rejects an unknown platform", () => {
        expect(() => new RiotApiClient({ apiKey: KEY, platform: "atlantis1" })).toThrow(
            RiotApiError,
        );
    });

    it("accepts a region code and resolves the regional route", () => {
        const client = new RiotApiClient({
            apiKey: KEY,
            platform: "EUW",
            fetch: mockFetch([{ body: {} }]).fetch,
        });
        expect(client.platform).toBe("euw1");
        expect(client.regional).toBe("europe");
    });

    it("shares the limiter and cache with a sibling platform client", () => {
        const { client } = makeClient();
        const kr = client.forPlatform("kr");
        expect(kr.platform).toBe("kr");
        expect(kr.regional).toBe("asia");
        expect(kr.rateLimiter).toBe(client.rateLimiter);
        expect(kr.cache).toBe(client.cache);
        expect(client.forPlatform("euw1")).toBe(client);
    });
});

describe("account-v1", () => {
    it("calls the regional host and encodes the Riot ID", async () => {
        const { client, fetch } = makeClient([
            { body: { puuid: "p1", gameName: "Hide on bush", tagLine: "KR1" } },
        ]);
        const account = await client.account.byRiotId("Hide on bush", "#KR1");
        expect(account.puuid).toBe("p1");
        expect(lastUrl(fetch)).toBe(
            "https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/Hide%20on%20bush/KR1",
        );
    });

    it("rejects an incomplete Riot ID without calling the API", async () => {
        const { client, fetch } = makeClient();
        await expect(client.account.byRiotId("Faker", "")).rejects.toBeInstanceOf(
            RiotApiError,
        );
        expect(fetch.count).toBe(0);
    });

    it("looks an account up by puuid", async () => {
        const { client, fetch } = makeClient([{ body: { puuid: "p1" } }]);
        await client.account.byPuuid("p1");
        expect(lastUrl(fetch)).toBe(
            "https://europe.api.riotgames.com/riot/account/v1/accounts/by-puuid/p1",
        );
    });
});

describe("summoner-v4, league-v4 and mastery", () => {
    it("uses the platform host for the summoner", async () => {
        const { client, fetch } = makeClient([{ body: { puuid: "p1" } }]);
        await client.summoner.byPuuid("p1");
        expect(lastUrl(fetch)).toBe(
            "https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/p1",
        );
    });

    it("splits ranked entries into solo and flex", async () => {
        const entries = [
            {
                queueType: "RANKED_FLEX_SR",
                tier: "GOLD",
                leaguePoints: 10,
                wins: 5,
                losses: 5,
            },
            {
                queueType: "RANKED_SOLO_5x5",
                tier: "EMERALD",
                leaguePoints: 42,
                wins: 60,
                losses: 40,
            },
        ];
        const { client, fetch } = makeClient([{ body: entries }]);
        const ranks = await client.league.ranksByPuuid("p1");
        expect(ranks.solo?.tier).toBe("EMERALD");
        expect(ranks.flex?.tier).toBe("GOLD");
        expect(ranks.entries).toHaveLength(2);
        expect(lastUrl(fetch)).toBe(
            "https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/p1",
        );
    });

    it("asks for the top mastery champions", async () => {
        const { client, fetch } = makeClient([{ body: [] }]);
        await client.championMastery.topByPuuid("p1", 5);
        expect(lastUrl(fetch)).toBe(
            "https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/p1/top?count=5",
        );
        await client.championMastery.scoreByPuuid("p1");
        expect(lastUrl(fetch)).toBe(
            "https://euw1.api.riotgames.com/lol/champion-mastery/v4/scores/by-puuid/p1",
        );
    });
});

describe("match-v5", () => {
    it("passes only the given query parameters", async () => {
        const { client, fetch } = makeClient([{ body: [] }]);
        await client.match.idsByPuuid("p1", { start: 0, count: 20, queue: 420 });
        expect(lastUrl(fetch)).toBe(
            "https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/p1/ids?start=0&count=20&queue=420",
        );
        await client.match.idsByPuuid("p1", {
            count: 5,
            type: "ranked",
            startTime: 1700,
        });
        expect(lastUrl(fetch)).toBe(
            "https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/p1/ids?count=5&type=ranked&startTime=1700",
        );
    });

    it("fetches a match and its timeline from the regional host", async () => {
        const { client, fetch } = makeClient([{ body: { metadata: {}, info: {} } }]);
        await client.match.byId("EUW1_1");
        expect(lastUrl(fetch)).toBe(
            "https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_1",
        );
        await client.match.timelineById("EUW1_1");
        expect(lastUrl(fetch)).toBe(
            "https://europe.api.riotgames.com/lol/match/v5/matches/EUW1_1/timeline",
        );
    });

    it("resolves recent matches and skips missing ones", async () => {
        const { client, fetch } = makeClient([
            { body: ["EUW1_1", "EUW1_2", "EUW1_3"] },
            { body: { metadata: { matchId: "EUW1_1" } } },
            { status: 404 },
            { body: { metadata: { matchId: "EUW1_3" } } },
        ]);
        const matches = await client.match.recentByPuuid("p1", { count: 3 });
        expect(matches.map((match) => match.metadata.matchId)).toEqual([
            "EUW1_1",
            "EUW1_3",
        ]);
        expect(fetch.count).toBe(4);
    });
});

describe("spectator-v5", () => {
    it("returns null when the player is not in a game", async () => {
        const { client, fetch } = makeClient([{ status: 404 }]);
        await expect(client.spectator.activeGameByPuuid("p1")).resolves.toBeNull();
        expect(lastUrl(fetch)).toBe(
            "https://euw1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/p1",
        );
    });

    it("returns the live game when there is one", async () => {
        const { client } = makeClient([{ body: { gameId: 42, participants: [] } }]);
        const game = await client.spectator.activeGameByPuuid("p1");
        expect(game?.gameId).toBe(42);
    });

    it("lists featured games", async () => {
        const { client, fetch } = makeClient([
            { body: { gameList: [], clientRefreshInterval: 300 } },
        ]);
        await client.spectator.featuredGames();
        expect(lastUrl(fetch)).toBe(
            "https://euw1.api.riotgames.com/lol/spectator/v5/featured-games",
        );
    });
});

describe("shared infrastructure", () => {
    it("rate limits across endpoints", async () => {
        const fetch = mockFetch([{ body: {} }]);
        let now = 0;
        const client = new RiotApiClient({
            apiKey: KEY,
            platform: "euw1",
            fetch: fetch.fetch,
            now: () => now,
            sleep: async (ms) => {
                now += ms;
            },
            rateLimits: [{ requests: 2, seconds: 1 }],
            timeoutMs: 0,
            cache: false,
        });
        await client.summoner.byPuuid("p1");
        await client.account.byPuuid("p1");
        await client.spectator.featuredGames();
        expect(now).toBeGreaterThan(0);
    });

    it("never puts the key in a URL", async () => {
        const { client, fetch } = makeClient([{ body: { puuid: "p" } }]);
        await client.account.byRiotId("Faker", "KR1");
        for (const call of fetch.calls) {
            expect(call.url).not.toContain(KEY);
            expect(call.init.headers["X-Riot-Token"]).toBe(KEY);
        }
    });
});
