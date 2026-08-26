import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/cn";

export type TabItem<T extends string = string> = {
    value: T;
    label: ReactNode;
    icon?: ReactNode;
    /** Small count/badge on the right of the label. */
    badge?: ReactNode;
    disabled?: boolean;
};

export type TabsProps<T extends string = string> = {
    items: readonly TabItem<T>[];
    /** Controlled value. Omit for an uncontrolled tab strip. */
    value?: T;
    defaultValue?: T;
    onValueChange?: (value: T) => void;
    variant?: "underline" | "pill";
    size?: "sm" | "md";
    className?: string;
    /** Rendered on the right of the strip. */
    actions?: ReactNode;
    /** Panel content, keyed by tab value. Omit to render only the strip. */
    children?: (value: T) => ReactNode;
};

/**
 * An accessible tab strip: `role="tablist"`, roving focus, ← → Home End.
 * Works controlled or uncontrolled.
 */
export function Tabs<T extends string = string>({
    items,
    value,
    defaultValue,
    onValueChange,
    variant = "underline",
    size = "md",
    className,
    actions,
    children,
}: TabsProps<T>) {
    const baseId = useId();
    const [internal, setInternal] = useState<T>(
        defaultValue ?? value ?? (items[0]?.value as T),
    );
    const active = value ?? internal;
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});

    const select = useCallback(
        (next: T) => {
            if (value === undefined) setInternal(next);
            onValueChange?.(next);
        },
        [value, onValueChange],
    );

    const onKeyDown = (event: React.KeyboardEvent) => {
        const enabled = items.filter((item) => !item.disabled);
        if (enabled.length === 0) return;
        const index = enabled.findIndex((item) => item.value === active);
        let nextIndex: number | null = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % enabled.length;
        else if (event.key === "ArrowLeft")
            nextIndex = (index - 1 + enabled.length) % enabled.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = enabled.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        const next = enabled[nextIndex]!.value;
        select(next);
        refs.current[next]?.focus();
    };

    return (
        <div className={cn("flex min-w-0 flex-col", className)}>
            <div
                className={cn(
                    "flex items-center justify-between gap-4",
                    variant === "underline" && "border-b border-line",
                )}
            >
                <div
                    role="tablist"
                    onKeyDown={onKeyDown}
                    className={cn(
                        "scrollbar-slim flex min-w-0 items-center overflow-x-auto",
                        variant === "pill" &&
                            "gap-1 rounded-control border border-line bg-surface-2 p-1",
                    )}
                >
                    {items.map((item) => {
                        const selected = item.value === active;
                        return (
                            <button
                                key={item.value}
                                ref={(node) => {
                                    refs.current[item.value] = node;
                                }}
                                type="button"
                                role="tab"
                                id={`${baseId}-tab-${item.value}`}
                                aria-controls={`${baseId}-panel-${item.value}`}
                                aria-selected={selected}
                                tabIndex={selected ? 0 : -1}
                                disabled={item.disabled}
                                onClick={() => select(item.value)}
                                className={cn(
                                    "inline-flex shrink-0 items-center gap-2 font-medium whitespace-nowrap transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
                                    "disabled:cursor-not-allowed disabled:opacity-40",
                                    size === "sm" ? "text-xs" : "text-sm",
                                    variant === "underline"
                                        ? cn(
                                              "border-b-2 px-3",
                                              size === "sm" ? "py-2" : "py-2.5",
                                              selected
                                                  ? "border-gold text-ink-strong"
                                                  : "border-transparent text-ink-muted hover:text-ink",
                                          )
                                        : cn(
                                              "rounded-[calc(var(--radius-control)-2px)] px-3",
                                              size === "sm" ? "py-1" : "py-1.5",
                                              selected
                                                  ? "bg-surface-4 text-ink-strong"
                                                  : "text-ink-muted hover:bg-surface-3 hover:text-ink",
                                          ),
                                )}
                            >
                                {item.icon}
                                {item.label}
                                {item.badge !== undefined && (
                                    <span className="tabular rounded-full bg-surface-4 px-1.5 py-0.5 text-[10px] text-ink-muted">
                                        {item.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                {actions !== undefined && (
                    <div className="flex shrink-0 items-center gap-2 pb-1">
                        {actions}
                    </div>
                )}
            </div>
            {children && (
                <div
                    role="tabpanel"
                    id={`${baseId}-panel-${active}`}
                    aria-labelledby={`${baseId}-tab-${active}`}
                    className="min-w-0 flex-1 pt-4"
                >
                    {children(active)}
                </div>
            )}
        </div>
    );
}
