import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/cn";

export type SelectOption<T extends string = string> = {
    value: T;
    label: ReactNode;
    disabled?: boolean;
};

export type SelectProps<T extends string = string> = Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    "size" | "onChange" | "value"
> & {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    size?: "sm" | "md";
    options: readonly SelectOption<T>[];
    value?: T;
    /** Typed convenience on top of the native `onChange`. */
    onValueChange?: (value: T) => void;
    containerClassName?: string;
};

/**
 * A styled native `<select>`.
 *
 * Native on purpose: keyboard behaviour, mobile pickers and screen readers all
 * come for free, and a rank/region/risk picker gains nothing from a custom
 * listbox.
 */
function SelectInner<T extends string = string>(
    {
        label,
        hint,
        error,
        size = "md",
        options,
        value,
        onValueChange,
        className,
        containerClassName,
        id,
        ...props
    }: SelectProps<T>,
    ref: React.ForwardedRef<HTMLSelectElement>,
) {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    return (
        <div className={cn("flex w-full flex-col gap-1.5", containerClassName)}>
            {label !== undefined && (
                <label
                    htmlFor={selectId}
                    className="text-xs font-medium tracking-wide text-ink-muted"
                >
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    ref={ref}
                    id={selectId}
                    value={value}
                    aria-invalid={error ? true : undefined}
                    onChange={(event) => onValueChange?.(event.target.value as T)}
                    className={cn(
                        "w-full appearance-none rounded-control border bg-surface-2 pr-9 pl-3 text-ink",
                        "transition-colors focus:border-gold/60 focus:outline-none",
                        "focus-visible:ring-1 focus-visible:ring-gold/40 disabled:cursor-not-allowed disabled:opacity-50",
                        size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
                        error ? "border-negative/70" : "border-line-strong",
                        className,
                    )}
                    {...props}
                >
                    {options.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                            disabled={option.disabled}
                            className="bg-surface-2 text-ink"
                        >
                            {typeof option.label === "string"
                                ? option.label
                                : String(option.value)}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-subtle"
                />
            </div>
            {error ? (
                <p className="text-xs text-negative">{error}</p>
            ) : hint !== undefined ? (
                <p className="text-xs text-ink-subtle">{hint}</p>
            ) : null}
        </div>
    );
}

export const Select = forwardRef(SelectInner) as <T extends string = string>(
    props: SelectProps<T> & { ref?: React.ForwardedRef<HTMLSelectElement> },
) => ReturnType<typeof SelectInner>;
