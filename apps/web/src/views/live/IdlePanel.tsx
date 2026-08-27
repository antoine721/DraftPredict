import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ListChecks, RefreshCw, Swords, Users } from "lucide-react";
import type { LcuStatus } from "../../api/types";
import { ROUTES } from "../../app/routes";
import { Badge, Button, Card, Panel } from "../../ui";
import { ClientStatusCard } from "./ClientStatusCard";
import { pollingSentence, type PollingState } from "./helpers";

export type IdlePanelProps = {
    status: LcuStatus | null;
    polling: PollingState;
    /** What is being watched, if anything. */
    watching: string | null;
    isFetching: boolean;
    onRefresh: () => void;
    /** Rendered under the client card — the 428 call to action, typically. */
    footer?: ReactNode;
};

/**
 * The screen most users see most of the time: nothing is happening.
 *
 * It is built as an answer to three questions rather than as a spinner —
 * "suis-je bien connecté ?", "que va-t-il se passer ?" and "quand est-ce que
 * ça se met à jour ?" — because a live screen that says nothing while waiting
 * is indistinguishable from a broken one.
 */
export function IdlePanel({
    status,
    polling,
    watching,
    isFetching,
    onRefresh,
    footer,
}: IdlePanelProps) {
    return (
        <Panel
            title="Aucune partie en cours"
            subtitle="Cet écran se remplit tout seul dès que la sélection des champions démarre."
            actions={
                <Button
                    variant="secondary"
                    size="sm"
                    loading={isFetching}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={onRefresh}
                >
                    Vérifier maintenant
                </Button>
            }
        >
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <ClientStatusCard status={status} />

                    <Card padding="sm" className="flex flex-col gap-1.5">
                        <span className="flex items-center gap-2 text-xs font-medium text-ink-subtle">
                            Surveillance
                            <Badge
                                tone={
                                    polling.paused
                                        ? "warning"
                                        : polling.active
                                          ? "positive"
                                          : "neutral"
                                }
                            >
                                {polling.paused
                                    ? "En pause"
                                    : polling.active
                                      ? "Active"
                                      : "Inactive"}
                            </Badge>
                        </span>
                        <p className="text-sm text-ink-muted">
                            {pollingSentence(polling)}
                        </p>
                        <p className="text-xs text-ink-subtle">
                            {watching
                                ? `Compte suivi : ${watching}.`
                                : "Aucun compte suivi pour l'instant."}
                        </p>
                    </Card>

                    {footer}
                </div>

                <ol className="flex flex-col gap-3">
                    <Step
                        icon={<Users className="h-4 w-4" />}
                        title="Dès la sélection des champions"
                        description="Les deux équipes, les bans, les survols, le chronomètre et le tour en cours apparaissent ici, avec la probabilité de victoire recalculée à chaque changement. Aucune clé d'API n'est nécessaire : tout vient du client League."
                    />
                    <Step
                        icon={<Swords className="h-4 w-4" />}
                        title="Une fois la partie lancée"
                        description="Les dix joueurs, leurs champions, leurs sorts d'invocateur et le temps écoulé s'affichent, avec l'analyse du draft complet. Cette partie-là passe par l'API Riot et demande une clé configurée."
                    />
                    <Step
                        icon={<ListChecks className="h-4 w-4" />}
                        title="En attendant"
                        description={
                            <>
                                Préparez vos picks sur{" "}
                                <Link
                                    to={ROUTES.draft.path}
                                    className="text-gold underline-offset-2 hover:underline"
                                >
                                    le tableau de draft
                                </Link>{" "}
                                : il fonctionne hors partie et se synchronise avec le
                                client quand la sélection commence.
                            </>
                        }
                    />
                </ol>
            </div>
        </Panel>
    );
}

function Step({
    icon,
    title,
    description,
}: {
    icon: ReactNode;
    title: string;
    description: ReactNode;
}) {
    return (
        <li className="flex gap-3 rounded-card border border-line bg-surface-2/50 p-3">
            <span className="mt-0.5 text-gold" aria-hidden>
                {icon}
            </span>
            <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium text-ink-strong">{title}</span>
                <span className="text-sm text-ink-muted">{description}</span>
            </span>
        </li>
    );
}
