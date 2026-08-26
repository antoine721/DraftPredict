import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { Spinner } from "./Spinner";

export type ButtonVariant =
    "primary" | "secondary" | "ghost" | "danger" | "subtle" | "link";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
    "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
    "rounded-control border transition-[background-color,border-color,color,box-shadow] duration-150 " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold " +
    "disabled:cursor-not-allowed disabled:opacity-50 select-none";

const VARIANTS: Record<ButtonVariant, string> = {
    /** The one gold call to action per screen. */
    primary:
        "border-gold/60 bg-gold text-gold-ink hover:bg-gold-bright hover:border-gold-bright " +
        "active:bg-gold-soft shadow-[0_1px_0_0_rgb(255_255_255/0.15)_inset]",
    secondary:
        "border-line-strong bg-surface-3 text-ink hover:bg-surface-4 hover:border-gold/40 " +
        "active:bg-surface-active",
    ghost:
        "border-transparent bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink " +
        "active:bg-surface-active",
    subtle:
        "border-line bg-surface-2 text-ink-muted hover:text-ink hover:bg-surface-3 " +
        "active:bg-surface-active",
    danger:
        "border-negative/50 bg-negative/15 text-negative hover:bg-negative/25 " +
        "hover:border-negative active:bg-negative/30",
    link:
        "border-transparent bg-transparent text-gold underline-offset-4 hover:underline " +
        "px-0 h-auto",
};

const SIZES: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Shows a spinner and disables the button. */
    loading?: boolean;
    /** Rendered before the label; hidden while loading. */
    icon?: ReactNode;
    /** Rendered after the label. */
    trailingIcon?: ReactNode;
    fullWidth?: boolean;
};

/**
 * The button. Gold is reserved for `primary`, which should appear at most once
 * per screen — everything else is a surface with a border.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = "secondary",
        size = "md",
        loading = false,
        icon,
        trailingIcon,
        fullWidth = false,
        className,
        children,
        disabled,
        type = "button",
        ...props
    },
    ref,
) {
    return (
        <button
            ref={ref}
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(
                BASE,
                VARIANTS[variant],
                variant === "link" ? "" : SIZES[size],
                fullWidth && "w-full",
                className,
            )}
            {...props}
        >
            {loading ? (
                <Spinner size={size === "lg" ? "md" : "sm"} className="shrink-0" />
            ) : (
                icon
            )}
            {children}
            {trailingIcon}
        </button>
    );
});

export type IconButtonProps = Omit<ButtonProps, "icon" | "trailingIcon"> & {
    /** Required: an icon-only control must still be announced. */
    label: string;
    icon: ReactNode;
};

const ICON_SIZES: Record<ButtonSize, string> = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
};

/** A square, icon-only button. `label` becomes its accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            label,
            icon,
            variant = "ghost",
            size = "md",
            loading = false,
            className,
            disabled,
            type = "button",
            ...props
        },
        ref,
    ) {
        return (
            <button
                ref={ref}
                type={type}
                aria-label={label}
                title={label}
                disabled={disabled || loading}
                aria-busy={loading || undefined}
                className={cn(
                    BASE,
                    VARIANTS[variant],
                    ICON_SIZES[size],
                    "p-0",
                    className,
                )}
                {...props}
            >
                {loading ? <Spinner size="sm" /> : icon}
            </button>
        );
    },
);
