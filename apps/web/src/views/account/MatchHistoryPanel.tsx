import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { History, RefreshCw } from "lucide-react";
import type { ApiError, MatchesResponse } from "../../api";
import { cn } from "../../lib/cn";
import {
    NBSP,
    formatNumber,
    formatPercent,
    formatRelativeTime,
} from "../../lib/format";
import { winrateTextClass } from "../../lib/winrate";
import {
    Button,
    EmptyState,
    ErrorState,
    Panel,
    ProgressBar,
    RiotKeyMissingState,
    Skeleton,
    Stat,
    Tooltip,
} from "../../ui";
import { ROUTES } from "../../app/routes";
import { useJobProgress } from "../../api";
import { MatchRow } from "./MatchRow";
import { historyTotals } from "./helpers";
import { jobStageLabel } from "./labels";

export const HISTORY_OPTIONS = [10, 20, 50] as const;

/**
 * The match history: dense rows, one expandable draft each.
 *
 * The summary above the list is computed from the rows actually shown, not
 * taken from anywhere else, and remakes are excluded from it and counted
 * separately — a 0/0/0 fifteen-second remake would otherwise quietly ruin an
 * average.
 */
export function MatchHistoryPanel({
    puuid,
    data,
    error,
    isLoading,
    isFetching,
    onRetry,
    count,
    onCountChange,
    className,
}: {
    puuid: string;
    data: MatchesResponse | null;
    error: ApiError | null;
    isLoading: boolean;
    isFetching: boolean;
    onRetry: () => void;
    count: number;
    onCountChange: (count: number) => void;
    className?: string;
}) {
    const [expanded, setExpanded] = useState<string | null>(null);
    const matches = data?.matches ?? [];
    const totals = useMemo(() => historyTotals(matches), [matches]);
    const progress = useJobProgress("matches", puuid);

    return (
        <Panel
            className={className}
            title="Historique"
            subtitle={
                data
                    ? `${formatNumber(matches.length)} parties chargées${
                          data.skipped.length > 0
                              ? ` — ${formatNumber(data.skipped.length)} illisibles et ignorées`
                              : ""
                      }`
                    : "Vos dernières parties, avec leur draft"
            }
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <div
                        role="group"
                        aria-label="Nombre de parties chargées"
                        className="flex items-center gap-1 rounded-control border border-line bg-surface-2 p-1"
                    >
                        {HISTORY_OPTIONS.map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={option === count}
                                onClick={() => onCountChange(option)}
                                className={cn(
                                    "tabular rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-xs font-medium transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    option === count
                                        ? "bg-surface-4 text-ink-strong"
                                        : "text-ink-muted hover:text-ink",
                                )}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        loading={isFetching}
                        onClick={onRetry}
                        aria-label="Recharger l'historique"
                    >
                        Recharger
                    </Button>
                </div>
            }
        >
            {error?.isRiotKeyMissing ? (
                <RiotKeyMissingState
                    description="L'historique de vos parties est hébergé par Riot : il demande une clé d'API."
                    action={
                        <Link
                            to={ROUTES.settings.path}
                            className="text-sm font-medium text-gold underline-offset-4 hover:underline"
                        >
                            Ajouter une clé d'API Riot
                        </Link>
                    }
                />
            ) : isLoading ? (
                <div className="flex flex-col gap-2">
                    {progress && (
                        <ProgressBar
                            className="mb-2"
                            value={
                                progress.total > 0
                                    ? progress.loaded / progress.total
                                    : 0
                            }
                            indeterminate={progress.total <= 0}
                            label={jobStageLabel(progress.stage)}
                            valueLabel={
                                progress.total > 0
                                    ? `${formatNumber(progress.loaded)}${NBSP}/${NBSP}${formatNumber(progress.total)}`
                                    : undefined
                            }
                        />
                    )}
                    {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-14 w-full" />
                    ))}
                </div>
            ) : error ? (
                <ErrorState
                    error={error}
                    title="Historique indisponible"
                    onRetry={onRetry}
                />
            ) : matches.length === 0 ? (
                <EmptyState
                    icon={<History className="h-9 w-9" />}
                    title="Aucune partie récente"
                    description="Riot ne renvoie aucune partie pour ce compte. Les parties personnalisées et les modes temporaires n'apparaissent pas toujours dans l'historique."
                    action={
                        <Button size="sm" variant="secondary" onClick={onRetry}>
                            Recharger
                        </Button>
                    }
                />
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-4 rounded-card border border-line bg-surface-2/50 px-3 py-2.5 sm:grid-cols-4">
                        <Stat
                            size="sm"
                            label="Winrate"
                            value={formatPercent(totals.winrate, 0)}
                            valueClassName={
                                totals.games >= 5
                                    ? winrateTextClass(totals.winrate)
                                    : "text-ink-subtle"
                            }
                            hint={`${formatNumber(totals.wins)}V / ${formatNumber(totals.games - totals.wins)}D`}
                            tooltip={`Calculé sur les ${formatNumber(totals.games)} parties affichées, hors parties annulées.`}
                        />
                        <Stat
                            size="sm"
                            label="KDA moyen"
                            value={formatNumber(totals.kda, 2)}
                            hint={`${formatNumber(totals.kills)} / ${formatNumber(totals.deaths)} / ${formatNumber(totals.assists)}`}
                        />
                        <Stat
                            size="sm"
                            label="Parties"
                            value={formatNumber(totals.games)}
                            hint={
                                totals.remakes > 0
                                    ? `${formatNumber(totals.remakes)} annulée${totals.remakes > 1 ? "s" : ""} exclue${totals.remakes > 1 ? "s" : ""}`
                                    : "aucune partie annulée"
                            }
                        />
                        <Stat
                            size="sm"
                            label="Dernière partie"
                            value={
                                matches[0]
                                    ? formatRelativeTime(
                                          matches[0].gameEnd || matches[0].gameCreation,
                                      )
                                    : "—"
                            }
                            hint={
                                data?.fetchedAt
                                    ? `chargé ${formatRelativeTime(data.fetchedAt)}`
                                    : undefined
                            }
                        />
                    </div>

                    <Tooltip
                        wide
                        content="Ouvrez une partie pour voir son draft complet et la probabilité de victoire que le moteur aurait donnée avant le premier pick."
                    >
                        <p className="text-[11px] text-ink-subtle">
                            Cliquez une partie pour l'ouvrir.
                        </p>
                    </Tooltip>

                    <ul className="flex flex-col gap-1.5">
                        {matches.map((match) => (
                            <MatchRow
                                key={match.matchId}
                                match={match}
                                expanded={expanded === match.matchId}
                                onToggle={() =>
                                    setExpanded(
                                        expanded === match.matchId
                                            ? null
                                            : match.matchId,
                                    )
                                }
                            />
                        ))}
                    </ul>
                </div>
            )}
        </Panel>
    );
}
