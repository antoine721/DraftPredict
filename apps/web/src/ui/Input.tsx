import {
    forwardRef,
    useId,
    type InputHTMLAttributes,
    type ReactNode,
    type TextareaHTMLAttributes,
} from "react";
import { Search, X } from "lucide-react";
import { cn } from "../lib/cn";

const FIELD =
    "w-full rounded-control border bg-surface-2 text-ink placeholder:text-ink-subtle " +
    "transition-colors focus:border-gold/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-gold/40 " +
    "disabled:cursor-not-allowed disabled:opacity-50";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
    label?: ReactNode;
    /** Grey helper line under the field. */
    hint?: ReactNode;
    /** Red line under the field; also flips the border. */
    error?: ReactNode;
    leading?: ReactNode;
    trailing?: ReactNode;
    size?: "sm" | "md";
    containerClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    {
        label,
        hint,
        error,
        leading,
        trailing,
        size = "md",
        className,
        containerClassName,
        id,
        ...props
    },
    ref,
) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error
        ? `${inputId}-error`
        : hint
          ? `${inputId}-hint`
          : undefined;

    return (
        <div className={cn("flex w-full flex-col gap-1.5", containerClassName)}>
            {label !== undefined && (
                <label
                    htmlFor={inputId}
                    className="text-xs font-medium tracking-wide text-ink-muted"
                >
                    {label}
                </label>
            )}
            <div className="relative flex items-center">
                {leading && (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute left-3 flex items-center text-ink-subtle"
                    >
                        {leading}
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={describedBy}
                    className={cn(
                        FIELD,
                        size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
                        leading ? "pl-9" : "pl-3",
                        trailing ? "pr-9" : "pr-3",
                        error ? "border-negative/70" : "border-line-strong",
                        className,
                    )}
                    {...props}
                />
                {trailing && (
                    <span className="absolute right-2 flex items-center">
                        {trailing}
                    </span>
                )}
            </div>
            {error ? (
                <p id={`${inputId}-error`} className="text-xs text-negative">
                    {error}
                </p>
            ) : hint !== undefined ? (
                <p id={`${inputId}-hint`} className="text-xs text-ink-subtle">
                    {hint}
                </p>
            ) : null}
        </div>
    );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    function Textarea({ label, hint, error, className, id, ...props }, ref) {
        const generatedId = useId();
        const fieldId = id ?? generatedId;
        return (
            <div className="flex w-full flex-col gap-1.5">
                {label !== undefined && (
                    <label
                        htmlFor={fieldId}
                        className="text-xs font-medium tracking-wide text-ink-muted"
                    >
                        {label}
                    </label>
                )}
                <textarea
                    ref={ref}
                    id={fieldId}
                    className={cn(
                        FIELD,
                        "min-h-20 px-3 py-2 text-sm",
                        error ? "border-negative/70" : "border-line-strong",
                        className,
                    )}
                    {...props}
                />
                {error ? (
                    <p className="text-xs text-negative">{error}</p>
                ) : hint !== undefined ? (
                    <p className="text-xs text-ink-subtle">{hint}</p>
                ) : null}
            </div>
        );
    },
);

export type SearchInputProps = Omit<InputProps, "leading" | "trailing" | "type"> & {
    /** Called with the new value on every keystroke. */
    onValueChange?: (value: string) => void;
    /** Shows a × that clears the field. */
    onClear?: () => void;
    clearLabel?: string;
};

/**
 * The champion picker's search field: magnifier, clear button, `type="search"`
 * so the browser offers its own affordances, and no debounce — the caller owns
 * that decision.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
    function SearchInput(
        {
            onValueChange,
            onChange,
            onClear,
            clearLabel = "Effacer la recherche",
            value,
            placeholder = "Rechercher un champion…",
            className,
            ...props
        },
        ref,
    ) {
        const hasValue = typeof value === "string" && value.length > 0;
        return (
            <Input
                ref={ref}
                type="search"
                role="searchbox"
                value={value}
                placeholder={placeholder}
                leading={<Search className="h-4 w-4" />}
                trailing={
                    hasValue && onClear ? (
                        <button
                            type="button"
                            onClick={onClear}
                            aria-label={clearLabel}
                            className="rounded-full p-1 text-ink-subtle transition-colors hover:text-ink"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    ) : undefined
                }
                onChange={(event) => {
                    onChange?.(event);
                    onValueChange?.(event.target.value);
                }}
                className={cn("[&::-webkit-search-cancel-button]:hidden", className)}
                {...props}
            />
        );
    },
);
