import type { DamageKind } from "./stats";

/** Data Dragon champion classes, in French. */
export const TAG_LABELS: Record<string, string> = {
    Fighter: "Combattant",
    Mage: "Mage",
    Assassin: "Assassin",
    Marksman: "Tireur",
    Tank: "Tank",
    Support: "Support",
};

export function tagLabel(tag: string): string {
    return TAG_LABELS[tag] ?? tag;
}

export const DAMAGE_SHORT_LABEL: Record<DamageKind, string> = {
    physical: "AD",
    magic: "AP",
    mixed: "Mixte",
};

/**
 * How the tier is computed, in one paragraph. Shown wherever a tier is: an
 * estimate the user cannot audit is worse than no estimate at all.
 */
export const TIER_EXPLANATION =
    "Le tier est une estimation calculée ici, pas une note officielle : on convertit le " +
    "winrate du champion dans ce rôle en rating Elo après lissage bayésien, on le compare " +
    "aux autres champions du même rôle (en écarts-types), puis on y ajoute la moitié de " +
    "son écart de popularité (logarithme du nombre de parties). Un champion joué moins de " +
    "100 fois n'est pas classé.";

export const PICKRATE_EXPLANATION =
    "Part des parties du rôle jouées avec ce champion, calculée sur l'échantillon du jeu de données.";

export const BANRATE_EXPLANATION =
    "Le jeu de données (format DraftGap v5) ne contient aucun compteur de bans : ce taux ne peut pas être calculé honnêtement ici.";
