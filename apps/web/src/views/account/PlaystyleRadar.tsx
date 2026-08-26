import { useMemo } from "react";
import {
    PolarAngleAxis,
    PolarGrid,
    PolarRadiusAxis,
    Radar,
    RadarChart,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
} from "recharts";
import type { PlaystyleProfile } from "../../api";
import { formatNumber } from "../../lib/format";
import { PLAYSTYLE_AXES, axisShortLabel, axisLabel } from "./labels";
import { AXIS_BASELINE, axisVerdict, formatAxisDelta, radarPoints } from "./helpers";

/**
 * The eight axes, against the baseline of the same role.
 *
 * The baseline is drawn *behind* the profile as a filled octagon at 50, which
 * is the whole point: an axis score is meaningless in absolute terms — a
 * support's farm score of 40 is not "bad farming", it is "40 for a support" —
 * and only the distance to the ring means anything. Drawing the ring makes
 * that impossible to misread.
 */
export function PlaystyleRadar({
    axes,
    /** Greys the whole chart out: too few games for the shape to mean much. */
    lowConfidence = false,
    height = 320,
}: {
    axes: PlaystyleProfile["axes"];
    lowConfidence?: boolean;
    height?: number;
}) {
    const data = useMemo(() => radarPoints(axes, PLAYSTYLE_AXES), [axes]);

    return (
        <div
            className={lowConfidence ? "opacity-60" : undefined}
            style={{ height }}
            role="img"
            aria-label={`Profil de style de jeu : ${data
                .map((point) => `${axisLabel(point.axis)} ${Math.round(point.score)}`)
                .join(", ")}. La moyenne du rôle vaut ${AXIS_BASELINE} sur chaque axe.`}
        >
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} outerRadius="70%">
                    <PolarGrid
                        stroke="currentColor"
                        className="text-line"
                        radialLines
                    />
                    <PolarAngleAxis
                        dataKey="axis"
                        tickFormatter={(value: string) => axisShortLabel(value)}
                        tick={{ fontSize: 11, fill: "currentColor" }}
                        className="text-ink-muted"
                    />
                    <PolarRadiusAxis
                        domain={[0, 100]}
                        tickCount={5}
                        angle={90}
                        tick={{ fontSize: 9, fill: "currentColor" }}
                        className="text-ink-subtle"
                        axisLine={false}
                    />
                    <Radar
                        name="Moyenne du rôle"
                        dataKey="baseline"
                        stroke="var(--color-ink-subtle)"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        fill="var(--color-ink-subtle)"
                        fillOpacity={0.1}
                        isAnimationActive={false}
                    />
                    <Radar
                        name="Votre profil"
                        dataKey="score"
                        stroke="var(--color-gold)"
                        strokeWidth={2}
                        fill="var(--color-gold)"
                        fillOpacity={0.22}
                        isAnimationActive
                        animationDuration={500}
                    />
                    <RechartsTooltip content={<AxisTooltip />} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}

type TooltipProps = {
    active?: boolean;
    payload?: { payload: { axis: string; score: number } }[];
};

function AxisTooltip({ active, payload }: TooltipProps) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    const verdict = axisVerdict(point.score);
    return (
        <div className="max-w-64 rounded-control border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs shadow-pop">
            <p className="font-semibold text-ink-strong">{axisLabel(point.axis)}</p>
            <p className="tabular text-ink">
                {formatNumber(point.score, 0)} / 100 ({formatAxisDelta(verdict.delta)})
            </p>
            <p className="text-ink-muted">{verdict.label}</p>
        </div>
    );
}
