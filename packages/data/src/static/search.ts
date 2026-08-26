import { CHAMPION_ALIASES } from "./aliases.js";
import type { StaticChampion, StaticData } from "./types.js";

/**
 * A tiny in-memory champion search index.
 *
 * Champion pickers are typed into constantly, so matching has to be forgiving:
 * "mf", "MissF", "miss fortune", "fortune" and "Miss Fortune" must all find
 * the same champion, and the best match must come first.
 */

export type ChampionSearchResult = {
    champion: StaticChampion;
    /** Higher is better. Exact id/name matches score highest. */
    score: number;
    /** Which field produced the match. */
    matchedOn: "alias" | "name" | "id" | "initials" | "prefix" | "substring";
};

export type ChampionSearchIndex = {
    /** Ranked matches for `query`. An empty query returns every champion. */
    search(query: string, limit?: number): ChampionSearchResult[];
    /** The single best match, or `undefined`. */
    best(query: string): StaticChampion | undefined;
    /** Every alias registered for a champion (including generated ones). */
    aliasesFor(championId: string): string[];
};

type IndexEntry = {
    champion: StaticChampion;
    normalizedName: string;
    normalizedId: string;
    /** Alias -> score bonus. */
    aliases: Map<string, number>;
    /** "mf" for Miss Fortune, "tk" for Tahm Kench. */
    initials: string;
    /** Words of the display name, normalized. */
    words: string[];
};

/** Lowercases and strips everything that is not a letter or a digit. */
export function normalizeQuery(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Splits a champion name into words: "Miss Fortune" -> ["miss", "fortune"]. */
function nameWords(name: string): string[] {
    return name
        .split(/[\s'._&-]+/)
        .map(normalizeQuery)
        .filter((word) => word.length > 0);
}

/**
 * Initials of a champion name. Single-word names contribute their first two
 * letters ("Warwick" -> "ww" only via the alias table, so single-word names
 * yield just their first letter here and rely on prefix matching instead).
 */
function initialsOf(words: string[]): string {
    if (words.length < 2) return "";
    return words.map((word) => word[0]).join("");
}

export function createChampionSearchIndex(
    champions: Iterable<StaticChampion>,
): ChampionSearchIndex {
    const entries: IndexEntry[] = [];

    for (const champion of champions) {
        const words = nameWords(champion.name);
        const aliases = new Map<string, number>();

        const add = (alias: string, bonus: number) => {
            const normalized = normalizeQuery(alias);
            if (normalized.length === 0) return;
            const existing = aliases.get(normalized);
            if (existing === undefined || existing < bonus) {
                aliases.set(normalized, bonus);
            }
        };

        for (const alias of CHAMPION_ALIASES[champion.id] ?? []) add(alias, 100);
        // Data Dragon's id and name are always usable as aliases.
        add(champion.id, 100);
        add(champion.name, 100);
        // Individual words: "fortune", "sol", "kench".
        for (const word of words) if (word.length >= 3) add(word, 60);

        const initials = initialsOf(words);
        if (initials.length >= 2) add(initials, 90);

        entries.push({
            champion,
            normalizedName: normalizeQuery(champion.name),
            normalizedId: normalizeQuery(champion.id),
            aliases,
            initials,
            words,
        });
    }

    entries.sort((a, b) => a.champion.name.localeCompare(b.champion.name));

    function search(query: string, limit = 25): ChampionSearchResult[] {
        const normalized = normalizeQuery(query);
        if (normalized.length === 0) {
            return entries.slice(0, limit).map((entry) => ({
                champion: entry.champion,
                score: 0,
                matchedOn: "name" as const,
            }));
        }

        const results: ChampionSearchResult[] = [];

        for (const entry of entries) {
            const scored = scoreEntry(entry, normalized);
            if (scored) results.push(scored);
        }

        results.sort(
            (a, b) =>
                b.score - a.score || a.champion.name.localeCompare(b.champion.name),
        );

        return results.slice(0, limit);
    }

    return {
        search,
        best: (query) => search(query, 1)[0]?.champion,
        aliasesFor: (championId) => {
            const entry = entries.find((e) => e.champion.id === championId);
            return entry ? [...entry.aliases.keys()].sort() : [];
        },
    };
}

function scoreEntry(
    entry: IndexEntry,
    query: string,
): ChampionSearchResult | undefined {
    const aliasBonus = entry.aliases.get(query);
    if (aliasBonus !== undefined) {
        const isCanonical =
            query === entry.normalizedName || query === entry.normalizedId;
        const matchedOn = isCanonical
            ? query === entry.normalizedId
                ? "id"
                : "name"
            : query === entry.initials
              ? "initials"
              : "alias";
        return {
            champion: entry.champion,
            // An exact hit on the full name beats an exact hit on a nickname.
            score: 1000 + aliasBonus + (isCanonical ? 50 : 0),
            matchedOn,
        };
    }

    if (
        entry.normalizedName.startsWith(query) ||
        entry.normalizedId.startsWith(query)
    ) {
        // Shorter names win: "zed" should not be beaten by "Zeri" for "ze".
        return {
            champion: entry.champion,
            score: 800 - (entry.normalizedName.length - query.length),
            matchedOn: "prefix",
        };
    }

    for (const word of entry.words) {
        if (word.startsWith(query)) {
            return {
                champion: entry.champion,
                score: 600 - (word.length - query.length),
                matchedOn: "prefix",
            };
        }
    }

    // Alias prefixes: "aurel" -> "aurelionsol".
    for (const alias of entry.aliases.keys()) {
        if (alias.startsWith(query)) {
            return {
                champion: entry.champion,
                score: 500 - (alias.length - query.length),
                matchedOn: "alias",
            };
        }
    }

    const index = entry.normalizedName.indexOf(query);
    if (index >= 0) {
        return {
            champion: entry.champion,
            score: 300 - index,
            matchedOn: "substring",
        };
    }

    return undefined;
}

let defaultIndex: { source: StaticData; index: ChampionSearchIndex } | undefined;

/**
 * Convenience wrapper around {@link createChampionSearchIndex} that memoizes
 * one index per {@link StaticData} instance.
 */
export function searchChampions(
    staticData: StaticData,
    query: string,
    limit?: number,
): ChampionSearchResult[] {
    if (!defaultIndex || defaultIndex.source !== staticData) {
        defaultIndex = {
            source: staticData,
            index: createChampionSearchIndex(staticData.championList),
        };
    }
    return defaultIndex.index.search(query, limit);
}
