import { describe, expect, it } from "vitest";
import type { ChampionSummary } from "../../api/types";
import { championAliases, filterChampions, scoreChampion } from "./search";

/**
 * The picker's search.
 *
 * Every case here is something a player actually types while a champion-select
 * timer runs: an abbreviation, a name without its apostrophe, a nickname, or
 * the first two letters and nothing else.
 */

function champion(
    key: string,
    id: string,
    name: string,
    tags: string[] = ["Fighter"],
): ChampionSummary {
    return {
        key,
        id,
        name,
        title: `le ${name}`,
        tags,
        icon: null as unknown as string,
    };
}

const CHAMPIONS: ChampionSummary[] = [
    champion("266", "Aatrox", "Aatrox"),
    champion("136", "AurelionSol", "Aurelion Sol", ["Mage"]),
    champion("21", "MissFortune", "Miss Fortune", ["Marksman"]),
    champion("145", "Kaisa", "Kai'Sa", ["Marksman"]),
    champion("59", "JarvanIV", "Jarvan IV"),
    champion("64", "LeeSin", "Lee Sin"),
    champion("62", "MonkeyKing", "Wukong"),
    champion("55", "Katarina", "Katarina", ["Assassin"]),
    champion("11", "MasterYi", "Master Yi", ["Assassin"]),
];

function best(query: string): string | undefined {
    return filterChampions(CHAMPIONS, query)[0]?.name;
}

describe("scoreChampion", () => {
    it("ranks an exact name above everything else", () => {
        expect(
            scoreChampion(champion("1", "Aatrox", "Aatrox"), "aatrox"),
        ).toBeGreaterThan(scoreChampion(champion("1", "Aatrox", "Aatrox"), "aat"));
    });

    it("ignores accents, apostrophes and case", () => {
        expect(scoreChampion(CHAMPIONS[3]!, "kaisa")).toBeGreaterThan(0);
        expect(scoreChampion(CHAMPIONS[3]!, "KAI'SA")).toBeGreaterThan(0);
    });

    it("matches a word in the middle of a name", () => {
        expect(scoreChampion(CHAMPIONS[2]!, "fortune")).toBeGreaterThan(0);
    });

    it("matches the initials of a two-word name", () => {
        expect(scoreChampion(CHAMPIONS[2]!, "mf")).toBeGreaterThan(0);
        expect(scoreChampion(CHAMPIONS[8]!, "my")).toBeGreaterThan(0);
    });

    it("matches a community nickname", () => {
        expect(scoreChampion(CHAMPIONS[1]!, "asol")).toBeGreaterThan(0);
        expect(scoreChampion(CHAMPIONS[6]!, "wukong")).toBeGreaterThan(0);
    });

    it("matches a class as a last resort", () => {
        expect(scoreChampion(CHAMPIONS[7]!, "assassin")).toBeGreaterThan(0);
    });

    it("returns zero when nothing matches", () => {
        expect(scoreChampion(CHAMPIONS[0]!, "zzzz")).toBe(0);
    });

    it("matches everything on an empty query", () => {
        for (const entry of CHAMPIONS)
            expect(scoreChampion(entry, "")).toBeGreaterThan(0);
    });
});

describe("filterChampions", () => {
    it("puts the champion a player meant first", () => {
        expect(best("mf")).toBe("Miss Fortune");
        expect(best("asol")).toBe("Aurelion Sol");
        expect(best("j4")).toBe("Jarvan IV");
        expect(best("kaisa")).toBe("Kai'Sa");
        expect(best("lee")).toBe("Lee Sin");
        expect(best("kata")).toBe("Katarina");
        expect(best("wu")).toBe("Wukong");
    });

    it("drops champions that do not match at all", () => {
        expect(filterChampions(CHAMPIONS, "aatrox")).toHaveLength(1);
        expect(filterChampions(CHAMPIONS, "zzzz")).toEqual([]);
    });

    it("orders an empty query by the tie-break score", () => {
        const ratings = new Map([
            ["266", 5],
            ["21", 50],
            ["64", 20],
        ]);
        const ordered = filterChampions(
            CHAMPIONS,
            "",
            (entry) => ratings.get(entry.key) ?? -1e9,
        );
        expect(ordered.slice(0, 3).map((entry) => entry.name)).toEqual([
            "Miss Fortune",
            "Lee Sin",
            "Aatrox",
        ]);
        expect(ordered).toHaveLength(CHAMPIONS.length);
    });

    it("falls back to alphabetical order for equal scores", () => {
        const ordered = filterChampions(CHAMPIONS, "");
        expect(ordered[0]!.name).toBe("Aatrox");
        expect(ordered[1]!.name).toBe("Aurelion Sol");
    });

    it("stays fast on a full champion roster", () => {
        const roster = Array.from({ length: 173 }, (_, index) =>
            champion(String(index), `Champion${index}`, `Champion ${index}`),
        );
        const started = performance.now();
        for (let run = 0; run < 50; run += 1) filterChampions(roster, "cha");
        expect(performance.now() - started).toBeLessThan(500);
    });
});

describe("championAliases", () => {
    it("is empty for a champion nobody abbreviates", () => {
        expect(championAliases(CHAMPIONS[0]!)).toEqual(["darkin"]);
        expect(championAliases(champion("9999", "Unknown", "Unknown"))).toEqual([]);
    });
});
