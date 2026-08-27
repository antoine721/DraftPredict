import { Radio, TrendingUp } from "lucide-react";
import { cn } from "../../lib/cn";
import {
    formatCount,
    formatPercent,
    formatSigned,
    formatSignedPercent,
} from "../../lib/format";
import { deltaColor, winrateColor, winrateTextClass } from "../../lib/winrate";
import { Badge, Spinner, Tooltip } from "../../ui";

export type WinProbabilityGaugeProps = {
    /** Ally win probability, 0-1. */
    winrate: number;
    /** Projected probability of the champion being previewed, when any. */
    preview?: { winrate: number; label: string } | null;
    /** `result.totalRating`: the additive, Elo-like difference between drafts. */
    totalRating: number;
    /** The smallest sample the prediction rests on. */
    sample?: { games: number; label: string } | null;
    isFetching?: boolean;
    /** The numbers came straight from the League Client push. */
    fromLive?: boolean;
};

/** Half circle of radius 90 centred on (110, 118). */
const ARC = "M 20 118 A 90 90 0 0 1 200 118";

function arcDash(share: number): string {
    const clamped = Math.min(1, Math.max(0, share));
    return `${(clamped * 100).toFixed(2)} 100`;
}

/**
 * The number the whole screen exists for.
 *
 * The arc spans a full 0-100 %, not the compressed colour scale: a draft that
 * is 52 % must *look* close to even, because it is. The colour carries the
 * judgement, the 50 % tick carries the reference, and the rating underneath
 * carries the additive, comparable version of the same thing.
 */
export function WinProbabilityGauge({
    winrate,
    preview = null,
    totalRating,
    sample = null,
    isFetching = false,
    fromLive = false,
}: WinProbabilityGaugeProps) {
    const value = Number.isFinite(winrate) ? winrate : 0.5;
    const previewDelta = preview ? preview.winrate - value : 0;

    return (
        <div className="flex flex-col items-center gap-3">
            <div className="relative w-full max-w-[320px]">
                <svg
                    viewBox="0 0 220 138"
                    className="w-full"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Number((value * 100).toFixed(1))}
                    aria-label="Probabilité de victoire de votre équipe"
                >
                    <path
                        d={ARC}
                        fill="none"
                        stroke="currentColor"
                        className="text-surface-3"
                        strokeWidth={16}
                        strokeLinecap="round"
                        pathLength={100}
                    />
                    {preview && (
                        <path
                            d={ARC}
                            fill="none"
                            stroke={deltaColor(previewDelta)}
                            strokeWidth={16}
                            strokeLinecap="round"
                            strokeOpacity={0.35}
                            pathLength={100}
                            strokeDasharray={arcDash(preview.winrate)}
                            className="transition-[stroke-dasharray] duration-500 ease-out"
                        />
                    )}
                    <path
                        d={ARC}
                        fill="none"
                        stroke={winrateColor(value)}
                        strokeWidth={16}
                        strokeLinecap="round"
                        pathLength={100}
                        strokeDasharray={arcDash(value)}
                        className="transition-[stroke-dasharray,stroke] duration-700 ease-out"
                    />
                    {/* 50 % reference. */}
                    <line
                        x1={110}
                        y1={16}
                        x2={110}
                        y2={36}
                        stroke="currentColor"
                        className="text-ink-subtle"
                        strokeWidth={2}
                    />
                    <text
                        x={20}
                        y={134}
                        textAnchor="start"
                        className="fill-current text-[10px] text-ink-subtle"
                    >
                        0 %
                    </text>
                    <text
                        x={200}
                        y={134}
                        textAnchor="end"
                        className="fill-current text-[10px] text-ink-subtle"
                    >
                        100 %
                    </text>
                </svg>

                <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center">
                    <span
                        className={cn(
                            "tabular text-4xl leading-none font-black",
                            winrateTextClass(value),
                        )}
                    >
                        {formatPercent(value)}
                    </span>
                    <span className="mt-1 text-xs text-ink-subtle">
                        Victoire alliée
                    </span>
                </div>
            </div>

            <div className="flex w-full flex-wrap items-center justify-center gap-2">
                <Tooltip
                    content="Différence de rating entre les deux drafts, sur une échelle de type Elo : 100 points valent environ 14 points de probabilité."
                    wide
                >
                    <Badge tone="neutral" icon={<TrendingUp className="h-3 w-3" />}>
                        <span className="tabular">
                            {formatSigned(totalRating, 1)} pts
                        </span>
                    </Badge>
                </Tooltip>

                {sample && (
                    <Tooltip
                        content={`Le plus petit échantillon utilisé par cette prédiction vient de : ${sample.label}.`}
                        wide
                    >
                        <Badge tone="neutral">
                            <span className="tabular">
                                échantillon min. {formatCount(sample.games)}
                            </span>
                        </Badge>
                    </Tooltip>
                )}

                {fromLive && (
                    <Badge tone="positive" icon={<Radio className="h-3 w-3" />}>
                        Calcul du client
                    </Badge>
                )}
                {isFetching && <Spinner size="xs" />}
            </div>

            {preview && (
                <p className="tabular text-center text-xs text-ink-muted">
                    Avec <span className="text-ink-strong">{preview.label}</span> :{" "}
                    <span
                        className="font-semibold"
                        style={{ color: winrateColor(preview.winrate) }}
                    >
                        {formatPercent(preview.winrate)}
                    </span>{" "}
                    <span style={{ color: deltaColor(previewDelta) }}>
                        ({formatSignedPercent(previewDelta)})
                    </span>
                </p>
            )}
        </div>
    );
}
