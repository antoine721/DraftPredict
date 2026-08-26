import type {
    ImageUrls,
    StaticChampion,
    StaticChampionSpell,
    StaticImage,
    StaticItem,
    StaticRune,
    StaticRunePath,
    StaticStatShard,
    StaticSummonerSpell,
} from "./types.js";

/** Data Dragon's CDN root. */
export const DDRAGON_BASE_URL = "https://ddragon.leagueoflegends.com";

/**
 * Data Dragon serves two kinds of images:
 *  - patch-scoped assets under `/cdn/<version>/img/...` (champion squares,
 *    item icons, spell icons),
 *  - version-less assets under `/cdn/img/...` (splash art, loading screens and
 *    every perk/rune icon).
 * The builders below keep that distinction so callers never have to remember it.
 */
export function createImageUrls(
    version: string,
    baseUrl = DDRAGON_BASE_URL,
): ImageUrls {
    const patchRoot = `${baseUrl}/cdn/${version}/img`;
    const sharedRoot = `${baseUrl}/cdn/img`;

    const championId = (champion: StaticChampion | string): string =>
        typeof champion === "string" ? champion : champion.id;

    return {
        version,

        championSquare: (champion) =>
            `${patchRoot}/champion/${
                typeof champion === "string" ? `${champion}.png` : champion.image.full
            }`,

        championLoading: (champion, skin = 0) =>
            `${sharedRoot}/champion/loading/${championId(champion)}_${skin}.jpg`,

        championSplash: (champion, skin = 0) =>
            `${sharedRoot}/champion/splash/${championId(champion)}_${skin}.jpg`,

        championPassive: (champion) =>
            champion.passive
                ? `${patchRoot}/passive/${champion.passive.image.full}`
                : `${patchRoot}/passive/${champion.id}_Passive.png`,

        championSpell: (spell: StaticChampionSpell) =>
            `${patchRoot}/spell/${spell.image.full}`,

        item: (item: StaticItem | number) =>
            `${patchRoot}/item/${typeof item === "number" ? item : item.id}.png`,

        rune: (rune: StaticRune | StaticRunePath | StaticStatShard | string) =>
            `${sharedRoot}/${typeof rune === "string" ? rune : rune.icon}`,

        summonerSpell: (spell: StaticSummonerSpell | string) =>
            `${patchRoot}/spell/${
                typeof spell === "string" ? `${spell}.png` : spell.image.full
            }`,

        sprite: (image: StaticImage) => `${patchRoot}/sprite/${image.sprite}`,
    };
}

/** URL of the Data Dragon version manifest (newest patch first). */
export function versionsUrl(baseUrl = DDRAGON_BASE_URL): string {
    return `${baseUrl}/api/versions.json`;
}

/** URL of one of the four snapshot files for a given patch. */
export function dataFileUrl(
    version: string,
    file: string,
    language = "en_US",
    baseUrl = DDRAGON_BASE_URL,
): string {
    return `${baseUrl}/cdn/${version}/data/${language}/${file}`;
}
