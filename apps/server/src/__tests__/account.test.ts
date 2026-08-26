import { afterEach, describe, expect, it } from "vitest";
import type { TestApp } from "../testing/harness.js";
import { FAKE_API_KEY, createTestApp, fakeRiotFetch } from "../testing/harness.js";

let harness: TestApp | undefined;

afterEach(async () => {
    await harness?.close();
    harness = undefined;
});

describe("account routes without a Riot API key", () => {
    it("answers 428 RIOT_KEY_MISSING on lookup", async () => {
        harness = await createTestApp();

        const response = await harness.app.inject({
            url: "/api/account/lookup?riotId=Faker%23KR1",
        });

        expect(response.statusCode).toBe(428);
        expect(response.json().error.code).toBe("RIOT_KEY_MISSING");
        expect(response.json().error.message).toContain("Riot API key");
    });

    it.each([
        "/api/account/abc/profile",
        "/api/account/abc/matches",
        "/api/account/abc/playstyle",
        "/api/account/abc/live",
    ])("answers 428 on %s", async (url) => {
        harness = await createTestApp();

        const response = await harness.app.inject({ url });

        expect(response.statusCode).toBe(428);
        expect(response.json().error.code).toBe("RIOT_KEY_MISSING");
    });
});

describe("account routes with a key", () => {
    it("resolves a Riot ID", async () => {
        harness = await createTestApp({
            env: { RIOT_API_KEY: FAKE_API_KEY },
            riotFetch: fakeRiotFetch([
                {
                    match: "/riot/account/v1/accounts/by-riot-id/",
                    body: { puuid: "puuid-1", gameName: "Faker", tagLine: "KR1" },
                },
            ]),
        });

        const response = await harness.app.inject({
            url: "/api/account/lookup?riotId=Faker%23KR1&platform=kr",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            puuid: "puuid-1",
            gameName: "Faker",
            tagLine: "KR1",
            platform: "kr",
        });
    });

    it("rejects a malformed Riot ID before calling Riot", async () => {
        harness = await createTestApp({
            env: { RIOT_API_KEY: FAKE_API_KEY },
            riotFetch: fakeRiotFetch([]),
        });

        const response = await harness.app.inject({
            url: "/api/account/lookup?riotId=NoTagHere",
        });

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe("INVALID_RIOT_ID");
    });

    it("maps a Riot 404 onto the error envelope without leaking the key", async () => {
        harness = await createTestApp({
            env: { RIOT_API_KEY: FAKE_API_KEY },
            riotFetch: fakeRiotFetch([
                {
                    match: "/riot/account/v1/accounts/by-riot-id/",
                    status: 404,
                    body: { status: { message: "Data not found" } },
                },
            ]),
        });

        const response = await harness.app.inject({
            url: "/api/account/lookup?riotId=Nobody%23XXX",
        });

        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe("NOT_FOUND");
        expect(response.body).not.toContain(FAKE_API_KEY);
    });

    it("reports a player who is not in a game", async () => {
        harness = await createTestApp({
            env: { RIOT_API_KEY: FAKE_API_KEY },
            riotFetch: fakeRiotFetch([
                {
                    match: "/lol/spectator/v5/active-games/",
                    status: 404,
                    body: { status: { message: "not found" } },
                },
            ]),
        });

        const response = await harness.app.inject({
            url: "/api/account/puuid-1/live",
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().inGame).toBe(false);
        expect(response.json().analysis).toBeNull();
        // Even the "no game" answer says which dataset would have been used.
        expect(response.json().dataset.provider).toBe("bundled-fixture");
    });
});
