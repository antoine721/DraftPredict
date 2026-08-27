import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";

export type PanelProps = HTMLAttributes<HTMLElement> & {
    /** Left side of the header. */
    title?: ReactNode;
    /** Small grey line under the title. */
    subtitle?: ReactNode;
    /** Right side of the header: buttons, badges, a filter. */
    actions?: ReactNode;
    /** Removes the body padding — for tables and lists that bleed to the edge. */
    flush?: boolean;
    /** Sticks the header while the body scrolls. */
    stickyHeader?: boolean;
    footer?: ReactNode;
};

/**
 * The main layout surface: a titled, bordered region on `surface-1`.
 * Panels hold cards; cards never hold panels.
 */
export function Panel({
    title,
    subtitle,
    actions,
    footer,
    flush = false,
    stickyHeader = false,
    className,
    children,
    ...props
}: PanelProps) {
    const hasHeader = title !== undefined || actions !== undefined;
    return (
        <section
            className={cn(
                "relative flex min-w-0 flex-col overflow-hidden rounded-panel",
                // One hairline, no shadow, no blur: depth comes from the surface
                // step, not from stacked effects. Nested panels stop looking
                // like boxes inside boxes.
                "border border-line/70 bg-surface-1",
                className,
            )}
            {...props}
        >
            {hasHeader && (
                <header
                    className={cn(
                        "flex items-start justify-between gap-4 px-4 pt-3.5 pb-2.5",
                        stickyHeader && "sticky top-0 z-10 bg-surface-1",
                    )}
                >
                    <div className="min-w-0">
                        {typeof title === "string" ? (
                            // Sentence case, not caps: hierarchy comes from
                            // weight and colour. A screen of shouting headings
                            // reads as noise.
                            <h2 className="truncate text-sm font-semibold text-ink-strong">
                                {title}
                            </h2>
                        ) : (
                            title
                        )}
                        {subtitle !== undefined && (
                            <div className="mt-0.5 text-xs text-ink-muted">
                                {subtitle}
                            </div>
                        )}
                    </div>
                    {actions !== undefined && (
                        <div className="flex shrink-0 items-center gap-2">
                            {actions}
                        </div>
                    )}
                </header>
            )}
            <div
                className={cn(
                    "min-w-0 flex-1",
                    flush ? "" : hasHeader ? "px-4 pt-1 pb-4" : "p-4",
                )}
            >
                {children}
            </div>
            {footer !== undefined && (
                <footer className="border-t border-line/70 px-4 py-3 text-xs text-ink-muted">
                    {footer}
                </footer>
            )}
        </section>
    );
}

/** A thin separator that carries a label, for splitting a panel body. */
export function PanelDivider({ label }: { label?: ReactNode }) {
    if (label === undefined) return <hr className="my-4 border-line/70" />;
    return (
        <div className="my-4 flex items-center gap-3">
            <span className="text-xs font-medium text-ink-muted">{label}</span>
            <hr className="flex-1 border-line/70" />
        </div>
    );
}
