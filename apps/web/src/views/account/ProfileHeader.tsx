import { Link } from "react-router-dom";
import { LogOut, MonitorSmartphone, RefreshCw, Users } from "lucide-react";
import type { ApiError, ProfileResponse } from "../../api";
import { cn } from "../../lib/cn";
import { formatNumber, formatRiotId } from "../../lib/format";
import {
    Badge,
    Button,
    ErrorState,
    RiotKeyMissingState,
    Skeleton,
} from "../../ui";
import { ROUTES } from "../../app/routes";
import { MasteryList } from "./MasteryList";
import { RankCard } from "./RankCard";
import { SummonerAvatar } from "./SummonerAvatar";
import { platformLabel } from "./labels";
import type { ActiveAccount } from "./hooks";

/**
 * Who you are, at the top of the screen.
 *
 * The identity line survives every failure: even with no API key at all — the
 * state a first-time user is in — the League Client already told us the name,
 * the level and the icon, so the header stays populated and only the ranked
 * block turns into the "connectez votre compte" call to action.
 */
export function ProfileHeader({
    account,
    profile,
    error,
    isLoading,
    isFetching,
    onRetry,
    onDisconnect,
    onSwitch,
    version,
    /** Name/level/icon known from `GET /api/account/me`, used before and instead. */
    fallback,
}: {
    account: ActiveAccount;
    profile: ProfileResponse | null;
    error: ApiError | null;
    isLoading: boolean;
    isFetching: boolean;
    onRetry: () => void;
    onDisconnect: () => void;
    onSwitch: () => void;
    version: string | null;
    fallback: {
        displayName: string | null;
        summonerLevel: number | null;
        profileIconId: number | null;
        source: "lcu";
    } | null;
}) {
    const riotId =
        formatRiotIdOf(profile) ?? account.riotId ?? fallback?.displayName ?? "Compte connecté";
    const level = profile?.summoner.summonerLevel ?? fallback?.summonerLevel ?? null;
    const iconId = profile?.summoner.profileIconId ?? fallback?.profileIconId ?? null;
    const platform = profile?.platform ?? account.platform;
    const keyMissing = error?.isRiotKeyMissing ?? false;

    return (
        <section className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface-1/90 shadow-panel">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-4 py-4">
                <div className="flex min-w-0 items-center gap-4">
                    <SummonerAvatar
                        name={riotId}
                        version={version}
                        profileIconId={iconId}
                        summonerLevel={level}
                        size="lg"
                    />
                    <div className="min-w-0">
                        <h1 className="truncate text-xl leading-tight font-semibold text-ink-strong">
                            {riotId}
                        </h1>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{platformLabel(platform)}</Badge>
                            {level !== null && (
                                <Badge tone="neutral">
                                    Niveau {formatNumber(level)}
                                </Badge>
                            )}
                            {fallback && (
                                <Badge
                                    tone="info"
                                    icon={<MonitorSmartphone className="h-3 w-3" />}
                                >
                                    Client détecté
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        loading={isFetching}
                        onClick={onRetry}
                        aria-label="Recharger le profil"
                    >
                        Actualiser
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<Users className="h-3.5 w-3.5" />}
                        onClick={onSwitch}
                    >
                        Changer de compte
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        icon={<LogOut className="h-3.5 w-3.5" />}
                        onClick={onDisconnect}
                    >
                        Déconnecter
                    </Button>
                </div>
            </header>

            <div className="p-4">
                <RankedBlock
                    profile={profile}
                    error={error}
                    isLoading={isLoading}
                    keyMissing={keyMissing}
                    onRetry={onRetry}
                />
            </div>
        </section>
    );
}

function RankedBlock({
    profile,
    error,
    isLoading,
    keyMissing,
    onRetry,
}: {
    profile: ProfileResponse | null;
    error: ApiError | null;
    isLoading: boolean;
    keyMissing: boolean;
    onRetry: () => void;
}) {
    if (keyMissing) {
        return (
            <RiotKeyMissingState
                size="sm"
                description="Le client nous dit qui vous êtes, mais les rangs, les maîtrises et l'historique sont hébergés par Riot : ils demandent une clé d'API."
                action={
                    <Link
                        to={ROUTES.settings.path}
                        className={cn(
                            "inline-flex h-8 items-center rounded-control border border-gold/60 bg-gold px-3",
                            "text-xs font-medium text-gold-ink transition-colors hover:bg-gold-bright",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                        )}
                    >
                        Ajouter une clé d'API
                    </Link>
                }
            />
        );
    }

    if (isLoading) {
        return (
            <div className="grid gap-4 lg:grid-cols-[repeat(2,minmax(0,18rem))_minmax(0,1fr)]">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        );
    }

    if (error) {
        return (
            <ErrorState
                size="sm"
                error={error}
                title="Profil indisponible"
                onRetry={onRetry}
            />
        );
    }

    if (!profile) return null;

    return (
        <div className="grid gap-4 lg:grid-cols-[repeat(2,minmax(0,18rem))_minmax(0,1fr)]">
            <RankCard label="Classée solo/duo" entry={profile.ranks.solo} />
            <RankCard label="Classée flexible" entry={profile.ranks.flex} />
            <div className="min-w-0">
                <p className="mb-2 text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                    Maîtrises principales
                </p>
                <MasteryList mastery={profile.mastery} />
            </div>
        </div>
    );
}

function formatRiotIdOf(profile: ProfileResponse | null): string | null {
    if (!profile?.account?.gameName) return null;
    return formatRiotId(profile.account.gameName, profile.account.tagLine);
}
