import type { Role } from "@draftpredict/core";
import { ROLES } from "@draftpredict/core";
import type { ChampionTag, StaticChampion } from "../static/types.js";
import type { Rng } from "./rng.js";

/**
 * Where champions are actually played.
 *
 * Data Dragon only tells us a champion's class tags, which is a coarse but
 * surprisingly usable proxy: marksmen go bottom, supports go support, fighters
 * split between top and jungle. A hand-written override table fixes the
 * champions the tags get plainly wrong (Senna is tagged Marksman but is played
 * support, Lee Sin is tagged Fighter but is a jungler, and so on).
 *
 * The result is a probability distribution over the five roles, used both to
 * decide which roles a fixture champion has data for and to size its samples.
 */

export type RoleAffinity = Record<Role, number>;

/** [top, jungle, middle, bottom, support] */
type Weights = readonly [number, number, number, number, number];

const TAG_WEIGHTS: Readonly<Record<ChampionTag, Weights>> = {
    Fighter: [0.42, 0.3, 0.12, 0.04, 0.12],
    Tank: [0.38, 0.22, 0.06, 0.02, 0.32],
    Mage: [0.12, 0.06, 0.55, 0.04, 0.23],
    Assassin: [0.18, 0.34, 0.42, 0.03, 0.03],
    Marksman: [0.08, 0.04, 0.1, 0.72, 0.06],
    Support: [0.05, 0.04, 0.1, 0.05, 0.76],
};

const FALLBACK_WEIGHTS: Weights = [0.2, 0.2, 0.2, 0.2, 0.2];

/** Champions whose class tags do not describe where they are played. */
const ROLE_OVERRIDES: Readonly<Record<string, Weights>> = {
    Senna: [0.02, 0.01, 0.02, 0.3, 0.65],
    Ashe: [0.01, 0.01, 0.02, 0.86, 0.1],
    Swain: [0.05, 0.01, 0.4, 0.04, 0.5],
    Pyke: [0.02, 0.06, 0.06, 0.02, 0.84],
    Thresh: [0.01, 0.01, 0.01, 0.02, 0.95],
    Blitzcrank: [0.02, 0.01, 0.01, 0.01, 0.95],
    LeeSin: [0.12, 0.85, 0.02, 0.0, 0.01],
    MasterYi: [0.04, 0.94, 0.01, 0.0, 0.01],
    Nidalee: [0.03, 0.9, 0.05, 0.0, 0.02],
    Elise: [0.04, 0.92, 0.02, 0.0, 0.02],
    Teemo: [0.7, 0.06, 0.14, 0.06, 0.04],
    Yasuo: [0.34, 0.02, 0.5, 0.12, 0.02],
    Yone: [0.38, 0.02, 0.54, 0.04, 0.02],
    Sylas: [0.16, 0.06, 0.72, 0.02, 0.04],
    Karma: [0.04, 0.01, 0.18, 0.02, 0.75],
    Lux: [0.02, 0.01, 0.42, 0.02, 0.53],
    Morgana: [0.03, 0.05, 0.2, 0.02, 0.7],
    Brand: [0.02, 0.03, 0.25, 0.02, 0.68],
    Zyra: [0.02, 0.04, 0.14, 0.02, 0.78],
    Seraphine: [0.01, 0.0, 0.22, 0.22, 0.55],
    Vayne: [0.14, 0.01, 0.02, 0.81, 0.02],
    Graves: [0.12, 0.82, 0.03, 0.02, 0.01],
    Kindred: [0.02, 0.94, 0.02, 0.0, 0.02],
    Karthus: [0.02, 0.6, 0.36, 0.01, 0.01],
    Heimerdinger: [0.35, 0.02, 0.4, 0.03, 0.2],
    Ziggs: [0.02, 0.01, 0.5, 0.4, 0.07],
    Veigar: [0.04, 0.01, 0.78, 0.03, 0.14],
    Amumu: [0.06, 0.7, 0.02, 0.01, 0.21],
    Shaco: [0.04, 0.85, 0.02, 0.01, 0.08],
    Nunu: [0.04, 0.9, 0.03, 0.0, 0.03],
    Ivern: [0.02, 0.94, 0.01, 0.0, 0.03],
    Rammus: [0.12, 0.86, 0.01, 0.0, 0.01],
    Skarner: [0.2, 0.76, 0.02, 0.0, 0.02],
    Sona: [0.01, 0.0, 0.04, 0.03, 0.92],
    Janna: [0.01, 0.0, 0.02, 0.02, 0.95],
    Lulu: [0.06, 0.01, 0.08, 0.02, 0.83],
    Nami: [0.01, 0.0, 0.02, 0.02, 0.95],
    Yuumi: [0.0, 0.0, 0.01, 0.01, 0.98],
    Milio: [0.0, 0.0, 0.02, 0.02, 0.96],
    Renata: [0.01, 0.0, 0.02, 0.02, 0.95],
    Rakan: [0.01, 0.0, 0.02, 0.02, 0.95],
    Bard: [0.01, 0.0, 0.02, 0.02, 0.95],
    Leona: [0.02, 0.0, 0.01, 0.01, 0.96],
    Nautilus: [0.06, 0.06, 0.02, 0.01, 0.85],
    TahmKench: [0.42, 0.02, 0.04, 0.02, 0.5],
    Maokai: [0.3, 0.2, 0.02, 0.01, 0.47],
    Camille: [0.72, 0.14, 0.06, 0.02, 0.06],
    Jax: [0.6, 0.34, 0.03, 0.01, 0.02],
    Fiora: [0.86, 0.06, 0.05, 0.02, 0.01],
    Darius: [0.86, 0.08, 0.03, 0.02, 0.01],
    Garen: [0.84, 0.04, 0.09, 0.02, 0.01],
    Nasus: [0.84, 0.06, 0.04, 0.02, 0.04],
    Malphite: [0.62, 0.14, 0.06, 0.01, 0.17],
    Ornn: [0.9, 0.05, 0.02, 0.01, 0.02],
    Sett: [0.5, 0.04, 0.06, 0.06, 0.34],
    Gragas: [0.24, 0.44, 0.2, 0.02, 0.1],
    Pantheon: [0.34, 0.06, 0.24, 0.02, 0.34],
    Zilean: [0.02, 0.01, 0.28, 0.02, 0.67],
};

/**
 * Role distribution for a champion. `rng` adds a small deterministic wobble so
 * two champions with identical tags do not end up with identical datasets.
 */
export function championRoleAffinity(champion: StaticChampion, rng: Rng): RoleAffinity {
    const base = baseWeights(champion);
    const jittered = base.map((weight) => weight * rng.float(0.7, 1.4) + 0.005);
    const total = jittered.reduce((sum, weight) => sum + weight, 0);

    const affinity = {} as RoleAffinity;
    for (const role of ROLES) affinity[role] = jittered[role] / total;
    return affinity;
}

function baseWeights(champion: StaticChampion): Weights {
    const override = ROLE_OVERRIDES[champion.id];
    if (override) return override;

    const tags = champion.tags.filter((tag) => tag in TAG_WEIGHTS);
    if (tags.length === 0) return FALLBACK_WEIGHTS;

    // The first tag is Riot's primary class, so it gets the larger share.
    const summed = [0, 0, 0, 0, 0];
    tags.forEach((tag, index) => {
        const weight = index === 0 ? 1 : 0.5;
        const vector = TAG_WEIGHTS[tag];
        for (let role = 0; role < 5; role++) summed[role] += vector[role] * weight;
    });

    const total = summed.reduce((sum, weight) => sum + weight, 0);
    return summed.map((weight) => weight / total) as unknown as Weights;
}

/**
 * The roles a champion is played in often enough to have data for: every role
 * above `threshold`, and always the most likely one.
 */
export function playedRoles(affinity: RoleAffinity, threshold = 0.1): Role[] {
    const roles = ROLES.filter((role) => affinity[role] >= threshold);
    if (roles.length > 0) return [...roles];

    let best: Role = 0;
    for (const role of ROLES) if (affinity[role] > affinity[best]) best = role;
    return [best];
}
