import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { Tooltip } from "./Tooltip";

export type StatProps = {
    label: ReactNode;
    value: ReactNode;
    /** Secondary line: a delta, a sample size, a comparison. */
    hint?: ReactNode;
    icon?: ReactNode;
    /** Colour applied to the value — pass `winrateTextClass(w)` or a signed class. */
    valueClassName?: string;
    /** Explains the number on hover/focus. */
    tooltip?: ReactNode;
    align?: "left" | "center" | "right";
    size?: "sm" | "md" | "lg";
    className?: string;
};

const VALUE_SIZES = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl",
} as const;

/** One labelled number. The building block of every summary row. */
export function Stat({
    label,
    value,
    hint,
    icon,
    valueClassName,
    tooltip,
    align = "left",
    size = "md",
    className,
}: StatProps) {
    const body = (
        <div
            className={cn(
                "flex min-w-0 flex-col gap-0.5",
                align === "center" && "items-center text-center",
                align === "right" && "items-end text-right",
                className,
            )}
        >
            <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                {icon}
                {label}
            </span>
            <span
                className={cn(
                    "tabular leading-tight font-semibold text-ink-strong",
                    VALUE_SIZES[size],
                    valueClassName,
                )}
            >
                {value}
            </span>
            {hint !== undefined && (
                <span className="text-xs text-ink-muted">{hint}</span>
            )}
        </div>
    );

    return tooltip === undefined ? (
        body
    ) : (
        <Tooltip content={tooltip} wide wrapperClassName="min-w-0">
            {body}
        </Tooltip>
    );
}

/** A responsive row of {@link Stat}s separated by hairlines. */
export function StatRow({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4",
                className,
            )}
        >
            {children}
        </div>
    );
}
