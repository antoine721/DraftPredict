import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatNumber,
    formatPercent,
    formatSignedPercent,
} from "../../lib";
import { deltaColor, winrateTextClass } from "../../lib/winrate";
import { Tooltip } from "../../ui";
import {
    SAMPLE_TIER_LABEL,
    isThinSample,
    sampleTier,
    wilsonInterval,
    type SampleTier,
} from "./stats";

/**
 * The three numbers every row on this screen repeats: a winrate, a delta and
 * the sample they come from.
 *
 * They live together because they must always be read together — a winrate
 * without its sample size is the single most misleading thing this app could
 * put on screen. Anything under {@link FAIR_SAMPLE} games is greyed out and
 * carries its confidence interval in the tooltip.
 */

const TIER_DOT: Record<SampleTier, string> = {
    solid: "bg-positive",
    fair: "bg-info",
    thin: "bg-warning",
    none: "bg-ink-subtle",
};

export function ConfidenceDot({ games }: { games: number }) {
    return (
        <span
            aria-hidden
            className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                TIER_DOT[sampleTier(games)],
            )}
        />
    );
}

/** `1 422 parties`, with the interval and the caveat behind a tooltip. */
export function SampleSize({
    games,
    wins,
    label = "parties",
    className,
    showDot = true,
}: {
    games: number;
    /** Enables the confidence interval in the tooltip. */
    wins?: number;
    label?: string;
    className?: string;
    showDot?: boolean;
}) {
    const tier = sampleTier(games);
    const interval = wins === undefined ? null : wilsonInterval({ wins, games });
    return (
        <Tooltip
            wide
            content={
                <span>
                    <span className="font-semibold">{SAMPLE_TIER_LABEL[tier]}</span> —{" "}
                    {formatNumber(Math.round(games))} {label}
                    {interval && games > 0 ? (
                        <>
                            <br />
                            Intervalle de confiance à 95 % :{" "}
                            {formatPercent(interval.low)} –{" "}
                            {formatPercent(interval.high)}
                        </>
                    ) : null}
                    {isThinSample(games) ? (
                        <>
                            <br />
                            Trop peu de parties pour en tirer une conclusion : le
                            chiffre est affiché en grisé.
                        </>
                    ) : null}
                </span>
            }
        >
            <span
                className={cn(
                    "tabular inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
                    isThinSample(games) ? "text-ink-subtle" : "text-ink-muted",
                    className,
                )}
            >
                {showDot && <ConfidenceDot games={games} />}
                {formatCount(games)}
            </span>
        </Tooltip>
    );
}

/** A winrate, coloured by the shared scale — greyed out when unreliable. */
export function WinrateValue({
    winrate,
    games,
    decimals = 1,
    className,
}: {
    winrate: number;
    /** Sample behind the number; a thin one loses its colour. */
    games?: number;
    decimals?: number;
    className?: string;
}) {
    const thin = games !== undefined && isThinSample(games);
    return (
        <span
            className={cn(
                "tabular font-semibold whitespace-nowrap",
                thin ? "text-ink-subtle" : winrateTextClass(winrate),
                className,
            )}
        >
            {formatPercent(winrate, decimals)}
        </span>
    );
}

/** A win-probability contribution: `+1,4 %`, coloured, greyed when unreliable. */
export function DeltaValue({
    delta,
    games,
    className,
}: {
    delta: number | null;
    games?: number;
    className?: string;
}) {
    if (delta === null) {
        return (
            <span className={cn("tabular text-xs text-ink-subtle", className)}>—</span>
        );
    }
    const thin = games !== undefined && isThinSample(games);
    return (
        <span
            className={cn("tabular font-semibold whitespace-nowrap", className)}
            style={thin ? undefined : { color: deltaColor(delta) }}
        >
            <span className={thin ? "text-ink-subtle" : undefined}>
                {formatSignedPercent(delta)}
            </span>
        </span>
    );
}

/** The inline warning that marks a de-emphasised row. */
export function ThinSampleMark({ games }: { games: number }) {
    if (!isThinSample(games)) return null;
    return (
        <Tooltip
            wide
            content="Échantillon insuffisant : à lire comme une indication, pas comme une statistique."
        >
            <AlertTriangle
                className="h-3.5 w-3.5 text-warning/80"
                aria-label="Échantillon insuffisant"
            />
        </Tooltip>
    );
}

/** A labelled line of the little tables this view is full of. */
export function MetricLine({
    label,
    value,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex items-baseline justify-between gap-3 text-xs",
                className,
            )}
        >
            <span className="min-w-0 truncate text-ink-muted">{label}</span>
            <span className="tabular shrink-0 font-medium text-ink">{value}</span>
        </div>
    );
}
