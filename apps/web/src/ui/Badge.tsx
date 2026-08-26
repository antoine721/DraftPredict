import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export type BadgeTone =
    | "neutral"
    | "gold"
    | "ally"
    | "enemy"
    | "positive"
    | "negative"
    | "warning"
    | "info"
    | "offline";

const TONES: Record<BadgeTone, string> = {
    neutral: "border-line-strong bg-surface-3 text-ink-muted",
    gold: "border-gold/40 bg-gold/12 text-gold",
    ally: "border-team-ally/40 bg-team-ally/12 text-team-ally",
    enemy: "border-team-enemy/40 bg-team-enemy/12 text-team-enemy",
    positive: "border-positive/40 bg-positive/12 text-positive",
    negative: "border-negative/40 bg-negative/12 text-negative",
    warning: "border-warning/40 bg-warning/12 text-warning",
    info: "border-info/40 bg-info/12 text-info",
    offline: "border-line-strong bg-surface-2 text-ink-subtle",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
    tone?: BadgeTone;
    size?: "sm" | "md";
    /** A small leading dot, e.g. a connection indicator. */
    dot?: boolean;
    icon?: ReactNode;
};

/** A small, static status pill. Never interactive — that is a `Tag` or a button. */
export function Badge({
    tone = "neutral",
    size = "sm",
    dot = false,
    icon,
    className,
    children,
    ...props
}: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap",
                size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
                TONES[tone],
                className,
            )}
            {...props}
        >
            {dot && (
                <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                />
            )}
            {icon}
            {children}
        </span>
    );
}

export type TagProps = HTMLAttributes<HTMLSpanElement> & {
    /** Renders a × that calls this. Makes the tag a filter chip. */
    onRemove?: () => void;
    removeLabel?: string;
    tone?: BadgeTone;
};

/** A removable chip — active filters, selected matchups, champion classes. */
export function Tag({
    onRemove,
    removeLabel = "Retirer",
    tone = "neutral",
    className,
    children,
    ...props
}: TagProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-control border px-2 py-1 text-xs",
                TONES[tone],
                className,
            )}
            {...props}
        >
            {children}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={removeLabel}
                    className="-mr-0.5 ml-0.5 rounded-full px-1 leading-none opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100"
                >
                    ×
                </button>
            )}
        </span>
    );
}
