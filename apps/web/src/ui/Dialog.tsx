import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../lib/cn";
import { IconButton } from "./Button";

export type DialogProps = {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    description?: ReactNode;
    children?: ReactNode;
    /** Buttons, right-aligned under the body. */
    footer?: ReactNode;
    size?: "sm" | "md" | "lg" | "xl";
    /** Set `false` for a destructive confirmation the user must answer. */
    closeOnBackdrop?: boolean;
    className?: string;
};

const SIZES = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-5xl",
} as const;

/**
 * A modal dialog rendered in a portal.
 *
 * Escape closes, the backdrop closes (unless told not to), focus moves into
 * the panel on open and returns to the trigger on close, and Tab is trapped
 * inside — enough for a champion picker or a confirmation without a
 * third-party dependency.
 */
export function Dialog({
    open,
    onClose,
    title,
    description,
    children,
    footer,
    size = "md",
    closeOnBackdrop = true,
    className,
}: DialogProps) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    const focusables = useCallback((): HTMLElement[] => {
        const root = panelRef.current;
        if (!root) return [];
        return [
            ...root.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
            ),
        ].filter(
            (node) => node.offsetParent !== null || node === document.activeElement,
        );
    }, []);

    useEffect(() => {
        if (!open) return;
        previouslyFocused.current = document.activeElement as HTMLElement | null;
        const timer = window.setTimeout(() => {
            const [first] = focusables();
            (first ?? panelRef.current)?.focus();
        }, 0);

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== "Tab") return;
            const nodes = focusables();
            if (nodes.length === 0) return;
            const first = nodes[0]!;
            const last = nodes[nodes.length - 1]!;
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown, true);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.clearTimeout(timer);
            document.removeEventListener("keydown", onKeyDown, true);
            document.body.style.overflow = previousOverflow;
            previouslyFocused.current?.focus?.();
        };
    }, [open, onClose, focusables]);

    if (!open || typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                aria-hidden
                onClick={closeOnBackdrop ? onClose : undefined}
                className="animate-fade-in absolute inset-0 bg-surface-0/80 backdrop-blur-sm"
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={typeof title === "string" ? title : undefined}
                tabIndex={-1}
                className={cn(
                    "animate-rise relative flex max-h-[85vh] w-full flex-col overflow-hidden",
                    "rounded-panel border border-line-strong bg-surface-1 shadow-pop",
                    SIZES[size],
                    className,
                )}
            >
                {(title !== undefined || description !== undefined) && (
                    <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                        <div className="min-w-0">
                            {typeof title === "string" ? (
                                <h2 className="text-base font-semibold text-ink-strong">
                                    {title}
                                </h2>
                            ) : (
                                title
                            )}
                            {description !== undefined && (
                                <p className="mt-1 text-sm text-ink-muted">
                                    {description}
                                </p>
                            )}
                        </div>
                        <IconButton
                            label="Fermer"
                            size="sm"
                            icon={<X className="h-4 w-4" />}
                            onClick={onClose}
                        />
                    </header>
                )}
                <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {children}
                </div>
                {footer !== undefined && (
                    <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                        {footer}
                    </footer>
                )}
            </div>
        </div>,
        document.body,
    );
}
