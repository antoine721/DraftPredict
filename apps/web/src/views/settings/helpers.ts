import { priorGamesByRiskLevel, type Region, type RiskLevel } from "@draftpredict/core";
import type {
    DatasetSource,
    LcuStatus,
    PublicConfig,
    RiotKeyProbeResult,
} from "../../api";
import type { BadgeTone } from "../../ui";
import { formatNumber } from "../../lib";
import {
    DATASET_SOURCE_LABELS,
    KEY_SOURCE_LABELS,
    PLATFORMS,
    PROVIDER_DETAILS,
    PROVIDER_LABELS,
    REGION_LABELS,
    RISK_LABELS,
    type PlatformOption,
} from "./labels";

/**
 * The settings screen's pure logic.
 *
 * Everything here answers the same question in a different form: *what is
 * actually true right now, and how do we say it in one sentence?* Keeping it
 * out of the components makes each answer testable, which matters because most
 * of these states (no key, no client, offline dataset) are the ones a user
 * meets first and can never be reproduced in this container by clicking.
 */

// ------------------------------------------------------------ Riot API key ---

/**
 * The server's own shape check, mirrored so the UI can refuse a paste before a
 * round trip. Structural on purpose: strict enough to catch a URL or a
 * truncated copy, never strict enough to reject a key the app could use.
 */
export const RIOT_KEY_PATTERN = /^RGAPI-[A-Za-z0-9-]{16,}$/;

/**
 * Cleans up what people actually paste: stray spaces, surrounding quotes, and
 * the `RIOT_API_KEY=` prefix copied straight out of a `.env` file.
 */
export function normalizeKeyInput(raw: string): string {
    let value = raw.trim();
    value = value.replace(/^(?:export\s+)?RIOT_API_KEY\s*=\s*/i, "");
    value = value.replace(/^["'`]|["'`]$/g, "");
    return value.trim();
}

export function looksLikeRiotKey(value: string): boolean {
    return RIOT_KEY_PATTERN.test(normalizeKeyInput(value));
}

/** The inline error under the field, or `null` while there is nothing to say. */
export function keyFieldError(raw: string): string | null {
    const value = normalizeKeyInput(raw);
    if (value.length === 0) return null;
    if (!value.startsWith("RGAPI-")) {
        return "Une clé Riot commence par « RGAPI- ».";
    }
    if (!RIOT_KEY_PATTERN.test(value)) {
        return "Cette clé semble incomplète : il manque des caractères après « RGAPI- ».";
    }
    return null;
}

export type Report = {
    tone: BadgeTone;
    label: string;
    detail: string;
};

/**
 * The four probe outcomes, each said differently.
 *
 * The probe is one live Riot call that the server is allowed to fail: an
 * unreachable Riot still saves the key. Collapsing "vérifiée" and "enregistrée
 * sans vérification" into a single green check would be a lie.
 */
export function describeProbe(probe: RiotKeyProbeResult | null): Report | null {
    if (!probe) return null;
    switch (probe.status) {
        case "ok":
            return {
                tone: "positive",
                label: "Clé vérifiée",
                detail: "Riot a répondu : la clé est valide et enregistrée.",
            };
        case "unauthorized":
            return {
                tone: "negative",
                label: "Clé refusée par Riot",
                detail: "Riot a répondu 401/403 : la clé est expirée ou révoquée. Rien n'a été enregistré.",
            };
        case "unreachable":
            return {
                tone: "warning",
                label: "Riot injoignable",
                detail: "La clé a été enregistrée sans vérification : api.riotgames.com n'a pas répondu (hors-ligne, proxy ou pare-feu).",
            };
        case "skipped":
        default:
            return {
                tone: "neutral",
                label: "Vérification ignorée",
                detail: probe.attempted
                    ? "La vérification n'a pas été tentée."
                    : "La clé a été enregistrée sans appel à Riot.",
            };
    }
}

/** Where the effective key comes from — an env key must never be overwritten silently. */
export function describeKeySource(config: PublicConfig): Report {
    if (!config.hasRiotApiKey) {
        return {
            tone: "offline",
            label: "Aucune clé",
            detail: "Les fonctions de compte sont désactivées ; le draft et le client League fonctionnent normalement.",
        };
    }
    const source = config.riotApiKeySource;
    if (source === "env") {
        return {
            tone: "warning",
            label: "Clé fournie par l'environnement",
            detail: "La clé active vient de la variable d'environnement RIOT_API_KEY. En enregistrer une ici l'emportera sur celle-ci (fichier > environnement) ; la retirer d'ici ne supprime pas la variable.",
        };
    }
    return {
        tone: "positive",
        label: "Clé enregistrée",
        detail: `Source : ${KEY_SOURCE_LABELS[source ?? "file"]}.`,
    };
}

// --------------------------------------------------------------- analysis ---

export function riskPriorGames(riskLevel: RiskLevel): number {
    return priorGamesByRiskLevel[riskLevel];
}

export function riskLabel(riskLevel: RiskLevel): string {
    return RISK_LABELS[riskLevel];
}

/** One sentence tying the chosen level to the number it actually changes. */
export function riskSummary(riskLevel: RiskLevel): string {
    const prior = formatNumber(riskPriorGames(riskLevel));
    const tail =
        riskPriorGames(riskLevel) >= 2000
            ? "les petits échantillons sont fortement ramenés vers 50 %."
            : riskPriorGames(riskLevel) <= 500
              ? "les petits échantillons pèsent vite dans le résultat."
              : "compromis par défaut entre stabilité et réactivité.";
    return `Prior de ${prior} parties : ${tail}`;
}

// ---------------------------------------------------------------- dataset ---

export function providerLabel(provider: string | null | undefined): string {
    if (!provider) return "Aucun";
    return PROVIDER_LABELS[provider] ?? provider;
}

export function providerDetail(provider: string): string | null {
    return PROVIDER_DETAILS[provider] ?? null;
}

/** `"bundled-fixture: Synthetic dataset…"` → its two halves. */
export function parseProviderLine(line: string): {
    id: string;
    label: string;
    detail: string;
} {
    const separator = line.indexOf(":");
    const id = (separator === -1 ? line : line.slice(0, separator)).trim();
    const rest = separator === -1 ? "" : line.slice(separator + 1).trim();
    return {
        id,
        label: providerLabel(id),
        detail: providerDetail(id) ?? rest,
    };
}

export function datasetSourceLabel(source: DatasetSource | null | undefined): string {
    if (!source) return "inconnue";
    return DATASET_SOURCE_LABELS[source] ?? source;
}

// --------------------------------------------------------- account, region ---

export function platformOption(
    platform: string | null | undefined,
): PlatformOption | null {
    if (!platform) return null;
    const needle = platform.trim().toLowerCase();
    return PLATFORMS.find((entry) => entry.id === needle) ?? null;
}

export function platformLabel(platform: string | null | undefined): string {
    const option = platformOption(platform);
    if (option) return `${option.name} (${option.id})`;
    return platform ? `${platform} (inconnue)` : "Non définie";
}

export function regionLabel(region: Region | null | undefined): string {
    if (!region) return "Non définie";
    return REGION_LABELS[region] ?? region;
}

/** The dataset region matching a shard, so the UI can offer to align them. */
export function regionForPlatform(platform: string | null | undefined): Region | null {
    return platformOption(platform)?.code ?? null;
}

// ------------------------------------------------------------ League client ---

/**
 * The client state as a badge plus a sentence.
 *
 * `enabled` is the server's own answer to "am I watching?", and it is *not*
 * the stored `lcuEnabled` setting: the watcher is created when the server
 * starts, so switching the integration on in a server that booted without one
 * only takes effect after a restart. {@link lcuNeedsRestart} spots that.
 */
export function describeLcu(status: LcuStatus | null): Report {
    if (!status) {
        return {
            tone: "neutral",
            label: "État inconnu",
            detail: "Le serveur n'a pas encore renvoyé l'état du client.",
        };
    }
    if (!status.enabled) {
        return {
            tone: "offline",
            label: "Intégration désactivée",
            detail: "DraftPredict ne cherche pas le client League of Legends.",
        };
    }
    if (status.connected) {
        const who = status.summoner?.displayName ?? status.summoner?.gameName ?? null;
        const phase = status.phase ? ` — phase : ${status.phase}` : "";
        return {
            tone: "positive",
            label: status.polling ? "Client connecté (sondage)" : "Client connecté",
            detail: who
                ? `Connecté en tant que ${who}${phase}.`
                : `Le client répond${phase}.`,
        };
    }
    if (status.running) {
        return {
            tone: "warning",
            label: "Client non détecté",
            detail: "La détection tourne : lancez League of Legends sur cette machine.",
        };
    }
    return {
        tone: "neutral",
        label: "Détection arrêtée",
        detail: "La surveillance du client n'est pas active sur le serveur.",
    };
}

/**
 * `true` when the setting says "on" but the server is not watching — which
 * only a restart can fix, and which the UI must say instead of pretending.
 */
export function lcuNeedsRestart(
    config: PublicConfig | null,
    status: LcuStatus | null,
): boolean {
    if (!config || !status) return false;
    return config.lcuEnabled && !status.enabled;
}

// ------------------------------------------------------------------ shared ---

export function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Parses a number field, returning `null` rather than `NaN` for junk. */
export function parseIntegerInput(raw: string): number | null {
    const trimmed = raw.trim().replace(/\s/g, "");
    if (trimmed.length === 0) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

export type SectionId =
    "cle-api" | "compte" | "analyse" | "client" | "donnees" | "interface" | "bureau";

export type SectionDescriptor = { id: SectionId; label: string };

/** The nav rail, and the order the panels are stacked in. */
export const SECTIONS: readonly SectionDescriptor[] = [
    { id: "cle-api", label: "Clé API Riot" },
    { id: "compte", label: "Compte & région" },
    { id: "analyse", label: "Analyse" },
    { id: "client", label: "Client League" },
    { id: "donnees", label: "Données" },
    { id: "interface", label: "Interface" },
    { id: "bureau", label: "Application de bureau" },
];

export function visibleSections(hasDesktopBridge: boolean): SectionDescriptor[] {
    return SECTIONS.filter((section) => section.id !== "bureau" || hasDesktopBridge);
}
