import type { Region, RiskLevel } from "@draftpredict/core";
import type { ConfigOrigin, DatasetSource, ThemePreference } from "../../api";

/**
 * Every fixed string the settings screen shows, in one place.
 *
 * Settings are the one screen where wording *is* the feature: a toggle whose
 * consequence is not spelled out is a toggle nobody dares to touch. The copy
 * here is therefore deliberately explicit about what each option changes, what
 * it costs, and what it cannot do.
 */

export const RISK_LABELS: Record<RiskLevel, string> = {
    "very-low": "Très prudent",
    low: "Prudent",
    medium: "Équilibré",
    high: "Agressif",
    "very-high": "Très agressif",
};

export const THEME_LABELS: Record<ThemePreference, string> = {
    dark: "Sombre",
    light: "Clair",
    system: "Système",
};

export const KEY_SOURCE_LABELS: Record<ConfigOrigin, string> = {
    default: "valeur par défaut",
    env: "variable d'environnement RIOT_API_KEY",
    file: "fichier de configuration",
};

export const DATASET_SOURCE_LABELS: Record<DatasetSource, string> = {
    memory: "cache mémoire",
    disk: "cache disque",
    provider: "fournisseur",
    stale: "cache périmé (secours)",
};

/** The three providers the server can fall back through, in order. */
export const PROVIDER_LABELS: Record<string, string> = {
    "local-file": "Fichier local (apps/pipeline)",
    "draftgap-remote": "Jeux de données publics DraftGap",
    "bundled-fixture": "Jeu de données de démonstration fourni",
};

export const PROVIDER_DETAILS: Record<string, string> = {
    "local-file":
        "Un dossier de jeux de données produit par apps/pipeline sur cette machine.",
    "draftgap-remote":
        "Statistiques publiques téléchargées depuis bucket.draftgap.com. Nécessite un accès réseau.",
    "bundled-fixture":
        "Jeu de données synthétique généré hors-ligne à partir de la liste des champions : cohérent, mais inventé.",
};

export const REGION_LABELS: Record<Region, string> = {
    ALL: "Toutes régions",
    BR: "Brésil",
    EUNE: "Europe Nord & Est",
    EUW: "Europe Ouest",
    JP: "Japon",
    KR: "Corée",
    LAN: "Amérique latine Nord",
    LAS: "Amérique latine Sud",
    NA: "Amérique du Nord",
    OCE: "Océanie",
    RU: "Russie",
    TR: "Turquie",
    PH: "Philippines",
    SG: "Singapour",
    TH: "Thaïlande",
    TW: "Taïwan",
    VN: "Viêt Nam",
    ME: "Moyen-Orient",
};

export type PlatformOption = {
    /** Riot routing value, the host prefix of `<id>.api.riotgames.com`. */
    id: string;
    /** Dataset region code for that shard. */
    code: Region;
    /** Name shown in the dropdown. */
    name: string;
};

/**
 * The Riot shards, with a French name.
 *
 * Declared here rather than imported from `@draftpredict/riot`: that package
 * is a runtime API client (fetch, rate limiter, profiling) and only its
 * *types* are allowed into the browser bundle. `helpers.test.ts` imports the
 * real routing table and fails if this list ever drifts from it.
 */
export const PLATFORMS: readonly PlatformOption[] = [
    { id: "euw1", code: "EUW", name: "Europe Ouest" },
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

// ------------------------------------------------------------- long copy ---

export const RISK_EXPLANATION =
    "Le niveau de risque règle le lissage bayésien : avant de regarder les vraies " +
    "parties, l'analyse ajoute un « prior » de parties fictives jouées à 50 %. Plus " +
    "ce prior est gros, plus il faut d'observations pour éloigner une estimation de " +
    "50 %, donc plus l'analyse est conservatrice — un matchup vu 40 fois ne fera " +
    "presque pas bouger l'aiguille. Un prior faible rend l'analyse réactive, au " +
    "risque de prendre du bruit pour un avantage.";

export const MIN_GAMES_EXPLANATION =
    "Nombre de parties minimum pour qu'un champion soit proposé dans les " +
    "suggestions de picks et de bans. Il ne filtre pas l'analyse d'un draft déjà " +
    "posé : un champion rare reste analysé, il n'est simplement pas conseillé.";

export const IGNORE_WINRATES_EXPLANATION =
    "Ne garder que les synergies et les matchups, en ignorant le winrate propre de " +
    "chaque champion. Utile si vous considérez que le winrate brut mesure surtout " +
    "la difficulté et la popularité d'un champion plutôt que sa force réelle.";

export const KEY_EXPIRY_NOTE =
    "Une clé de développement (development key) expire 24 h après sa création : il " +
    "faut la régénérer chaque jour. Une clé personnelle (personal key) ou de " +
    "production n'expire pas.";

export const KEY_STORAGE_NOTE =
    "La clé est enregistrée par le serveur local dans son fichier de configuration " +
    "(permissions 0600) et n'est jamais renvoyée au navigateur : cet écran n'en " +
    "connaît que les quatre derniers caractères.";

export const KEY_RETEST_NOTE =
    "La clé enregistrée ne quitte jamais le serveur, elle ne peut donc pas être " +
    "retestée telle quelle : recollez-la pour lancer une nouvelle vérification.";

export type Capability = {
    label: string;
    description: string;
    /** `true` when the feature is impossible without a Riot API key. */
    needsKey: boolean;
};

/** What the app can and cannot do without a key — the honest version. */
export const CAPABILITIES: readonly Capability[] = [
    {
        label: "Tableau de draft complet",
        description:
            "Probabilité de victoire, suggestions de picks et de bans, courbe de winrate.",
        needsKey: false,
    },
    {
        label: "Champions & builds",
        description: "Objets, runes, sorts et ordre de compétences par matchup.",
        needsKey: false,
    },
    {
        label: "Client League of Legends",
        description:
            "Détection du champion select en cours et analyse en direct : l'API locale du client ne demande aucune clé.",
        needsKey: false,
    },
    {
        label: "Compte et rangs",
        description: "Profil, rangs solo et flexible, maîtrises de champions.",
        needsKey: true,
    },
    {
        label: "Historique des parties",
        description: "Résumé des dernières parties classées et normales.",
        needsKey: true,
    },
    {
        label: "Style de jeu",
        description:
            "Profil d'archétype calculé sur vos parties : agressivité, farm, vision, objectifs.",
        needsKey: true,
    },
    {
        label: "Partie en cours",
        description:
            "Les deux équipes du spectateur et l'analyse du draft adverse pendant la partie.",
        needsKey: true,
    },
];

/** Exactly what the League Client integration reads — and never does. */
export const LCU_READS: readonly string[] = [
    "L'écran de sélection des champions : picks, bans, survols, rôles et minuteur.",
    "Le compte connecté au client (nom, tag, niveau, icône) et la phase de jeu en cours.",
];

export const LCU_NEVER: readonly string[] = [
    "Aucune écriture dans le client ni dans le jeu : rien n'est sélectionné, banni ou verrouillé à votre place.",
    "Aucune automatisation, aucune simulation de clic ni de frappe clavier.",
    "Aucune donnée envoyée ailleurs : tout reste entre le client local et le serveur DraftPredict de cette machine.",
];

export const LCU_CONNECTION_NOTE =
    "La connexion passe par l'API locale du client (127.0.0.1), avec les " +
    "identifiants que le client écrit lui-même dans son fichier de verrou. Elle ne " +
    "fonctionne que si le client tourne sur cette machine.";

export const DATASET_LOCAL_ROOT_NOTE =
    "Dossier contenant des jeux de données produits par apps/pipeline. Quand il est " +
    "renseigné, il est essayé en premier, avant les jeux de données publics et avant " +
    "le jeu de démonstration.";

export const DESKTOP_ONLY_NOTE =
    "Ces réglages appartiennent à l'application de bureau et n'apparaissent que " +
    "lorsqu'elle héberge cette page.";
