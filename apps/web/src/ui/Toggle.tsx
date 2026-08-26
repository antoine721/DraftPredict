import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type ToggleProps = {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label?: ReactNode;
    /** Grey line under the label. */
    description?: ReactNode;
    disabled?: boolean;
    size?: "sm" | "md";
    /** Required when there is no visible `label`. */
    ariaLabel?: string;
    className?: string;
    id?: string;
};

/**
 * A switch (`role="switch"`), not a checkbox: it takes effect immediately.
 * "Suivre le client" and every setting in Paramètres use this.
 */
export function Toggle({
    checked,
    onCheckedChange,
    label,
    description,
    disabled = false,
    size = "md",
    ariaLabel,
    className,
    id,
}: ToggleProps) {
    const generatedId = useId();
    const toggleId = id ?? generatedId;
    const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
    const knob = size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5";
    const travel = size === "sm" ? "translate-x-4" : "translate-x-5";

    const control = (
        <button
            type="button"
            id={toggleId}
            role="switch"
            aria-checked={checked}
            aria-label={label === undefined ? ariaLabel : undefined}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                "relative inline-flex shrink-0 items-center rounded-full border transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                "disabled:cursor-not-allowed disabled:opacity-50",
                track,
                checked
                    ? "border-gold/60 bg-gold/80"
                    : "border-line-strong bg-surface-3",
            )}
        >
            <span
                aria-hidden
                className={cn(
                    "pointer-events-none ml-0.5 inline-block rounded-full bg-ink-strong shadow transition-transform",
                    knob,
                    checked ? travel : "translate-x-0",
                )}
            />
        </button>
    );

    if (label === undefined) {
        return <span className={className}>{control}</span>;
    }

    return (
        <div className={cn("flex items-start justify-between gap-4", className)}>
            <div className="min-w-0">
                <label
                    htmlFor={toggleId}
                    className="cursor-pointer text-sm font-medium text-ink"
                >
                    {label}
                </label>
                {description !== undefined && (
                    <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
                )}
            </div>
            {control}
        </div>
    );
}
