import { useMemo } from "react";
import {
    Area,
    AreaChart,
    CartesianGrid,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { Hourglass } from "lucide-react";
import type { WinrateByTime } from "@draftpredict/core";
import { NBSP, formatPercent } from "../../lib/format";
import { winrateColor } from "../../lib/winrate";
import { Badge, EmptyState } from "../../ui";
import { durationVerdict } from "./helpers";

export type WinrateOverTimeProps = {
    points: readonly WinrateByTime[] | undefined;
};

type ChartPoint = { duration: number; winrate: number };

const TONES = { early: "warning", late: "info", flat: "neutral" } as const;

/**
 * Win probability against game length.
 *
 * The curve answers a question no single number can: whether this draft wants
 * to end the game at 20 minutes or at 40. The 50 % line is always drawn, and
 * the vertical axis is zoomed on the data — the differences are a couple of
 * points wide and would be invisible on a 0-100 axis.
 */
export function WinrateOverTime({ points }: WinrateOverTimeProps) {
    const data = useMemo<ChartPoint[]>(
        () =>
            (points ?? []).map((point) => ({
                duration: point.duration,
                winrate: point.winrate,
            })),
        [points],
    );

    const verdict = durationVerdict(points ?? []);

    if (data.length === 0) {
        return (
            <EmptyState
                size="sm"
                title="Courbe indisponible"
                description="Placez des champions dans les deux équipes pour voir l'évolution."
            />
        );
    }

    const values = data.map((point) => point.winrate);
    const min = Math.min(...values, 0.5);
    const max = Math.max(...values, 0.5);
    const padding = Math.max(0.004, (max - min) * 0.35);
    const average = values.reduce((total, value) => total + value, 0) / values.length;
    const color = winrateColor(average);

    return (
        <div className="flex flex-col gap-3">
            {verdict && (
                <div className="flex flex-wrap items-center gap-2">
                    <Badge
                        tone={TONES[verdict.tone]}
                        icon={<Hourglass className="h-3 w-3" />}
                    >
                        {verdict.label}
                    </Badge>
                    <p className="min-w-0 flex-1 text-xs text-ink-muted">
                        {verdict.description}
                    </p>
                </div>
            )}

            <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 8, right: 12, bottom: 4, left: -8 }}
                    >
                        <defs>
                            <linearGradient
                                id="winrate-time"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                            >
                                <stop
                                    offset="0%"
                                    stopColor={color}
                                    stopOpacity={0.35}
                                />
                                <stop
                                    offset="100%"
                                    stopColor={color}
                                    stopOpacity={0.02}
                                />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="currentColor"
                            className="text-line"
                        />
                        <XAxis
                            dataKey="duration"
                            tickFormatter={(value: number) => `${value}${NBSP}min`}
                            tick={{ fontSize: 11 }}
                            stroke="currentColor"
                            className="text-ink-subtle"
                        />
                        <YAxis
                            domain={[min - padding, max + padding]}
                            tickFormatter={(value: number) => formatPercent(value, 0)}
                            tick={{ fontSize: 11 }}
                            width={52}
                            stroke="currentColor"
                            className="text-ink-subtle"
                        />
                        <ReferenceLine
                            y={0.5}
                            stroke="currentColor"
                            className="text-ink-subtle"
                            strokeDasharray="4 4"
                        />
                        <RechartsTooltip
                            cursor={{ stroke: color, strokeOpacity: 0.3 }}
                            content={<ChartTooltip />}
                        />
                        <Area
                            type="monotone"
                            dataKey="winrate"
                            stroke={color}
                            strokeWidth={2.5}
                            fill="url(#winrate-time)"
                            dot={{ r: 3, fill: color, strokeWidth: 0 }}
                            activeDot={{ r: 5 }}
                            isAnimationActive
                            animationDuration={500}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

type TooltipProps = {
    active?: boolean;
    payload?: { payload: ChartPoint }[];
};

function ChartTooltip({ active, payload }: TooltipProps) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    return (
        <div className="rounded-control border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs shadow-pop">
            <p className="tabular font-semibold text-ink-strong">
                {formatPercent(point.winrate)}
            </p>
            <p className="text-ink-muted">
                si la partie dure {point.duration}
                {NBSP}min
            </p>
        </div>
    );
}
