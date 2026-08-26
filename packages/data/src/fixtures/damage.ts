import type { ChampionDamageProfile } from "@draftpredict/core";
import type { ChampionTag, StaticChampion } from "../static/types.js";
import type { Rng } from "./rng.js";

/** Damage split implied by a champion's class tags. [magic, physical, true] */
const TAG_DAMAGE: Readonly<Record<ChampionTag, readonly [number, number, number]>> = {
    Mage: [0.85, 0.12, 0.03],
    Marksman: [0.08, 0.88, 0.04],
    Assassin: [0.33, 0.62, 0.05],
    Fighter: [0.2, 0.7, 0.1],
    Tank: [0.5, 0.4, 0.1],
    Support: [0.6, 0.32, 0.08],
};

/**
 * A plausible damage profile for a champion, as fractions of its total damage
 * summing to 1. Real datasets store absolute numbers, but everything in the
 * engine that reads a damage profile only ever compares channels, and
 * normalized values keep team totals readable.
 */
export function championDamageProfile(
    champion: StaticChampion,
    rng: Rng,
): ChampionDamageProfile {
    let magic = 0;
    let physical = 0;
    let trueDamage = 0;

    const tags = champion.tags.filter((tag) => tag in TAG_DAMAGE);
    if (tags.length === 0) {
        magic = physical = 0.45;
        trueDamage = 0.1;
    } else {
        for (const tag of tags) {
            const [m, p, t] = TAG_DAMAGE[tag];
            magic += m;
            physical += p;
            trueDamage += t;
        }
    }

    magic = Math.max(0, magic * rng.float(0.8, 1.2));
    physical = Math.max(0, physical * rng.float(0.8, 1.2));
    trueDamage = Math.max(0, trueDamage * rng.float(0.6, 1.5));

    const total = magic + physical + trueDamage;
    if (total === 0) return { magic: 0, physical: 0, true: 0 };

    return {
        magic: round4(magic / total),
        physical: round4(physical / total),
        true: round4(trueDamage / total),
    };
}

function round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}
