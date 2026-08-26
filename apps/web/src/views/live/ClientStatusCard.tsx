import { Link } from "react-router-dom";
import { MonitorPlay, Radio, TriangleAlert } from "lucide-react";
import type { LcuStatus } from "../../api/types";
import { ROUTES } from "../../app/routes";
import { cn } from "../../lib/cn";
import { formatRelativeTime, formatRiotId } from "../../lib/format";
import { Badge, Card } from "../../ui";
import { clientState, gameflowPhaseLabel } from "./helpers";

export type ClientStatusCardProps = {
    status: LcuStatus | null;
    className?: string;
};

/**
 * The League Client connection, without euphemisms.
 *
 * `enabled`, `running`, `connected` and `polling` mean four different things
 * and a single green dot would hide three of them. The card gives the sentence
 * first and the raw flags underneath, so a user whose client is running but
 * undetected can see exactly which step failed.
 */
export function ClientStatusCard({ status, className }: ClientStatusCardProps) {
    const state = clientState(status);
    const summoner = status?.summoner ?? null;

    return (
        <Card padding="sm" className={cn("flex flex-col gap-2", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <Badge
                    tone={state.tone}
                    dot={state.live}
                    icon={<MonitorPlay className="h-3 w-3" />}
                >
                    {state.title}
                </Badge>
                {status?.polling && (
                    <Badge tone="warning" icon={<Radio className="h-3 w-3" />}>
                        Mode sondage
                    </Badge>
                )}
                {status?.updatedAt ? (
                    <span className="text-[11px] text-ink-subtle">
                        Relevé {formatRelativeTime(status.updatedAt)}
                    </span>
                ) : null}
            </div>

            <p className="text-sm text-ink-muted">{state.description}</p>

            {summoner && (
                <p className="text-xs text-ink-muted">
                    Compte connecté :{" "}
                    <span className="font-medium text-ink">
                        {summoner.gameName
                            ? formatRiotId(summoner.gameName, summoner.tagLine)
                            : (summoner.displayName ?? "compte inconnu")}
                    </span>
                    {summoner.summonerLevel
                        ? ` · niveau ${summoner.summonerLevel}`
                        : ""}
                </p>
            )}

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-subtle sm:grid-cols-4">
                <Flag label="Intégration" value={status?.enabled ?? false} />
                <Flag label="Recherche" value={status?.running ?? false} />
                <Flag label="Connecté" value={status?.connected ?? false} />
                <div className="flex items-center justify-between gap-2">
                    <dt>Phase</dt>
                    <dd className="truncate text-ink-muted">
                        {gameflowPhaseLabel(status?.phase)}
                    </dd>
                </div>
            </dl>

            {status?.lastError && (
                <p className="flex items-start gap-1.5 text-[11px] text-warning">
                    <TriangleAlert
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        aria-hidden
                    />
                    Dernier incident du client : {status.lastError}
                </p>
            )}

            {status !== null && !status.enabled && (
                <Link
                    to={ROUTES.settings.path}
                    className="text-xs text-gold underline-offset-2 hover:underline"
                >
                    Activer l'intégration au client
                </Link>
            )}
        </Card>
    );
}

function Flag({ label, value }: { label: string; value: boolean }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <dt>{label}</dt>
            <dd className={value ? "text-positive" : "text-ink-subtle"}>
                {value ? "oui" : "non"}
            </dd>
        </div>
    );
}
