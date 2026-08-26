import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export type TooltipProps = {
    /** The tooltip body. `null`/`""` disables the tooltip entirely. */
    content: ReactNode;
    children: ReactNode;
    side?: TooltipSide;
    /** Widens the bubble for a sentence rather than a label. */
    wide?: boolean;
    className?: string;
    /** Applied to the wrapper, e.g. `block` when wrapping a full-width child. */
    wrapperClassName?: string;
};

const SIDES: Record<TooltipSide, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

/**
 * A CSS-only tooltip: shown on hover *and* on keyboard focus, wired with
 * `aria-describedby`. No positioning library — a fixed side is enough for the
 * labels and sample sizes it carries, and it costs nothing offline.
 */
export function Tooltip({
    content,
    children,
    side = "top",
    wide = false,
    className,
    wrapperClassName,
}: TooltipProps) {
    const id = useId();
    const [visible, setVisible] = useState(false);
    const enabled = content !== null && content !== undefined && content !== "";

    if (!enabled) return <>{children}</>;

    return (
        <span
            className={cn("relative inline-flex", wrapperClassName)}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onFocusCapture={() => setVisible(true)}
            onBlurCapture={() => setVisible(false)}
            aria-describedby={visible ? id : undefined}
        >
            {children}
            <span
                id={id}
                role="tooltip"
                hidden={!visible}
                className={cn(
                    "animate-fade-in pointer-events-none absolute z-40 rounded-control border border-line-strong",
                    "bg-surface-3 px-2.5 py-1.5 text-xs leading-snug text-ink shadow-pop",
                    wide ? "w-64 text-left whitespace-normal" : "whitespace-nowrap",
                    SIDES[side],
                    className,
                )}
            >
                {content}
            </span>
        </span>
    );
}
