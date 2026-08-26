import { afterEach, describe, expect, it, vi } from "vitest";
import { api, buildQuery, request } from "./client";
import { ApiError, isApiError, isRiotKeyMissing, toUserMessage } from "./errors";

/**
 * The fetch layer, against a stubbed `fetch`. Nothing here touches a network:
 * what is under test is the translation of HTTP into the app's error model.
 */

type Call = { url: string; init: RequestInit };

function stubFetch(
    responder: (call: Call) => { status?: number; body?: unknown; text?: string },
): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
        calls.push({ url, init });
        const { status = 200, body, text } = responder({ url, init });
        const payload = text ?? (body === undefined ? "" : JSON.stringify(body));
        return {
            ok: status >= 200 && status < 300,
            status,
            statusText: `HTTP ${status}`,
            text: async () => payload,
        } as unknown as Response;
    });
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("buildQuery", () => {
    it("drops empty values and encodes booleans as 1/0", () => {
        expect(
            buildQuery({ a: 1, b: undefined, c: null, d: "", e: true, f: false }),
        ).toBe("?a=1&e=1&f=0");
        expect(buildQuery({})).toBe("");
    });
});

describe("request", () => {
    it("returns the parsed body on success", async () => {
        stubFetch(() => ({ body: { status: "ok" } }));
        await expect(request<{ status: string }>("/api/health")).resolves.toEqual({
            status: "ok",
        });
    });

    it("turns the error envelope into an ApiError", async () => {
        stubFetch(() => ({
            status: 400,
            body: {
                error: {
                    code: "UNKNOWN_CHAMPION",
                    message: "Unknown champion key(s): 999999",
                    details: { championKeys: ["999999"] },
                },
            },
        }));

        const error = await request("/api/draft/analyze").catch((value) => value);
        expect(isApiError(error)).toBe(true);
        expect((error as ApiError).code).toBe("UNKNOWN_CHAMPION");
        expect((error as ApiError).status).toBe(400);
        expect((error as ApiError).details).toEqual({ championKeys: ["999999"] });
        expect((error as ApiError).isRetryable).toBe(false);
    });

    it("treats 428 as the connect-your-account signal", async () => {
        stubFetch(() => ({
            status: 428,
            body: { error: { code: "RIOT_KEY_MISSING", message: "No Riot API key" } },
        }));

        const error = await api.account.profile("puuid-1").catch((value) => value);
        expect(isRiotKeyMissing(error)).toBe(true);
        expect((error as ApiError).isRetryable).toBe(false);
        expect(toUserMessage(error)).toBe("Aucune clé d'API Riot n'est configurée.");
    });

    it("normalises a dead server into NETWORK_ERROR", async () => {
        vi.stubGlobal("fetch", async () => {
            throw new TypeError("Failed to fetch");
        });
        const error = await api.health().catch((value) => value);
        expect((error as ApiError).code).toBe("NETWORK_ERROR");
        expect((error as ApiError).isNetwork).toBe(true);
        expect((error as ApiError).isRetryable).toBe(true);
        expect(toUserMessage(error)).toBe("Le serveur DraftPredict est injoignable.");
    });

    it("survives a non-JSON error body", async () => {
        stubFetch(() => ({ status: 502, text: "<html>bad gateway</html>" }));
        const error = await api.health().catch((value) => value);
        expect((error as ApiError).code).toBe("HTTP_502");
        expect((error as ApiError).isRetryable).toBe(true);
    });

    it("reports every DATASET_* code as a data-source failure", () => {
        const error = new ApiError({
            code: "DATASET_NETWORK",
            message: "…",
            status: 503,
        });
        expect(error.isDatasetUnavailable).toBe(true);
        expect(toUserMessage(error)).toBe(
            "Aucune source de données n'a pu être chargée.",
        );
    });
});

describe("routes", () => {
    it("builds the documented URLs", async () => {
        const calls = stubFetch(() => ({ body: {} }));

        await api.static.search("mf", 5);
        await api.account.lookup("Nom#TAG", "euw1");
        await api.builds("Aatrox", { role: 0, vs: "64:1,157:2" });
        await api.account.matches("puuid-1", { count: 20, refresh: true });
        await api.dataset.get({ rank: "DIAMOND_PLUS", include: "meta" });

        expect(calls.map((call) => call.url)).toEqual([
            "/api/static/search?q=mf&limit=5",
            "/api/account/lookup?riotId=Nom%23TAG&platform=euw1",
            "/api/builds/Aatrox?role=0&vs=64%3A1%2C157%3A2",
            "/api/account/puuid-1/matches?count=20&refresh=1",
            "/api/dataset?rank=DIAMOND_PLUS&include=meta",
        ]);
    });

    it("sends JSON bodies with the right content type", async () => {
        const calls = stubFetch(() => ({ body: {} }));
        await api.draft.analyze({ team: [[0, "266"]], enemy: [] });
        const [call] = calls;
        expect(call!.init.method).toBe("POST");
        expect((call!.init.headers as Record<string, string>)["Content-Type"]).toBe(
            "application/json",
        );
        expect(JSON.parse(call!.init.body as string)).toEqual({
            team: [[0, "266"]],
            enemy: [],
        });
    });

    it("propagates an abort instead of wrapping it", async () => {
        vi.stubGlobal("fetch", async () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            throw error;
        });
        const error = await api.health().catch((value) => value);
        expect(isApiError(error)).toBe(false);
        expect((error as Error).name).toBe("AbortError");
        expect(toUserMessage(error)).toBe("Requête annulée.");
    });
});
