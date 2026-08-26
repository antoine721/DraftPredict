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
                "relative flex min-w-0 flex-col overflow-hidden rounded-panel border border-line",
                "bg-surface-1/90 shadow-panel backdrop-blur-[2px]",
                className,
            )}
            {...props}
        >
            {hasHeader && (
                <header
                    className={cn(
                        "flex items-start justify-between gap-4 border-b border-line px-4 py-3",
                        stickyHeader &&
                            "sticky top-0 z-10 bg-surface-1/95 backdrop-blur",
                    )}
                >
                    <div className="min-w-0">
                        {typeof title === "string" ? (
                            <h2 className="truncate text-sm font-semibold tracking-wide text-ink-strong uppercase">
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
            <div className={cn("min-w-0 flex-1", flush ? "" : "p-4")}>{children}</div>
            {footer !== undefined && (
                <footer className="border-t border-line px-4 py-3 text-xs text-ink-muted">
                    {footer}
                </footer>
            )}
        </section>
    );
}

/** A thin separator that carries a label, for splitting a panel body. */
export function PanelDivider({ label }: { label?: ReactNode }) {
    if (label === undefined) return <hr className="my-4 border-line" />;
    return (
        <div className="my-4 flex items-center gap-3">
            <hr className="flex-1 border-line" />
            <span className="text-[11px] font-medium tracking-wider text-ink-subtle uppercase">
                {label}
            </span>
            <hr className="flex-1 border-line" />
        </div>
    );
}
