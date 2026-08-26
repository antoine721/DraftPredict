import { Link } from "react-router-dom";
import { Check, MonitorSmartphone, RefreshCw } from "lucide-react";
import type { ApiError } from "../../api";
import { formatRiotId } from "../../lib/format";
import { Badge, Button, Card, ErrorState, Skeleton } from "../../ui";
import { ROUTES } from "../../app/routes";
import { useLcuAccount, type LcuAccount } from "./api";
import { useStaticVersion } from "./hooks";
import { platformLabel } from "./labels";
import type { SavedAccount } from "./helpers";
import { SummonerAvatar } from "./SummonerAvatar";

/**
 * Connect in one click, with no API key at all.
 *
 * `GET /api/account/me` reads the account the local League Client is logged in
 * as. It is by far the best path — nothing to type, no region to guess, no key
 * to obtain — so it gets the primary button and the top of the screen. It is
 * also the path that keeps working when the key is missing or expired.
 *
 * The request is gated on the LCU status (already pushed over the WebSocket),
 * so a closed client costs zero requests instead of a 404 every few seconds.
 */
export function LcuConnectCard({
    onConnect,
    /** The puuid already connected, so the card can say "déjà connecté". */
    activePuuid = null,
}: {
    onConnect: (account: Omit<SavedAccount, "lastUsedAt">) => void;
    activePuuid?: string | null;
}) {
    const { account, error, isLoading, ready, disabled, refetch } = useLcuAccount();

    return (
        <Card padding="lg" className="flex flex-col gap-4">
            <header className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span
                        aria-hidden
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-line-strong bg-surface-3 text-ink-muted"
                    >
                        <MonitorSmartphone className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-ink-strong">
                            Détection automatique
                        </h3>
                        <p className="mt-0.5 text-xs text-ink-muted">
                            Depuis le client League of Legends — aucune clé d'API
                            nécessaire.
                        </p>
                    </div>
                </div>
                <Badge
                    tone={account ? "positive" : ready ? "info" : "offline"}
                    dot
                >
                    {account
                        ? "Compte détecté"
                        : ready
                          ? "Client connecté"
                          : disabled
                            ? "Désactivée"
                            : "Client non détecté"}
                </Badge>
            </header>

            <Body
                account={account}
                error={error}
                isLoading={isLoading}
                ready={ready}
                disabled={disabled}
                onRetry={refetch}
                onConnect={onConnect}
                activePuuid={activePuuid}
            />
        </Card>
    );
}

function Body({
    account,
    error,
    isLoading,
    ready,
    disabled,
    onRetry,
    onConnect,
    activePuuid,
}: {
    account: LcuAccount | null;
    error: ApiError | null;
    isLoading: boolean;
    ready: boolean;
    disabled: boolean;
    onRetry: () => void;
    onConnect: (account: Omit<SavedAccount, "lastUsedAt">) => void;
    activePuuid: string | null;
}) {
    if (disabled) {
        return (
            <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface-2/60 px-3 py-3">
                <p className="text-sm text-ink-muted">
                    L'intégration au client League of Legends est désactivée dans les
                    paramètres. Activez-la pour connecter votre compte sans clé d'API.
                </p>
                <Link
                    to={ROUTES.settings.path}
                    className="text-xs font-medium text-gold underline-offset-4 hover:underline"
                >
                    Activer l'intégration au client
                </Link>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface-2/60 px-3 py-3">
                <p className="text-sm text-ink-muted">
                    Aucun client League of Legends détecté sur cette machine. Lancez le
                    jeu et connectez-vous : votre compte apparaîtra ici automatiquement,
                    sans rien saisir.
                </p>
                <Button
                    size="sm"
                    variant="secondary"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={onRetry}
                >
                    Chercher à nouveau
                </Button>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-3">
                <Skeleton circle className="h-14 w-14" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                </div>
            </div>
        );
    }

    if (error) {
        if (error.code === "LCU_NO_SUMMONER" || error.isNotFound) {
            return (
                <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface-2/60 px-3 py-3">
                    <p className="text-sm text-ink-muted">
                        Le client est ouvert mais personne n'est connecté. Connectez-vous
                        dans le client, puis relancez la détection.
                    </p>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        onClick={onRetry}
                    >
                        Relancer la détection
                    </Button>
                </div>
            );
        }
        return (
            <ErrorState
                size="sm"
                error={error}
                title="Détection impossible"
                onRetry={onRetry}
            />
        );
    }

    if (!account) return null;

    const riotId = formatRiotId(account.gameName, account.tagLine);
    const alreadyActive = activePuuid !== null && activePuuid === account.puuid;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-card border border-gold/30 bg-gold/5 px-3 py-3">
                <SummonerPreview account={account} />
            </div>
            <Button
                variant="primary"
                size="lg"
                fullWidth
                icon={<Check className="h-4.5 w-4.5" />}
                disabled={alreadyActive}
                aria-label={`Connecter le compte ${riotId}`}
                onClick={() =>
                    onConnect({
                        puuid: account.puuid,
                        riotId: account.gameName ? riotId : null,
                        platform: account.platform,
                        source: "lcu",
                    })
                }
            >
                {alreadyActive ? "Compte déjà connecté" : "C'est moi"}
            </Button>
        </div>
    );
}

function SummonerPreview({ account }: { account: LcuAccount }) {
    const version = useStaticVersion();
    const riotId = formatRiotId(account.gameName, account.tagLine);
    return (
        <>
            <SummonerAvatar
                name={account.displayName ?? account.gameName}
                version={version}
                profileIconId={account.profileIconId}
                summonerLevel={account.summonerLevel}
            />
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-strong">
                    {account.displayName ?? riotId}
                </p>
                <p className="truncate text-xs text-ink-muted">{riotId}</p>
                <p className="mt-1 text-[11px] text-ink-subtle">
                    {platformLabel(account.platform)}
                </p>
            </div>
        </>
    );
}
