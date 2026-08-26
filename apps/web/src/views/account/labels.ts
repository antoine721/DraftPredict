import type { Role } from "@draftpredict/core";
import { NBSP, formatNumber, formatPercent } from "../../lib/format";

/**
 * The French string table of the account view.
 *
 * `@draftpredict/riot` labels everything in English and ships a **stable**
 * `labelKey` next to it (`playstyle.strength.vision`,
 * `playstyle.archetype.split-pusher`). The English text is a developer
 * fallback; the product is French, so every key is translated here and the
 * server string is never rendered. A missing key degrades to the axis name
 * rather than to English.
 */

export const PLAYSTYLE_AXES = [
    "aggression",
    "farming",
    "vision",
    "objectives",
    "survivability",
    "teamplay",
    "consistency",
    "scaling",
] as const;

export type PlaystyleAxisKey = (typeof PLAYSTYLE_AXES)[number];

export const AXIS_LABELS: Record<PlaystyleAxisKey, string> = {
    aggression: "Agressivité",
    farming: "Farm",
    vision: "Vision",
    objectives: "Objectifs",
    survivability: "Survie",
    teamplay: "Jeu d'équipe",
    consistency: "Régularité",
    scaling: "Montée en puissance",
};

/** Short labels for the radar, where eight words have to fit around a circle. */
export const AXIS_SHORT_LABELS: Record<PlaystyleAxisKey, string> = {
    aggression: "Agressivité",
    farming: "Farm",
    vision: "Vision",
    objectives: "Objectifs",
    survivability: "Survie",
    teamplay: "Équipe",
    consistency: "Régularité",
    scaling: "Scaling",
};

/** What each axis actually measures — shown next to the score, never guessed. */
export const AXIS_DESCRIPTIONS: Record<PlaystyleAxisKey, string> = {
    aggression:
        "Participation aux éliminations, part des dégâts infligés aux champions et kills en solo.",
    farming: "Sbires par minute, or par minute et part de l'or de l'équipe.",
    vision:
        "Score de vision par minute, balises posées et détruites, balises de contrôle achetées.",
    objectives:
        "Participation aux dragons, hérauts, barons et dégâts aux objectifs et aux tourelles.",
    survivability: "Morts par minute, part des morts de l'équipe et KDA.",
    teamplay:
        "Part d'assistances dans vos participations, dégâts encaissés et soins ou boucliers distribués.",
    consistency:
        "Régularité de vos performances d'une partie à l'autre : plus l'écart-type est faible, plus le score est haut.",
    scaling:
        "Écart de performance entre vos parties courtes (moins de 25 min) et vos parties longues (plus de 35 min).",
};

export function axisLabel(axis: string): string {
    return AXIS_LABELS[axis as PlaystyleAxisKey] ?? axis;
}

export function axisShortLabel(axis: string): string {
    return AXIS_SHORT_LABELS[axis as PlaystyleAxisKey] ?? axis;
}

export function axisDescription(axis: string): string {
    return AXIS_DESCRIPTIONS[axis as PlaystyleAxisKey] ?? "";
}

// ------------------------------------------------------ strengths / flaws ---

const STRENGTH_LABELS: Record<PlaystyleAxisKey, string> = {
    aggression: "Menace offensive constante",
    farming: "Excellent farmeur",
    vision: "Maître de la vision",
    objectives: "Joueur d'objectifs",
    survivability: "Difficile à tuer",
    teamplay: "Joueur d'équipe",
    consistency: "Performances régulières",
    scaling: "Redoutable en fin de partie",
};

const WEAKNESS_LABELS: Record<PlaystyleAxisKey, string> = {
    aggression: "Trop passif en combat",
    farming: "Revenus trop faibles",
    vision: "Vision négligée",
    objectives: "Objectifs manqués",
    survivability: "Meurt trop souvent",
    teamplay: "Joue trop seul",
    consistency: "Parties irrégulières",
    scaling: "S'efface dans les longues parties",
};

const STRENGTH_ADVICE: Record<PlaystyleAxisKey, string> = {
    aggression: "Vos picks peuvent assumer la pression : jouez les compositions qui cherchent le combat.",
    farming: "Votre avance en or est votre levier : demandez les side lanes et les vagues.",
    vision: "Votre vision ouvre les objectifs : appelez les rotations avant qu'ils n'apparaissent.",
    objectives: "Vous convertissez déjà les objectifs : imposez le tempo autour de leur timer.",
    survivability: "Vous restez en vie : prenez les positions avancées que personne d'autre ne peut tenir.",
    teamplay: "Votre présence fait gagner les combats groupés : jouez proche de vos carries.",
    consistency: "Vous rendez la même partie à chaque fois : c'est ce qui fait monter le classement.",
    scaling: "Vous prenez l'avantage avec le temps : sécurisez le début de partie sans forcer.",
};

const WEAKNESS_ADVICE: Record<PlaystyleAxisKey, string> = {
    aggression: "Cherchez une trade par vague plutôt qu'un combat par partie : votre part de dégâts est basse.",
    farming: "Vous perdez des vagues : repassez farmer entre deux rotations, même en avance.",
    vision: "Posez une balise de contrôle par retour à la base : c'est le gain de score le plus simple.",
    objectives: "Soyez présent 30 secondes avant l'apparition du dragon ou du héraut, pas après.",
    survivability: "Vos morts coûtent plus que vos kills ne rapportent : reculez avant d'être à portée.",
    teamplay: "Vos combats se jouent sans vous : rapprochez-vous de votre équipe après la phase de lane.",
    consistency: "Vos écarts entre parties sont larges : réduisez votre pool de champions un moment.",
    scaling: "Vos longues parties se dégradent : jouez pour fermer avant la trentième minute.",
};

/** `playstyle.strength.vision` / `playstyle.weakness.vision` -> French. */
export function traitLabel(labelKey: string, axis: string): string {
    const key = axis as PlaystyleAxisKey;
    if (labelKey.startsWith("playstyle.strength."))
        return STRENGTH_LABELS[key] ?? axisLabel(axis);
    if (labelKey.startsWith("playstyle.weakness."))
        return WEAKNESS_LABELS[key] ?? axisLabel(axis);
    return axisLabel(axis);
}

/** One actionable sentence per trait — a list of adjectives helps nobody. */
export function traitAdvice(labelKey: string, axis: string): string {
    const key = axis as PlaystyleAxisKey;
    if (labelKey.startsWith("playstyle.weakness."))
        return WEAKNESS_ADVICE[key] ?? "";
    return STRENGTH_ADVICE[key] ?? "";
}

// ------------------------------------------------------------- archetypes ---

export type ArchetypeCopy = { name: string; summary: string };

const ARCHETYPES: Record<string, ArchetypeCopy> = {
    "hyper-carry": {
        name: "Hyper-carry",
        summary:
            "Vous concentrez l'or et les dégâts de l'équipe et vous attendez qu'elle joue autour de vous.",
    },
    "lane-bully": {
        name: "Tyran de lane",
        summary:
            "Vous gagnez en écrasant votre adversaire tôt ; les parties qui s'éternisent vous desservent.",
    },
    "scaling-farmer": {
        name: "Farmeur patient",
        summary:
            "Vous farmez en sécurité, évitez les risques précoces et laissez la partie venir à vous.",
    },
    playmaker: {
        name: "Créateur d'actions",
        summary:
            "Vous roamez et cherchez les combats avec votre équipe plutôt que de farmer votre lane.",
    },
    "vision-controller": {
        name: "Contrôleur de vision",
        summary:
            "Vous gagnez la carte avant que le combat commence : balises, sweeps et balises de contrôle.",
    },
    "frontline-anchor": {
        name: "Point d'ancrage",
        summary:
            "Vous engagez et encaissez pour l'équipe, au prix de votre propre KDA.",
    },
    "split-pusher": {
        name: "Split-pusher",
        summary:
            "Vous créez la pression en side lane et prenez les structures pendant que l'équipe tient le mid.",
    },
    "all-rounder": {
        name: "Polyvalent",
        summary: "Aucun axe ne domine : votre jeu est équilibré et régulier.",
    },
    unknown: {
        name: "Données insuffisantes",
        summary: "Aucune partie analysable n'a été trouvée pour ce compte.",
    },
};

/** Every archetype `@draftpredict/riot` can return, `unknown` included. */
export const ARCHETYPE_KEYS = [
    "hyper-carry",
    "lane-bully",
    "scaling-farmer",
    "playmaker",
    "vision-controller",
    "frontline-anchor",
    "split-pusher",
    "all-rounder",
    "unknown",
] as const;

/** `playstyle.archetype.split-pusher` -> the French name and its explanation. */
export function archetypeCopy(labelKey: string, fallbackKey: string): ArchetypeCopy {
    const key = labelKey.replace(/^playstyle\.archetype\./, "") || fallbackKey;
    return (
        ARCHETYPES[key] ??
        ARCHETYPES[fallbackKey] ?? {
            name: fallbackKey,
            summary: "",
        }
    );
}

// ---------------------------------------------------------------- metrics ---

type MetricCopy = { label: string; format: (value: number) => string };

const perMinute = (decimals: number) => (value: number) =>
    `${formatNumber(value, decimals)}${NBSP}/${NBSP}min`;
const perGame = (decimals: number) => (value: number) =>
    `${formatNumber(value, decimals)}${NBSP}/${NBSP}partie`;
const ratio = (value: number) => formatPercent(value, 1);
const plain = (decimals: number) => (value: number) => formatNumber(value, decimals);

const METRICS: Record<string, MetricCopy> = {
    killParticipation: { label: "Participation aux kills", format: ratio },
    kaPerMinute: { label: "Kills + assists", format: perMinute(2) },
    damageShare: { label: "Part des dégâts de l'équipe", format: ratio },
    soloKillsPerGame: { label: "Kills en solo", format: perGame(2) },
    csPerMinute: { label: "Sbires", format: perMinute(1) },
    goldPerMinute: { label: "Or", format: perMinute(0) },
    goldShare: { label: "Part de l'or de l'équipe", format: ratio },
    visionScorePerMinute: { label: "Score de vision", format: perMinute(2) },
    wardsPlacedPerMinute: { label: "Balises posées", format: perMinute(2) },
    wardsKilledPerMinute: { label: "Balises détruites", format: perMinute(2) },
    controlWardsPerGame: { label: "Balises de contrôle", format: perGame(1) },
    objectiveParticipation: { label: "Participation aux objectifs", format: ratio },
    objectiveDamagePerMinute: { label: "Dégâts aux objectifs", format: perMinute(0) },
    turretDamagePerMinute: { label: "Dégâts aux tourelles", format: perMinute(0) },
    deathsPerMinute: { label: "Morts", format: perMinute(2) },
    deathShare: { label: "Part des morts de l'équipe", format: ratio },
    kda: { label: "KDA", format: plain(2) },
    assistRatio: { label: "Part d'assistances", format: ratio },
    damageTakenShare: { label: "Part des dégâts encaissés", format: ratio },
    healShieldPerMinute: { label: "Soins et boucliers", format: perMinute(0) },
};

export function metricLabel(metric: string): string {
    return METRICS[metric]?.label ?? metric;
}

export function formatMetric(metric: string, value: number): string {
    const copy = METRICS[metric];
    return copy ? copy.format(value) : formatNumber(value, 2);
}

// ------------------------------------------------------------------- jobs ---

const STAGES: Record<string, string> = {
    "match-ids": "Récupération de la liste des parties",
    matches: "Lecture des parties une par une",
    profiling: "Calcul du profil",
};

export function jobStageLabel(stage: string): string {
    return STAGES[stage] ?? "Analyse en cours";
}

// --------------------------------------------------------------- platforms ---

export type PlatformOption = { id: string; code: string; name: string };

/**
 * Riot shards, in the order a French dropdown should list them.
 *
 * Declared here rather than imported from `@draftpredict/riot`: that package
 * is a Node HTTP client (rate limiter, cache, fs) and nothing of it should be
 * bundled into the browser just to fill a `<select>`.
 */
export const PLATFORMS: readonly PlatformOption[] = [
    { id: "euw1", code: "EUW", name: "Europe de l'Ouest" },
    { id: "eun1", code: "EUNE", name: "Europe Nord & Est" },
    { id: "na1", code: "NA", name: "Amérique du Nord" },
    { id: "kr", code: "KR", name: "Corée" },
    { id: "br1", code: "BR", name: "Brésil" },
    { id: "jp1", code: "JP", name: "Japon" },
    { id: "la1", code: "LAN", name: "Amérique latine Nord" },
    { id: "la2", code: "LAS", name: "Amérique latine Sud" },
    { id: "oc1", code: "OCE", name: "Océanie" },
    { id: "ru", code: "RU", name: "Russie" },
    { id: "tr1", code: "TR", name: "Turquie" },
    { id: "ph2", code: "PH", name: "Philippines" },
    { id: "sg2", code: "SG", name: "Singapour" },
    { id: "th2", code: "TH", name: "Thaïlande" },
    { id: "tw2", code: "TW", name: "Taïwan" },
    { id: "vn2", code: "VN", name: "Viêt Nam" },
    { id: "me1", code: "ME", name: "Moyen-Orient" },
];

export function platformLabel(platform: string | null | undefined): string {
    if (!platform) return "Région inconnue";
    const found = PLATFORMS.find(
        (entry) => entry.id === platform.toLowerCase() || entry.code === platform.toUpperCase(),
    );
    return found ? `${found.code} — ${found.name}` : platform.toUpperCase();
}

export function platformCode(platform: string | null | undefined): string {
    if (!platform) return "—";
    const found = PLATFORMS.find(
        (entry) => entry.id === platform.toLowerCase() || entry.code === platform.toUpperCase(),
    );
    return found ? found.code : platform.toUpperCase();
}

/** Long role names, reused by the role-distribution chart. */
export const ROLE_ORDER: readonly Role[] = [0, 1, 2, 3, 4];
