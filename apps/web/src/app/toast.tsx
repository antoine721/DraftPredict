import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../lib/cn";
import { toUserMessage } from "../api/errors";

/**
 * Toasts.
 *
 * A zustand store rather than a context, so `toast.error(…)` can be called
 * from a mutation callback, a socket handler or a plain function — anywhere,
 * not only inside a component.
 */

export type ToastTone = "info" | "success" | "warning" | "error";

export type Toast = {
    id: string;
    tone: ToastTone;
    title: ReactNode;
    description?: ReactNode;
    /** Milliseconds; `0` keeps the toast until it is dismissed. */
    duration: number;
    action?: { label: string; onClick: () => void };
};

export type ToastInput = Omit<Partial<Toast>, "id" | "title"> & {
    title: ReactNode;
};

type ToastStore = {
    toasts: Toast[];
    push: (toast: ToastInput) => string;
    dismiss: (id: string) => void;
    clear: () => void;
};

const DEFAULT_DURATIONS: Record<ToastTone, number> = {
    info: 4000,
    success: 3500,
    warning: 6000,
    error: 8000,
};

let counter = 0;

export const useToastStore = create<ToastStore>()((set) => ({
    toasts: [],
    push: (input) => {
        counter += 1;
        const id = `toast-${counter}`;
        const tone = input.tone ?? "info";
        const toast: Toast = {
            id,
            tone,
            title: input.title,
            duration: input.duration ?? DEFAULT_DURATIONS[tone],
            ...(input.description === undefined
                ? {}
                : { description: input.description }),
            ...(input.action === undefined ? {} : { action: input.action }),
        };
        set((state) => ({ toasts: [...state.toasts.slice(-4), toast] }));
        return id;
    },
    dismiss: (id) =>
        set((state) => ({ toasts: state.toasts.filter((entry) => entry.id !== id) })),
    clear: () => set({ toasts: [] }),
}));

/** Fire a toast from anywhere — a component, a callback, a socket handler. */
export const toast = {
    show: (input: ToastInput) => useToastStore.getState().push(input),
    info: (title: ReactNode, description?: ReactNode) =>
        useToastStore.getState().push({ title, description, tone: "info" }),
    success: (title: ReactNode, description?: ReactNode) =>
        useToastStore.getState().push({ title, description, tone: "success" }),
    warning: (title: ReactNode, description?: ReactNode) =>
        useToastStore.getState().push({ title, description, tone: "warning" }),
    error: (title: ReactNode, description?: ReactNode) =>
        useToastStore.getState().push({ title, description, tone: "error" }),
    /** Turns any thrown value into a French error toast. */
    fromError: (error: unknown, title: ReactNode = "Échec de l'opération") =>
        useToastStore.getState().push({
            title,
            description: toUserMessage(error),
            tone: "error",
        }),
    dismiss: (id: string) => useToastStore.getState().dismiss(id),
};

/** Same API as {@link toast}, for components that prefer a hook. */
export function useToast(): typeof toast {
    return toast;
}

const TONE_STYLES: Record<ToastTone, string> = {
    info: "border-info/40 bg-surface-2",
    success: "border-positive/40 bg-surface-2",
    warning: "border-warning/40 bg-surface-2",
    error: "border-negative/50 bg-surface-2",
};

const TONE_ICONS: Record<ToastTone, ReactNode> = {
    info: <Info className="h-4 w-4 text-info" />,
    success: <CheckCircle2 className="h-4 w-4 text-positive" />,
    warning: <AlertTriangle className="h-4 w-4 text-warning" />,
    error: <XCircle className="h-4 w-4 text-negative" />,
};

function ToastCard({ toast: entry }: { toast: Toast }) {
    const dismiss = useToastStore((state) => state.dismiss);

    useEffect(() => {
        if (entry.duration <= 0) return;
        const timer = window.setTimeout(() => dismiss(entry.id), entry.duration);
        return () => window.clearTimeout(timer);
    }, [entry.id, entry.duration, dismiss]);

    return (
        <div
            role="status"
            className={cn(
                "animate-rise pointer-events-auto flex w-80 items-start gap-3 rounded-card border p-3 shadow-pop",
                TONE_STYLES[entry.tone],
            )}
        >
            <span className="mt-0.5 shrink-0">{TONE_ICONS[entry.tone]}</span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-strong">{entry.title}</p>
                {entry.description !== undefined && (
                    <p className="mt-0.5 text-xs break-words text-ink-muted">
                        {entry.description}
                    </p>
                )}
                {entry.action && (
                    <button
                        type="button"
                        onClick={() => {
                            entry.action?.onClick();
                            dismiss(entry.id);
                        }}
                        className="mt-2 text-xs font-medium text-gold underline-offset-4 hover:underline"
                    >
                        {entry.action.label}
                    </button>
                )}
            </div>
            <button
                type="button"
                onClick={() => dismiss(entry.id)}
                aria-label="Fermer la notification"
                className="shrink-0 rounded p-1 text-ink-subtle transition-colors hover:text-ink"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

/** Mounted once, at the root. */
export function Toaster() {
    const toasts = useToastStore((state) => state.toasts);
    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
        >
            {toasts.map((entry) => (
                <ToastCard key={entry.id} toast={entry} />
            ))}
        </div>
    );
}
