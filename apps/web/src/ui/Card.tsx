import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
    /** Raises the card and adds a gold rim on hover — for clickable tiles. */
    interactive?: boolean;
    /** Marks the card as the current selection. */
    selected?: boolean;
    padding?: "none" | "sm" | "md" | "lg";
};

const PADDING = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
} as const;

/** The smallest surface: a bordered box on `surface-2`. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { interactive = false, selected = false, padding = "md", className, ...props },
    ref,
) {
    return (
        <div
            ref={ref}
            data-selected={selected || undefined}
            className={cn(
                "rounded-card border border-line bg-surface-2/80 text-ink",
                PADDING[padding],
                interactive &&
                    "cursor-pointer transition-colors hover:border-gold/50 hover:bg-surface-3 " +
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                selected && "border-gold/70 bg-surface-3 shadow-glow-gold",
                className,
            )}
            {...props}
        />
    );
});

export function CardTitle({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <h3 className={cn("text-sm font-semibold text-ink-strong", className)}>
            {children}
        </h3>
    );
}
