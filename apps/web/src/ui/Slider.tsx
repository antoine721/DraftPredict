import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type SliderProps = {
    value: number;
    onValueChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: ReactNode;
    /** Right-aligned value readout in the label row. */
    valueLabel?: ReactNode;
    /** Small captions rendered under the track, evenly spaced. */
    ticks?: ReactNode[];
    disabled?: boolean;
    className?: string;
    id?: string;
    ariaLabel?: string;
};

/**
 * A styled native range input — used for `minGames` and the risk level.
 * Native keeps arrow keys, Home/End and touch dragging working for free.
 */
export function Slider({
    value,
    onValueChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    valueLabel,
    ticks,
    disabled = false,
    className,
    id,
    ariaLabel,
}: SliderProps) {
    const generatedId = useId();
    const sliderId = id ?? generatedId;
    const share = max > min ? (value - min) / (max - min) : 0;
    const percent = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;

    return (
        <div className={cn("flex w-full flex-col gap-2", className)}>
            {(label !== undefined || valueLabel !== undefined) && (
                <div className="flex items-baseline justify-between gap-3">
                    {label !== undefined && (
                        <label
                            htmlFor={sliderId}
                            className="text-xs font-medium tracking-wide text-ink-muted"
                        >
                            {label}
                        </label>
                    )}
                    {valueLabel !== undefined && (
                        <span className="tabular text-xs font-semibold text-ink">
                            {valueLabel}
                        </span>
                    )}
                </div>
            )}
            <input
                id={sliderId}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                aria-label={label === undefined ? ariaLabel : undefined}
                onChange={(event) => onValueChange(Number(event.target.value))}
                style={{
                    background: `linear-gradient(to right, var(--color-gold) 0%, var(--color-gold) ${percent}, var(--color-surface-3) ${percent}, var(--color-surface-3) 100%)`,
                }}
                className={cn(
                    "h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold",
                    "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full",
                    "[&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-gold-deep",
                    "[&::-webkit-slider-thumb]:bg-gold-bright [&::-webkit-slider-thumb]:shadow",
                    "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
                    "[&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-gold-deep",
                    "[&::-moz-range-thumb]:bg-gold-bright",
                )}
            />
            {ticks && ticks.length > 0 && (
                <div className="flex justify-between text-[10px] text-ink-subtle">
                    {ticks.map((tick, index) => (
                        <span key={index}>{tick}</span>
                    ))}
                </div>
            )}
        </div>
    );
}
