import { useRef, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, Search, X } from "lucide-react";
import type { ApiError } from "../../api";
import { isRiotKeyMissing } from "../../api";
import type { AccountLookupResponse, LiveGameResponse } from "../../api/types";
import { ROUTES } from "../../app/routes";
import { useFocusSearchTarget } from "../../app/shortcuts";
import { formatRelativeTime, formatRiotId } from "../../lib/format";
import {
    Badge,
    Button,
    EmptyState,
    ErrorState,
    Input,
    LoadingState,
    Panel,
    RiotKeyMissingState,
} from "../../ui";
import { parseRiotId } from "./helpers";

export type SpectatePanelProps = {
    value: string;
    onValueChange: (value: string) => void;
    onSubmit: (riotId: string) => void;
    onClear: () => void;
    /** The Riot ID currently being resolved, once submitted. */
    query: string | null;
    lookup: {
        data: AccountLookupResponse | null;
        error: ApiError | null;
        isLoading: boolean;
    };
    live: {
        data: LiveGameResponse | null;
        error: ApiError | null;
        isLoading: boolean;
        updatedAt: number | null;
    };
    hasRiotApiKey: boolean;
    platform: string;
};

const KEY_ACTION = (
    <Link
        to={ROUTES.settings.path}
        className="inline-flex items-center gap-1.5 rounded-control border border-gold/50 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:bg-gold/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
        Ajouter ma clé d'API Riot
    </Link>
);

/**
 * "Observer n'importe qui" — a Riot ID in, a live game out.
 *
 * The whole flow is two requests (`lookup` then `live`) and each of them has a
 * meaningful failure, so they are reported separately: an unknown Riot ID is
 * not the same answer as "found, but not in a game right now", and neither is
 * an error.
 */
export function SpectatePanel({
    value,
    onValueChange,
    onSubmit,
    onClear,
    query,
    lookup,
    live,
    hasRiotApiKey,
    platform,
}: SpectatePanelProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    useFocusSearchTarget(inputRef);

    const parsed = parseRiotId(value);
    const dirty = value.trim().length > 0;
    const invalid = dirty && parsed === null;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!parsed) return;
        onSubmit(value.trim());
    };

    return (
        <Panel
            title="Observer un joueur"
            subtitle="Entrez un Riot ID pour voir la partie en cours de n'importe quel compte."
            actions={
                query ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={onClear}
                    >
                        Arrêter l'observation
                    </Button>
                ) : undefined
            }
        >
            {!hasRiotApiKey ? (
                <RiotKeyMissingState
                    description="L'observation d'une partie passe par l'API Riot : ajoutez votre clé dans les paramètres pour rechercher un joueur. Le miroir de la sélection des champions, lui, fonctionne sans clé grâce au client League."
                    action={KEY_ACTION}
                    size="sm"
                />
            ) : (
                <div className="flex flex-col gap-4">
                    <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
                        <Input
                            ref={inputRef}
                            containerClassName="max-w-xs"
                            label="Riot ID"
                            placeholder="Nom#TAG"
                            autoComplete="off"
                            spellCheck={false}
                            value={value}
                            leading={<Search className="h-4 w-4" />}
                            onChange={(event) => onValueChange(event.target.value)}
                            error={
                                invalid
                                    ? "Format attendu : Nom#TAG (le tag suit le dièse)."
                                    : undefined
                            }
                            hint={
                                invalid
                                    ? undefined
                                    : `Recherche sur ${platform.toUpperCase()}, la plateforme configurée.`
                            }
                            aria-label="Riot ID du joueur à observer"
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            icon={<Eye className="h-4 w-4" />}
                            disabled={parsed === null}
                            loading={lookup.isLoading}
                        >
                            Voir la partie
                        </Button>
                    </form>

                    <SpectateResult
                        query={query}
                        lookup={lookup}
                        live={live}
                        onRetry={() => query && onSubmit(query)}
                    />
                </div>
            )}
        </Panel>
    );
}

function SpectateResult({
    query,
    lookup,
    live,
    onRetry,
}: {
    query: string | null;
    lookup: SpectatePanelProps["lookup"];
    live: SpectatePanelProps["live"];
    onRetry: () => void;
}) {
    if (!query) {
        return (
            <p className="text-xs text-ink-subtle">
                Astuce : quand le client League tourne, le compte connecté est suivi
                automatiquement, sans rien saisir.
            </p>
        );
    }

    if (lookup.isLoading) {
        return <LoadingState label={`Recherche de ${query}…`} />;
    }

    if (lookup.error) {
        if (isRiotKeyMissing(lookup.error)) {
            return (
                <RiotKeyMissingState
                    description="La recherche de compte demande une clé d'API Riot."
                    action={KEY_ACTION}
                    size="sm"
                />
            );
        }
        if (lookup.error.isNotFound) {
            return (
                <EmptyState
                    size="sm"
                    title={`Aucun compte ne s'appelle ${query}`}
                    description="Vérifiez l'orthographe et le tag, puis la plateforme configurée dans les paramètres : un Riot ID n'existe que sur sa région."
                />
            );
        }
        return (
            <ErrorState
                size="sm"
                error={lookup.error}
                title="Recherche impossible"
                onRetry={onRetry}
            />
        );
    }

    const account = lookup.data;
    if (!account) return null;
    const name = formatRiotId(account.gameName, account.tagLine);

    if (live.isLoading) {
        return <LoadingState label={`Recherche d'une partie en cours pour ${name}…`} />;
    }

    if (live.error) {
        if (isRiotKeyMissing(live.error)) {
            return (
                <RiotKeyMissingState
                    description="L'accès aux parties en cours demande une clé d'API Riot."
                    action={KEY_ACTION}
                    size="sm"
                />
            );
        }
        return (
            <ErrorState
                size="sm"
                error={live.error}
                title={`Impossible de récupérer la partie de ${name}`}
                onRetry={onRetry}
            />
        );
    }

    if (live.data?.inGame) {
        return (
            <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                <Badge tone="positive" dot>
                    En partie
                </Badge>
                {name} est en jeu — le détail est affiché plus haut.
            </p>
        );
    }

    return (
        <EmptyState
            size="sm"
            title={`${name} n'est pas en partie`}
            description={
                live.updatedAt
                    ? `Dernière vérification ${formatRelativeTime(live.updatedAt)}. L'écran se met à jour tout seul si une partie démarre.`
                    : "L'écran se met à jour tout seul si une partie démarre."
            }
        />
    );
}
