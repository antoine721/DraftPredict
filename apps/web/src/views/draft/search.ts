import type { ChampionSummary } from "../../api/types";
import { normalizeSearch } from "../../lib/helpers";

/**
 * Champion search for the picker.
 *
 * During champion select nobody types "Aurelion Sol": they type "asol", "mf",
 * "j4" or "kata". The search therefore matches on the display name, the Data
 * Dragon id, community nicknames and the champion's initials, and returns a
 * *score* so the list can be ordered by how well each champion matched
 * instead of alphabetically.
 *
 * Everything is normalized with {@link normalizeSearch} (accents and
 * punctuation removed), so "kaisa" finds "Kai'Sa" and "belveth" finds
 * "Bel'Veth".
 */

/** Community nicknames, keyed by Data Dragon id. */
export const CHAMPION_ALIASES: Readonly<Record<string, readonly string[]>> = {
    Aatrox: ["darkin"],
    AurelionSol: ["asol", "sol"],
    Belveth: ["bel", "belveth"],
    Blitzcrank: ["blitz"],
    Caitlyn: ["cait"],
    Cassiopeia: ["cass"],
    Chogath: ["cho"],
    DrMundo: ["mundo"],
    Ezreal: ["ez"],
    Fiddlesticks: ["fiddle"],
    Gangplank: ["gp"],
    Heimerdinger: ["heimer", "donger"],
    Jarvan: ["j4"],
    JarvanIV: ["j4", "jarvan"],
    Kaisa: ["kaisa"],
    Kassadin: ["kassa"],
    Katarina: ["kata"],
    Khazix: ["kha"],
    KogMaw: ["kog"],
    Leblanc: ["lb"],
    LeeSin: ["lee"],
    Lissandra: ["liss"],
    Malphite: ["malph"],
    MasterYi: ["yi"],
    MissFortune: ["mf"],
    MonkeyKing: ["wukong", "wu"],
    Mordekaiser: ["morde"],
    Nautilus: ["naut"],
    Nunu: ["nunu", "willump"],
    Orianna: ["ori"],
    Rammus: ["ram"],
    RekSai: ["reksai"],
    Renekton: ["renek"],
    Sejuani: ["seju"],
    Shyvana: ["shyv"],
    TahmKench: ["tahm", "tk"],
    Thresh: ["tresh"],
    TwistedFate: ["tf"],
    Velkoz: ["velkoz"],
    Volibear: ["voli"],
    Warwick: ["ww"],
    Xayah: ["xa"],
    Yorick: ["yo"],
    Zilean: ["zil"],
};

const SCORE = {
    exact: 1000,
    aliasExact: 900,
    prefix: 800,
    initials: 700,
    wordPrefix: 600,
    aliasPrefix: 500,
    substring: 400,
    tag: 150,
    subsequence: 100,
} as const;

function initialsOf(name: string): string {
    return name
        .split(/[\s'.-]+/u)
        .filter(Boolean)
        .map((word) => word[0] ?? "")
        .join("")
        .toLowerCase();
}

/** `true` when every character of `needle` appears in order inside `haystack`. */
function isSubsequence(haystack: string, needle: string): boolean {
    let index = 0;
    for (const character of haystack) {
        if (character === needle[index]) index += 1;
        if (index === needle.length) return true;
    }
    return needle.length === 0;
}

export function championAliases(champion: ChampionSummary): readonly string[] {
    return CHAMPION_ALIASES[champion.id] ?? [];
}

/**
 * How well a champion matches a query. `0` means "no match at all"; a larger
 * number is a better match. Ties are broken by the caller.
 */
export function scoreChampion(champion: ChampionSummary, query: string): number {
    const needle = normalizeSearch(query);
    if (needle.length === 0) return SCORE.exact;

    const name = normalizeSearch(champion.name);
    const id = normalizeSearch(champion.id);
    const initials = initialsOf(champion.name);

    if (name === needle || id === needle) return SCORE.exact;

    for (const alias of championAliases(champion)) {
        const normalized = normalizeSearch(alias);
        if (normalized === needle) return SCORE.aliasExact;
    }

    if (name.startsWith(needle) || id.startsWith(needle)) {
        return SCORE.prefix - Math.min(90, name.length - needle.length);
    }

    if (needle.length >= 2 && initials.startsWith(needle)) return SCORE.initials;

    // `normalizeSearch` removes spaces, so the words come from the raw name.
    const words = champion.name
        .split(/[\s'.-]+/u)
        .map((word) => normalizeSearch(word))
        .filter(Boolean);
    if (words.some((word) => word.startsWith(needle))) return SCORE.wordPrefix;

    for (const alias of championAliases(champion)) {
        if (normalizeSearch(alias).startsWith(needle)) return SCORE.aliasPrefix;
    }

    if (name.includes(needle) || id.includes(needle)) return SCORE.substring;

    if (
        needle.length >= 3 &&
        champion.tags.some((tag) => normalizeSearch(tag).startsWith(needle))
    ) {
        return SCORE.tag;
    }

    if (needle.length >= 3 && isSubsequence(name, needle)) return SCORE.subsequence;

    return 0;
}

/**
 * The champions matching `query`, best match first. `tieBreak` orders equal
 * scores — the picker passes the champion's rating in the targeted role, so an
 * empty query yields the meta ranking for that slot.
 */
export function filterChampions(
    champions: readonly ChampionSummary[],
    query: string,
    tieBreak?: (champion: ChampionSummary) => number,
): ChampionSummary[] {
    const scored: { champion: ChampionSummary; score: number; tie: number }[] = [];
    for (const champion of champions) {
        const score = scoreChampion(champion, query);
        if (score <= 0) continue;
        scored.push({ champion, score, tie: tieBreak ? tieBreak(champion) : 0 });
    }
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.tie !== a.tie) return b.tie - a.tie;
        return a.champion.name.localeCompare(b.champion.name, "fr");
    });
    return scored.map((entry) => entry.champion);
}
