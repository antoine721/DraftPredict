import { describe, expect, it } from "vitest";
import {
    createChampionSearchIndex,
    normalizeQuery,
    searchChampions,
} from "./search.js";
import { loadStaticData } from "./load.js";

const staticData = loadStaticData();
const index = createChampionSearchIndex(staticData.championList);

const best = (query: string) => index.best(query)?.name;

describe("champion search", () => {
    it("resolves the abbreviations people actually type", () => {
        expect(best("mf")).toBe("Miss Fortune");
        expect(best("asol")).toBe("Aurelion Sol");
        expect(best("j4")).toBe("Jarvan IV");
        expect(best("tf")).toBe("Twisted Fate");
        expect(best("kha")).toBe("Kha'Zix");
        expect(best("yi")).toBe("Master Yi");
        expect(best("ww")).toBe("Warwick");
        expect(best("gp")).toBe("Gangplank");
        expect(best("nunu")).toBe("Nunu & Willump");
        expect(best("wukong")).toBe("Wukong");
        expect(best("blindmonk")).toBe("Lee Sin");
        expect(best("kench")).toBe("Tahm Kench");
    });

    it("matches full names, Data Dragon ids and punctuation-free spellings", () => {
        expect(best("Zed")).toBe("Zed");
        expect(best("MonkeyKing")).toBe("Wukong");
        expect(best("kai'sa")).toBe("Kai'Sa");
        expect(best("kaisa")).toBe("Kai'Sa");
        expect(best("miss fortune")).toBe("Miss Fortune");
        expect(best("MISS FORTUNE")).toBe("Miss Fortune");
        expect(best("dr mundo")).toBe("Dr. Mundo");
    });

    it("prefers prefixes and puts the shortest name first", () => {
        expect(best("aat")).toBe("Aatrox");
        expect(best("lee")).toBe("Lee Sin");
        const results = index.search("ka", 5);
        expect(results.length).toBeGreaterThan(1);
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });

    it("reports how a champion was matched", () => {
        expect(index.search("mf", 1)[0].matchedOn).toBe("initials");
        expect(index.search("asol", 1)[0].matchedOn).toBe("alias");
        expect(index.search("Zed", 1)[0].matchedOn).toBe("id");
    });

    it("returns nothing for gibberish and everything for an empty query", () => {
        expect(index.search("qzxwv")).toEqual([]);
        expect(index.search("", 1000)).toHaveLength(staticData.championList.length);
    });

    it("honours the limit", () => {
        expect(index.search("a", 3)).toHaveLength(3);
    });

    it("exposes the aliases registered for a champion", () => {
        expect(index.aliasesFor("MissFortune")).toEqual(
            expect.arrayContaining(["mf", "missfortune", "fortune"]),
        );
    });

    it("has a convenience wrapper bound to a StaticData instance", () => {
        expect(searchChampions(staticData, "asol", 1)[0].champion.id).toBe(
            "AurelionSol",
        );
    });

    it("normalizes queries down to letters and digits", () => {
        expect(normalizeQuery(" Kai'Sa! ")).toBe("kaisa");
        expect(normalizeQuery("J4")).toBe("j4");
    });
});
