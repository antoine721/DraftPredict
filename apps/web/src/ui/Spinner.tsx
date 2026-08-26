import { cn } from "../lib/cn";

export type SpinnerSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<SpinnerSize, string> = {
    xs: "h-3 w-3 border",
    sm: "h-4 w-4 border-2",
    md: "h-6 w-6 border-2",
    lg: "h-9 w-9 border-[3px]",
};

export type SpinnerProps = {
    size?: SpinnerSize;
    className?: string;
    /** Announced to screen readers; pass `null` for a purely decorative one. */
    label?: string | null;
};

/** A borrowed-from-nothing CSS spinner: no SVG, no asset, works offline. */
export function Spinner({
    size = "md",
    className,
    label = "Chargement…",
}: SpinnerProps) {
    return (
        <span
            role={label ? "status" : undefined}
            aria-label={label ?? undefined}
            aria-hidden={label ? undefined : true}
            className={cn(
                "inline-block shrink-0 animate-spin rounded-full",
                "border-current border-t-transparent opacity-80",
                SIZES[size],
                className,
            )}
        />
    );
}

/** Spinner plus a line of text, centred — the default "loading" body. */
export function LoadingState({
    label = "Chargement…",
    className,
}: {
    label?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-3 px-6 py-12 text-ink-muted",
                className,
            )}
        >
            <Spinner size="lg" label={null} className="text-gold" />
            <p className="text-sm">{label}</p>
        </div>
    );
}
