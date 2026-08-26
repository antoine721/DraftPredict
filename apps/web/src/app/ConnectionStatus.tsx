import { Link } from "react-router-dom";
import {
    Database,
    KeyRound,
    MonitorSmartphone,
    Radio,
    RefreshCw,
    WifiOff,
} from "lucide-react";
import { cn } from "../lib/cn";
import { formatDatasetDate } from "../lib/format";
import { useConfig, useHealth, useLcuStatus } from "../api/queries";
import { useLcuLiveStatus, useLiveConnectionState, useLiveDataset } from "../api/live";
import type { LcuStatus } from "../api/types";
import { Badge, Tooltip } from "../ui";
import { ROUTES } from "./routes";

/**
 * The three questions the header answers at a glance:
 *
 * 1. is the League Client connected (do I get live champion select?),
 * 2. where do the numbers come from (real data or the offline demo fixture?),
 * 3. is a Riot API key configured (are the account features available?).
 *
 * Every value is real: the LCU status comes from the WebSocket when the socket
 * is up and from `/api/lcu/status` otherwise, the dataset from `/api/health`
 * plus `dataset:update` pushes, the key from `/api/config`.
 */

function lcuAppearance(status: LcuStatus | null | undefined): {
    tone: "positive" | "warning" | "offline" | "negative";
    label: string;
    detail: string;
} {
    if (!status) {
        return {
            tone: "offline",
            label: "Client inconnu",
            detail: "L'état du client League of Legends n'a pas encore été reçu.",
        };
    }
    if (!status.enabled) {
        return {
            tone: "offline",
            label: "Client désactivé",
            detail: "L'intégration au client est désactivée dans les paramètres.",
        };
    }
    if (status.connected) {
        const who = status.summoner?.gameName ?? status.summoner?.displayName ?? null;
        return {
            tone: "positive",
            label: "Client connecté",
            detail: [
                who
                    ? `Connecté en tant que ${who}.`
                    : "Client League of Legends détecté.",
                status.phase ? `Phase : ${status.phase}.` : null,
                status.polling
                    ? "Mode dégradé : le client est interrogé périodiquement (WebSocket LCU indisponible)."
                    : null,
            ]
                .filter(Boolean)
                .join(" "),
        };
    }
    if (status.lastError) {
        return {
            tone: "negative",
            label: "Client en erreur",
            detail: status.lastError,
        };
    }
    return {
        tone: "warning",
        label: "Client non détecté",
        detail: "Lancez League of Legends pour suivre la sélection des champions en direct.",
    };
}

export function LcuStatusBadge({ className }: { className?: string }) {
    const pushed = useLcuLiveStatus();
    const fallback = useLcuStatus({ enabled: pushed === null });
    const status = pushed ?? fallback.data ?? null;
    const { tone, label, detail } = lcuAppearance(status);

    return (
        <Tooltip content={detail} wide side="bottom">
            <Badge
                tone={tone === "positive" ? "positive" : tone}
                dot
                icon={<MonitorSmartphone className="h-3 w-3" />}
                className={cn("cursor-default", className)}
            >
                {label}
            </Badge>
        </Tooltip>
    );
}

export function DatasetStatusBadge({ className }: { className?: string }) {
    const health = useHealth();
    const pushed = useLiveDataset();

    const provider =
        pushed?.provider ??
        (health.data?.dataset.available ? health.data.dataset.provider : null);
    const date =
        pushed?.date ??
        (health.data?.dataset.available ? health.data.dataset.date : null);
    const offline =
        pushed?.offline ??
        (health.data?.dataset.available ? health.data.dataset.offline : false);

    if (health.isLoading && !provider) {
        return (
            <Badge
                tone="neutral"
                icon={<Database className="h-3 w-3" />}
                className={className}
            >
                Données…
            </Badge>
        );
    }

    if (!provider) {
        return (
            <Tooltip
                wide
                side="bottom"
                content="Aucune source de données n'a pu être chargée. Les analyses sont indisponibles."
            >
                <Badge
                    tone="negative"
                    dot
                    icon={<Database className="h-3 w-3" />}
                    className={className}
                >
                    Données indisponibles
                </Badge>
            </Tooltip>
        );
    }

    return (
        <Tooltip
            wide
            side="bottom"
            content={
                offline
                    ? `Source : ${provider} — données de démonstration hors-ligne, générées localement (${formatDatasetDate(date)}). Les chiffres sont cohérents mais ne reflètent pas les statistiques réelles.`
                    : `Source : ${provider}, échantillon du ${formatDatasetDate(date)}.`
            }
        >
            <Badge
                tone={offline ? "warning" : "info"}
                dot
                icon={<Database className="h-3 w-3" />}
                className={cn("cursor-default", className)}
            >
                {offline ? "Démo hors-ligne" : provider}
            </Badge>
        </Tooltip>
    );
}

export function RiotKeyBadge({ className }: { className?: string }) {
    const config = useConfig();
    const publicConfig = config.data?.config;

    if (publicConfig?.hasRiotApiKey) {
        return (
            <Tooltip
                wide
                side="bottom"
                content={`Clé d'API Riot configurée (${publicConfig.riotApiKeyPreview ?? "masquée"}, source : ${publicConfig.riotApiKeySource ?? "inconnue"}). Elle reste sur le serveur et n'est jamais renvoyée au navigateur.`}
            >
                <Badge
                    tone="gold"
                    dot
                    icon={<KeyRound className="h-3 w-3" />}
                    className={cn("cursor-default", className)}
                >
                    Compte Riot connecté
                </Badge>
            </Tooltip>
        );
    }

    return (
        <Tooltip
            wide
            side="bottom"
            content="Aucune clé d'API Riot n'est configurée : le profil, l'historique, le style de jeu et la partie en cours sont indisponibles."
        >
            <Link
                to={ROUTES.settings.path}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5",
                    "text-[11px] font-medium text-gold transition-colors hover:bg-gold/20",
                    className,
                )}
            >
                <KeyRound className="h-3 w-3" />
                Connecter mon compte
            </Link>
        </Tooltip>
    );
}

/** The live `/ws` socket itself — a quiet dot unless something is wrong. */
export function SocketStatusBadge({ className }: { className?: string }) {
    const state = useLiveConnectionState();
    if (state === "open") {
        return (
            <Tooltip content="Connexion temps réel active" side="bottom">
                <span
                    className={cn("inline-flex items-center text-online", className)}
                    aria-label="Connexion temps réel active"
                >
                    <Radio className="h-3.5 w-3.5" />
                </span>
            </Tooltip>
        );
    }
    if (state === "closed") {
        return (
            <Tooltip content="Temps réel hors service" side="bottom" wide>
                <span
                    className={cn(
                        "inline-flex items-center text-ink-subtle",
                        className,
                    )}
                >
                    <WifiOff className="h-3.5 w-3.5" />
                </span>
            </Tooltip>
        );
    }
    return (
        <Tooltip content="Reconnexion au serveur…" side="bottom">
            <span className={cn("inline-flex items-center text-warning", className)}>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            </span>
        </Tooltip>
    );
}

/** The whole cluster, as it appears in the top bar. */
export function ConnectionStatus({ className }: { className?: string }) {
    return (
        <div className={cn("flex flex-wrap items-center gap-2", className)}>
            <SocketStatusBadge />
            <LcuStatusBadge />
            <DatasetStatusBadge />
            <RiotKeyBadge />
        </div>
    );
}
