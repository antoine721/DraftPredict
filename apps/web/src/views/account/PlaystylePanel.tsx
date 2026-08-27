import { Link } from "react-router-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "../../lib/cn";
import {
    NBSP,
    formatNumber,
    formatPercent,
    formatRelativeTime,
    roleLongLabels,
} from "../../lib/format";
import {
    Badge,
    Button,
    EmptyState,
    ErrorState,
    Panel,
    ProgressBar,
    RiotKeyMissingState,
    Skeleton,
    Tabs,
    Tooltip,
} from "../../ui";
import { ROUTES } from "../../app/routes";
import { AxisTable } from "./AxisTable";
import { PlaystyleRadar } from "./PlaystyleRadar";
import { TraitList } from "./TraitList";
import { archetypeCopy, jobStageLabel } from "./labels";
import { jobProgressRatio } from "./helpers";
import type { PlaystyleView } from "./hooks";

/**
 * The centrepiece: who you are as a player.
 *
 * Three things make this honest rather than decorative. The sample size is a
 * control, not a footnote — 20, 50 or 100 games, and the answer says which was
 * used. The refresh is a real job: the server reads those games one by one
 * through Riot's rate limiter and streams `job:progress`, so the bar shows the
 * stage and the match counter instead of an indefinite spinner. And every
 * score is expressed against the baseline of the player's own role.
 */

export const SAMPLE_OPTIONS = [20, 50, 100] as const;

export function PlaystylePanel({
    view,
    count,
    onCountChange,
    className,
}: {
    view: PlaystyleView;
    count: number;
    onCountChange: (count: number) => void;
    className?: string;
}) {
    const payload = view.data;
    const profile = payload?.profile ?? null;
    const keyMissing = view.error?.isRiotKeyMissing ?? false;

    return (
        <Panel
            className={className}
            title="Profil de style de jeu"
            subtitle={
                payload
                    ? `${formatNumber(payload.sampleSize)} parties analysées${
                          profile && profile.matchesExcluded > 0
                              ? ` — ${formatNumber(profile.matchesExcluded)} écartées (parties annulées ou trop courtes)`
                              : ""
                      }${payload.cached ? " — résultat en cache" : ""}`
                    : "Huit axes, comparés aux joueurs du même rôle"
            }
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <SampleControl
                        value={count}
                        onChange={onCountChange}
                        disabled={keyMissing}
                    />
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        loading={view.isRefreshing}
                        disabled={keyMissing}
                        onClick={view.refresh}
                        aria-label="Recalculer le profil de style de jeu"
                    >
                        Rafraîchir
                    </Button>
                </div>
            }
        >
            <Body view={view} count={count} />
        </Panel>
    );
}

function SampleControl({
    value,
    onChange,
    disabled,
}: {
    value: number;
    onChange: (count: number) => void;
    disabled: boolean;
}) {
    return (
        <div
            role="group"
            aria-label="Nombre de parties analysées"
            className="flex items-center gap-1 rounded-control border border-line bg-surface-2 p-1"
        >
            {SAMPLE_OPTIONS.map((option) => {
                const active = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        disabled={disabled}
                        aria-pressed={active}
                        onClick={() => onChange(option)}
                        className={cn(
                            "tabular rounded-[calc(var(--radius-control)-2px)] px-2.5 py-1 text-xs font-medium transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                            "disabled:cursor-not-allowed disabled:opacity-40",
                            active
                                ? "bg-surface-4 text-ink-strong"
                                : "text-ink-muted hover:text-ink",
                        )}
                    >
                        {option}
                    </button>
                );
            })}
            <span className="pr-1.5 pl-0.5 text-[11px] text-ink-subtle">parties</span>
        </div>
    );
}

/** The real job progress — reading 50 matches is a minute of rate-limited work. */
export function PlaystyleProgress({ view }: { view: PlaystyleView }) {
    const progress = view.progress;
    if (!view.isFetching && !progress) return null;
    const ratio = jobProgressRatio(progress);
    const indeterminate = !progress || progress.total <= 0;
    return (
        <div className="rounded-card border border-line bg-surface-2/60 px-3 py-3">
            <ProgressBar
                value={ratio}
                indeterminate={indeterminate}
                label={
                    progress
                        ? jobStageLabel(progress.stage)
                        : "Interrogation de l'API Riot"
                }
                valueLabel={
                    progress && progress.total > 0
                        ? `${formatNumber(progress.loaded)}${NBSP}/${NBSP}${formatNumber(progress.total)}`
                        : undefined
                }
            />
            <p className="mt-2 text-[11px] text-ink-subtle">
                Les parties sont lues une par une à travers le limiteur de débit de Riot
                : comptez environ une minute pour cinquante parties.
            </p>
        </div>
    );
}

function Body({ view, count }: { view: PlaystyleView; count: number }) {
    if (view.error?.isRiotKeyMissing) {
        return (
            <RiotKeyMissingState
                description="Le profil de style de jeu se calcule à partir de vos parties, que seule l'API de Riot peut fournir."
                action={
                    <Link
                        to={ROUTES.settings.path}
                        className="text-sm font-medium text-gold underline-offset-4 hover:underline"
                    >
                        Ajouter une clé d'API Riot
                    </Link>
                }
            />
        );
    }

    if (view.isLoading || (view.isRefreshing && !view.data)) {
        return (
            <div className="flex flex-col gap-4">
                <PlaystyleProgress view={view} />
                <div className="grid gap-4 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
                    <Skeleton className="h-72 w-full" />
                    <div className="flex flex-col gap-2">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-16 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (view.error) {
        return (
            <ErrorState
                error={view.error}
                title="Profil de style de jeu indisponible"
                onRetry={view.retry}
            />
        );
    }

    const payload = view.data;
    const profile = payload?.profile;
    if (!payload || !profile) return null;

    if (payload.sampleSize === 0 || profile.matchesAnalyzed === 0) {
        return (
            <EmptyState
                icon={<Sparkles className="h-9 w-9" />}
                title="Aucune partie exploitable"
                description={`Riot n'a renvoyé aucune partie analysable parmi les ${formatNumber(count)} dernières. Jouez une partie classée ou normale de plus de cinq minutes, puis rafraîchissez.`}
                action={
                    <Button size="sm" variant="secondary" onClick={view.refresh}>
                        Rafraîchir
                    </Button>
                }
            />
        );
    }

    const archetype = archetypeCopy(profile.archetype.labelKey, profile.archetype.key);
    const runnerUp = profile.archetype.runnerUp
        ? archetypeCopy(
              `playstyle.archetype.${profile.archetype.runnerUp.key}`,
              profile.archetype.runnerUp.key,
          )
        : null;

    return (
        <div className="flex flex-col gap-4">
            {view.isFetching && <PlaystyleProgress view={view} />}

            <header className="flex flex-col gap-2 rounded-card border border-gold/30 bg-gold/5 px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <p className="text-xs font-medium text-ink-subtle">Archétype</p>
                    <h3 className="text-xl font-semibold text-gold">
                        {archetype.name}
                    </h3>
                    <Tooltip
                        wide
                        content="Écart entre cet archétype et le suivant : plus il est net, plus votre profil est marqué."
                    >
                        <Badge
                            tone={
                                profile.archetype.confidence >= 0.5 ? "gold" : "neutral"
                            }
                        >
                            confiance {formatPercent(profile.archetype.confidence, 0)}
                        </Badge>
                    </Tooltip>
                    {profile.primaryRole !== null && (
                        <Badge tone="neutral">
                            comparé aux {roleLongLabels[profile.primaryRole]}
                        </Badge>
                    )}
                    {profile.lowConfidence && (
                        <Badge tone="warning">échantillon faible</Badge>
                    )}
                </div>
                <p className="max-w-3xl text-sm text-ink">{archetype.summary}</p>
                {runnerUp && (
                    <p className="text-xs text-ink-subtle">
                        Profil le plus proche ensuite&nbsp;: {runnerUp.name}.
                    </p>
                )}
                {payload.fetchedAt > 0 && (
                    <p className="text-[11px] text-ink-subtle">
                        Calculé {formatRelativeTime(payload.fetchedAt)} sur{" "}
                        {formatNumber(payload.sampleSize)} parties.
                    </p>
                )}
            </header>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                    <PlaystyleRadar
                        axes={profile.axes}
                        lowConfidence={profile.lowConfidence}
                    />
                    <p className="text-center text-[11px] text-ink-subtle">
                        L'octogone en pointillés est la moyenne des joueurs du même
                        rôle. 50&nbsp;= médiane, 100&nbsp;= très bonne partie.
                    </p>
                </div>

                <Tabs
                    items={[
                        {
                            value: "traits",
                            label: "Forces & faiblesses",
                            badge:
                                profile.strengths.length + profile.weaknesses.length ||
                                undefined,
                        },
                        { value: "axes", label: "Détail des axes", badge: 8 },
                    ]}
                    defaultValue="traits"
                >
                    {(tab) =>
                        tab === "traits" ? (
                            <div className="grid gap-4 pt-3 lg:grid-cols-2">
                                <section>
                                    <h4 className="mb-2 text-xs font-medium text-ink-subtle">
                                        Forces
                                    </h4>
                                    <TraitList
                                        traits={profile.strengths}
                                        kind="strength"
                                    />
                                </section>
                                <section>
                                    <h4 className="mb-2 text-xs font-medium text-ink-subtle">
                                        Faiblesses
                                    </h4>
                                    <TraitList
                                        traits={profile.weaknesses}
                                        kind="weakness"
                                    />
                                </section>
                            </div>
                        ) : (
                            <AxisTable
                                className="pt-3"
                                axes={profile.axes}
                                details={profile.axisDetails}
                            />
                        )
                    }
                </Tabs>
            </div>
        </div>
    );
}
