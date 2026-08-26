import { cn } from "../lib/cn";

export type SkeletonProps = {
    className?: string;
    /** Pill instead of a rounded rectangle — for avatars and dots. */
    circle?: boolean;
};

/** A shimmering placeholder. Always give it an explicit size. */
export function Skeleton({ className, circle = false }: SkeletonProps) {
    return (
        <div
            aria-hidden
            className={cn(
                "animate-pulse bg-surface-3/80",
                circle ? "rounded-full" : "rounded-card",
                className,
            )}
        />
    );
}

/** N skeleton lines, for a list that is still loading. */
export function SkeletonList({
    rows = 5,
    className,
    rowClassName,
}: {
    rows?: number;
    className?: string;
    rowClassName?: string;
}) {
    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {Array.from({ length: rows }, (_, index) => (
                <Skeleton key={index} className={cn("h-10 w-full", rowClassName)} />
            ))}
        </div>
    );
}
