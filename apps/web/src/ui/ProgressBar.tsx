import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export type ProgressBarProps = {
    /** 0-1. Values outside the range are clamped. */
    value: number;
    label?: ReactNode;
    /** Right-aligned readout, e.g. `"23 / 50"`. */
    valueLabel?: ReactNode;
    tone?: "gold" | "ally" | "enemy" | "positive" | "neutral";
    size?: "sm" | "md";
    /** Animated stripes while a job is running. */
    indeterminate?: boolean;
    className?: string;
};

const TONES = {
    gold: "bg-gold",
    ally: "bg-team-ally",
    enemy: "bg-team-enemy",
    positive: "bg-positive",
    neutral: "bg-ink-subtle",
} as const;

/** A determinate progress bar — Riot job progress, mastery, sample coverage. */
export function ProgressBar({
    value,
    label,
    valueLabel,
    tone = "gold",
    size = "md",
    indeterminate = false,
    className,
}: ProgressBarProps) {
    const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    return (
        <div className={cn("flex w-full flex-col gap-1.5", className)}>
            {(label !== undefined || valueLabel !== undefined) && (
                <div className="flex items-baseline justify-between gap-3 text-xs">
                    {label !== undefined && (
                        <span className="text-ink-muted">{label}</span>
                    )}
                    {valueLabel !== undefined && (
                        <span className="tabular font-medium text-ink">
                            {valueLabel}
                        </span>
                    )}
                </div>
            )}
            <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={indeterminate ? undefined : Math.round(clamped * 100)}
                className={cn(
                    "w-full overflow-hidden rounded-full bg-surface-3",
                    size === "sm" ? "h-1" : "h-2",
                )}
            >
                <div
                    className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        TONES[tone],
                        indeterminate && "animate-pulse-soft w-1/3",
                    )}
                    style={indeterminate ? undefined : { width: `${clamped * 100}%` }}
                />
            </div>
        </div>
    );
}
