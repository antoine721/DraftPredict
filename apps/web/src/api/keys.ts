import type {
    BansRequest,
    BuildsQuery,
    DatasetQuery,
    DraftRequest,
    SuggestionsRequest,
} from "./types";

/**
 * TanStack Query keys, in one place so a mutation can invalidate exactly what
 * it changed. Every key starts with a stable domain segment, so
 * `invalidateQueries({ queryKey: queryKeys.account.all })` works.
 */

/** Stable JSON for a request body — key equality must not depend on key order. */
export function stableKey(value: unknown): string {
    return JSON.stringify(value, (_key, entry: unknown) => {
        if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
            const record = entry as Record<string, unknown>;
            return Object.keys(record)
                .sort()
                .reduce<Record<string, unknown>>((sorted, key) => {
                    if (record[key] !== undefined) sorted[key] = record[key];
                    return sorted;
                }, {});
        }
        return entry;
    });
}

export const queryKeys = {
    health: ["health"] as const,

    config: ["config"] as const,

    static: {
        all: ["static"] as const,
        summary: ["static", "summary"] as const,
        champions: ["static", "champions"] as const,
        items: ["static", "items"] as const,
        runes: ["static", "runes"] as const,
        summonerSpells: ["static", "summoner-spells"] as const,
        search: (query: string, limit?: number) =>
            ["static", "search", query, limit ?? 10] as const,
    },

    dataset: {
        all: ["dataset"] as const,
        query: (query: DatasetQuery) => ["dataset", stableKey(query)] as const,
        providers: ["dataset", "providers"] as const,
    },

    draft: {
        all: ["draft"] as const,
        analyze: (request: DraftRequest) =>
            ["draft", "analyze", stableKey(request)] as const,
        suggestions: (request: SuggestionsRequest) =>
            ["draft", "suggestions", stableKey(request)] as const,
        bans: (request: BansRequest) => ["draft", "bans", stableKey(request)] as const,
    },

    builds: {
        all: ["builds"] as const,
        one: (championKey: string, query: BuildsQuery) =>
            ["builds", championKey, stableKey(query)] as const,
    },

    account: {
        all: ["account"] as const,
        me: ["account", "me"] as const,
        lookup: (riotId: string, platform?: string) =>
            ["account", "lookup", riotId, platform ?? null] as const,
        profile: (puuid: string, platform?: string) =>
            ["account", puuid, "profile", platform ?? null] as const,
        matches: (puuid: string, count: number, platform?: string) =>
            ["account", puuid, "matches", count, platform ?? null] as const,
        playstyle: (puuid: string, count: number, platform?: string) =>
            ["account", puuid, "playstyle", count, platform ?? null] as const,
        live: (puuid: string, platform?: string) =>
            ["account", puuid, "live", platform ?? null] as const,
    },

    lcu: {
        all: ["lcu"] as const,
        status: ["lcu", "status"] as const,
        summoner: ["lcu", "summoner"] as const,
        champSelect: ["lcu", "champ-select"] as const,
    },
};
