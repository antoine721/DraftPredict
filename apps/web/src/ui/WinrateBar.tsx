import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { formatPercent, formatSignedPercent } from "../lib/format";
import {
    WINRATE_SCALE_MAX,
    WINRATE_SCALE_MIN,
    deltaColor,
    winrateBarShare,
    winrateColor,
    winrateTextClass,
} from "../lib/winrate";

export type WinrateBarProps = {
    /** Ally win probability, 0-1. */
    winrate: number;
    label?: ReactNode;
    /** Hides the `51,2 %` readout. */
    hideValue?: boolean;
    /** Range the bar spans. Defaults to the colour scale (42 %-58 %). */
    min?: number;
    max?: number;
    size?: "sm" | "md" | "lg";
    /** Draws the 50 % reference line. */
    showMidpoint?: boolean;
    className?: string;
};

const HEIGHTS = { sm: "h-1.5", md: "h-2.5", lg: "h-4" } as const;

/**
 * The win-probability bar.
 *
 * The fill is coloured by the same scale as every number in the app, and the
 * 50 % tick is drawn so a player can see at a glance which side of even the
 * draft is on — a bar without that reference is unreadable.
 */
export function WinrateBar({
    winrate,
    label,
    hideValue = false,
    min = WINRATE_SCALE_MIN,
    max = WINRATE_SCALE_MAX,
    size = "md",
    showMidpoint = true,
    className,
}: WinrateBarProps) {
    const share = winrateBarShare(winrate, min, max);
    const midpoint = winrateBarShare(0.5, min, max);
    return (
        <div className={cn("flex w-full flex-col gap-1.5", className)}>
            {(label !== undefined || !hideValue) && (
                <div className="flex items-baseline justify-between gap-3">
                    {label !== undefined && (
                        <span className="text-xs text-ink-muted">{label}</span>
                    )}
                    {!hideValue && (
                        <span
                            className={cn(
                                "tabular text-sm font-semibold",
                                winrateTextClass(winrate),
                            )}
                        >
                            {formatPercent(winrate)}
                        </span>
                    )}
                </div>
            )}
            <div
                role="meter"
                aria-valuemin={Math.round(min * 100)}
                aria-valuemax={Math.round(max * 100)}
                aria-valuenow={Number((winrate * 100).toFixed(1))}
                aria-label={
                    typeof label === "string" ? label : "Probabilité de victoire"
                }
                className={cn(
                    "relative w-full overflow-hidden rounded-full bg-surface-3",
                    HEIGHTS[size],
                )}
            >
                <div
                    className="h-full rounded-full transition-[width,background-color] duration-300"
                    style={{
                        width: `${share * 100}%`,
                        backgroundColor: winrateColor(winrate),
                    }}
                />
                {showMidpoint && (
                    <span
                        aria-hidden
                        className="absolute inset-y-0 w-px bg-ink-strong/45"
                        style={{ left: `${midpoint * 100}%` }}
                    />
                )}
            </div>
        </div>
    );
}

export type DeltaBarProps = {
    /** A win-probability contribution, centred on 0 (e.g. `+0.031`). */
    delta: number;
    /** Half-width of the scale. `0.05` means ±5 points fills the bar. */
    scale?: number;
    label?: ReactNode;
    hideValue?: boolean;
    size?: "sm" | "md";
    className?: string;
};

/**
 * A diverging bar for `breakdown[].winrateDelta`: it grows right from the
 * centre when a contribution helps and left when it hurts.
 */
export function DeltaBar({
    delta,
    scale = 0.05,
    label,
    hideValue = false,
    size = "sm",
    className,
}: DeltaBarProps) {
    const safe = Number.isFinite(delta) ? delta : 0;
    const magnitude = Math.min(1, Math.abs(safe) / Math.max(1e-6, scale));
    const positive = safe >= 0;
    return (
        <div className={cn("flex w-full items-center gap-3", className)}>
            {label !== undefined && (
                <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                    {label}
                </span>
            )}
            <div
                className={cn(
                    "relative w-full max-w-56 overflow-hidden rounded-full bg-surface-3",
                    size === "sm" ? "h-1.5" : "h-2.5",
                )}
            >
                <span
                    aria-hidden
                    className="absolute inset-y-0 left-1/2 w-px bg-ink-strong/30"
                />
                <div
                    className="absolute inset-y-0 transition-[width,left,background-color] duration-300"
                    style={{
                        backgroundColor: deltaColor(safe),
                        width: `${(magnitude * 50).toFixed(2)}%`,
                        left: positive ? "50%" : `${50 - magnitude * 50}%`,
                    }}
                />
            </div>
            {!hideValue && (
                <span
                    className="tabular w-16 shrink-0 text-right text-xs font-semibold"
                    style={{ color: deltaColor(safe) }}
                >
                    {formatSignedPercent(safe)}
                </span>
            )}
        </div>
    );
}

/**
 * A two-sided ally/enemy bar (damage distribution, gold share…).
 * `allyShare` is 0-1; the enemy gets the rest.
 */
export function VersusBar({
    allyShare,
    allyLabel,
    enemyLabel,
    className,
}: {
    allyShare: number;
    allyLabel?: ReactNode;
    enemyLabel?: ReactNode;
    className?: string;
}) {
    const share = Number.isFinite(allyShare)
        ? Math.min(1, Math.max(0, allyShare))
        : 0.5;
    return (
        <div className={cn("flex w-full flex-col gap-1", className)}>
            {(allyLabel !== undefined || enemyLabel !== undefined) && (
                <div className="flex items-baseline justify-between text-xs">
                    <span className="text-team-ally">{allyLabel}</span>
                    <span className="text-team-enemy">{enemyLabel}</span>
                </div>
            )}
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                    className="h-full bg-team-ally transition-[width] duration-300"
                    style={{ width: `${share * 100}%` }}
                />
                <div className="h-full flex-1 bg-team-enemy transition-[width] duration-300" />
            </div>
        </div>
    );
}
