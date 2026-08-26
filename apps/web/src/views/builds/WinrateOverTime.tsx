import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip as ChartTooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCount, formatPercent } from "../../lib";
import { winrateColor } from "../../lib/winrate";
import { EmptyState } from "../../ui";
import { isThinSample, type DurationPoint } from "./stats";

/**
 * Winrate against game duration.
 *
 * Two lines on purpose: the raw winrate of each bucket, and the same numbers
 * shrunk towards 50 % by a prior. The gap between them *is* the uncertainty —
 * where the raw line spikes and the smoothed one does not, the bucket is too
 * small to mean anything.
 */
export function WinrateOverTime({ points }: { points: readonly DurationPoint[] }) {
    const usable = points.filter((point) => point.games > 0);

    if (usable.length === 0) {
        return (
            <EmptyState
                size="sm"
                title="Aucune donnée par durée de partie"
                description="Le jeu de données chargé ne détaille pas les durées pour ce champion dans ce rôle."
            />
        );
    }

    const values = usable.flatMap((point) => [point.winrate, point.adjustedWinrate]);
    const min = Math.min(0.45, ...values) - 0.01;
    const max = Math.max(0.55, ...values) + 0.01;

    return (
        <div className="flex flex-col gap-3">
            <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={usable as DurationPoint[]}
                        margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
                    >
                        <CartesianGrid
                            stroke="var(--color-line)"
                            strokeDasharray="3 3"
                        />
                        <XAxis
                            dataKey="label"
                            tick={{ fill: "var(--color-ink-subtle)", fontSize: 11 }}
                            stroke="var(--color-line-strong)"
                            unit=" min"
                        />
                        <YAxis
                            domain={[min, max]}
                            tickFormatter={(value: number) => formatPercent(value, 0)}
                            tick={{ fill: "var(--color-ink-subtle)", fontSize: 11 }}
                            stroke="var(--color-line-strong)"
                            width={52}
                        />
                        <ReferenceLine
                            y={0.5}
                            stroke="var(--color-ink-subtle)"
                            strokeDasharray="4 4"
                        />
                        <ChartTooltip
                            cursor={{ stroke: "var(--color-line-strong)" }}
                            content={<DurationTooltip />}
                        />
                        <Line
                            type="monotone"
                            dataKey="winrate"
                            name="Winrate brut"
                            stroke="var(--color-gold)"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "var(--color-gold)" }}
                            activeDot={{ r: 5 }}
                            isAnimationActive={false}
                        />
                        <Line
                            type="monotone"
                            dataKey="adjustedWinrate"
                            name="Winrate lissé"
                            stroke="var(--color-info)"
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            dot={false}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="scrollbar-slim overflow-x-auto">
                <table className="w-full min-w-[30rem] border-collapse text-xs">
                    <caption className="sr-only">
                        Taux de victoire et nombre de parties par tranche de durée
                    </caption>
                    <thead>
                        <tr className="text-ink-subtle">
                            <th scope="col" className="py-1 text-left font-medium">
                                Durée
                            </th>
                            {usable.map((point) => (
                                <th
                                    key={point.index}
                                    scope="col"
                                    className="tabular py-1 text-right font-medium"
                                >
                                    {point.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-t border-line-soft">
                            <th
                                scope="row"
                                className="py-1 text-left font-medium text-ink-muted"
                            >
                                Winrate
                            </th>
                            {usable.map((point) => (
                                <td
                                    key={point.index}
                                    className="tabular py-1 text-right font-semibold"
                                    style={{
                                        color: isThinSample(point.games)
                                            ? "var(--color-ink-subtle)"
                                            : winrateColor(point.winrate),
                                    }}
                                >
                                    {formatPercent(point.winrate)}
                                </td>
                            ))}
                        </tr>
                        <tr className="border-t border-line-soft">
                            <th
                                scope="row"
                                className="py-1 text-left font-medium text-ink-muted"
                            >
                                Parties
                            </th>
                            {usable.map((point) => (
                                <td
                                    key={point.index}
                                    className="tabular py-1 text-right text-ink-muted"
                                >
                                    {formatCount(point.games)}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function DurationTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: { payload: DurationPoint }[];
}) {
    const point = payload?.[0]?.payload;
    if (!active || !point) return null;
    return (
        <div className="rounded-control border border-line-strong bg-surface-3 px-2.5 py-1.5 text-xs shadow-pop">
            <p className="font-semibold text-ink-strong">{point.label} minutes</p>
            <p className="tabular text-ink">
                Winrate brut{" "}
                <span style={{ color: winrateColor(point.winrate) }}>
                    {formatPercent(point.winrate)}
                </span>
            </p>
            <p className="tabular text-ink-muted">
                Lissé {formatPercent(point.adjustedWinrate)} ·{" "}
                {formatCount(point.games)} parties
            </p>
        </div>
    );
}
