import { useState } from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { PlaystyleProfile } from "../../api";
import { cn } from "../../lib/cn";
import { NBSP, formatNumber, formatPercent } from "../../lib/format";
import { Badge, Tooltip } from "../../ui";
import {
    AXIS_BASELINE,
    axisVerdict,
    drivingInput,
    formatAxisDelta,
    type AxisDetail,
} from "./helpers";
import {
    PLAYSTYLE_AXES,
    axisDescription,
    axisLabel,
    formatMetric,
    metricLabel,
} from "./labels";

/**
 * The eight axes, one expandable row each.
 *
 * The radar shows the shape; this shows the arithmetic behind it. Opening a
 * row reveals every metric that feeds the axis: the raw per-game value, how it
 * scores against the role baseline, and the weight it carries. A score the
 * user cannot audit is worth very little — this is what makes the radar
 * checkable rather than decorative.
 */
export function AxisTable({
    axes,
    details,
    className,
}: {
    axes: PlaystyleProfile["axes"];
    details: PlaystyleProfile["axisDetails"];
    className?: string;
}) {
    const [open, setOpen] = useState<string | null>(null);

    return (
        <ul className={cn("flex flex-col gap-1.5", className)}>
            {PLAYSTYLE_AXES.map((axis) => {
                const detail = details[axis] as AxisDetail | undefined;
                const score = axes[axis] ?? AXIS_BASELINE;
                const expanded = open === axis;
                return (
                    <li
                        key={axis}
                        className="overflow-hidden rounded-card border border-line bg-surface-2/60"
                    >
                        <AxisRow
                            axis={axis}
                            score={score}
                            detail={detail ?? null}
                            expanded={expanded}
                            onToggle={() => setOpen(expanded ? null : axis)}
                        />
                        {expanded && detail && <AxisBody detail={detail} />}
                    </li>
                );
            })}
        </ul>
    );
}

function AxisRow({
    axis,
    score,
    detail,
    expanded,
    onToggle,
}: {
    axis: string;
    score: number;
    detail: AxisDetail | null;
    expanded: boolean;
    onToggle: () => void;
}) {
    const verdict = axisVerdict(score);
    const driver = drivingInput(detail);

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={`${axisLabel(axis)} : ${Math.round(score)} sur 100, ${verdict.label}. Voir le détail.`}
            className={cn(
                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                "hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold",
            )}
        >
            <ChevronRight
                aria-hidden
                className={cn(
                    "h-4 w-4 shrink-0 text-ink-subtle transition-transform",
                    expanded && "rotate-90",
                )}
            />
            <span className="w-36 shrink-0 truncate text-sm font-medium text-ink">
                {axisLabel(axis)}
            </span>
            <AxisBar score={score} />
            <span
                className={cn(
                    "tabular w-24 shrink-0 text-right text-sm font-semibold",
                    verdict.tone === "positive" && "text-positive",
                    verdict.tone === "negative" && "text-negative",
                    verdict.tone === "neutral" && "text-ink-muted",
                )}
            >
                {formatNumber(score, 0)}
                <span className="text-xs font-normal text-ink-subtle">
                    {NBSP}({formatAxisDelta(verdict.delta)})
                </span>
            </span>
            <span className="hidden w-52 shrink-0 truncate text-xs text-ink-subtle xl:block">
                {driver ? metricLabel(driver.metric) : "—"}
            </span>
            {detail?.lowConfidence && (
                <Tooltip
                    wide
                    content={`Seulement ${detail.sampleSize} parties exploitables sur cet axe : le score est indicatif.`}
                >
                    <AlertTriangle
                        className="h-3.5 w-3.5 shrink-0 text-warning/80"
                        aria-label="Échantillon insuffisant"
                    />
                </Tooltip>
            )}
        </button>
    );
}

/** A 0-100 track with the role baseline marked at 50. */
function AxisBar({ score }: { score: number }) {
    const clamped = Math.min(100, Math.max(0, score));
    const above = clamped >= AXIS_BASELINE;
    const left = above ? AXIS_BASELINE : clamped;
    const width = Math.abs(clamped - AXIS_BASELINE);
    return (
        <span
            aria-hidden
            className="relative hidden h-2 min-w-0 flex-1 rounded-full bg-surface-3 sm:block"
        >
            <span
                className={cn(
                    "absolute top-0 h-full rounded-full",
                    above ? "bg-positive/70" : "bg-negative/70",
                )}
                style={{ left: `${left}%`, width: `${width}%` }}
            />
            <span className="absolute top-[-2px] left-1/2 h-3 w-px -translate-x-1/2 bg-ink-subtle" />
        </span>
    );
}

function AxisBody({ detail }: { detail: AxisDetail }) {
    return (
        <div className="border-t border-line bg-surface-1/60 px-3 py-3">
            <p className="text-xs text-ink-muted">{axisDescription(detail.axis)}</p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={detail.lowConfidence ? "warning" : "neutral"}>
                    {formatNumber(detail.sampleSize)} parties exploitables
                </Badge>
                {detail.lowConfidence && (
                    <span className="text-[11px] text-warning">
                        Trop peu de parties pour conclure sur cet axe.
                    </span>
                )}
            </div>

            {detail.inputs.length === 0 ? (
                <p className="mt-3 text-xs text-ink-subtle">
                    Cet axe est dérivé de la régularité de vos parties, pas d'une
                    moyenne de métriques.
                </p>
            ) : (
                <table className="mt-3 w-full text-xs">
                    <caption className="sr-only">
                        Métriques qui composent l'axe {axisLabel(detail.axis)}
                    </caption>
                    <thead>
                        <tr className="text-left text-xs text-ink-subtle">
                            <th scope="col" className="pb-1 font-medium">
                                Métrique
                            </th>
                            <th scope="col" className="pb-1 text-right font-medium">
                                Votre moyenne
                            </th>
                            <th scope="col" className="pb-1 text-right font-medium">
                                Score
                            </th>
                            <th scope="col" className="pb-1 text-right font-medium">
                                Poids
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {detail.inputs.map((input) => {
                            const verdict = axisVerdict(input.score);
                            return (
                                <tr
                                    key={input.metric}
                                    className="border-t border-line-soft"
                                >
                                    <th
                                        scope="row"
                                        className="py-1.5 pr-2 text-left font-normal text-ink"
                                    >
                                        {metricLabel(input.metric)}
                                    </th>
                                    <td className="tabular py-1.5 text-right text-ink">
                                        {formatMetric(input.metric, input.raw)}
                                    </td>
                                    <td
                                        className={cn(
                                            "tabular py-1.5 text-right font-semibold",
                                            verdict.tone === "positive" &&
                                                "text-positive",
                                            verdict.tone === "negative" &&
                                                "text-negative",
                                            verdict.tone === "neutral" &&
                                                "text-ink-muted",
                                        )}
                                    >
                                        {formatNumber(input.score, 0)}
                                        <span className="font-normal text-ink-subtle">
                                            {NBSP}(
                                            {formatAxisDelta(
                                                input.score - AXIS_BASELINE,
                                            )}
                                            )
                                        </span>
                                    </td>
                                    <td className="tabular py-1.5 text-right text-ink-subtle">
                                        {formatPercent(input.weight, 0)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}

            <p className="mt-2 text-[11px] text-ink-subtle">
                Chaque métrique est comparée à un joueur médian du même rôle (50&nbsp;=
                médiane, 100&nbsp;= très bonne partie), puis pondérée.
            </p>
        </div>
    );
}
