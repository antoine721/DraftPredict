import type { ReactNode } from "react";
import { AlertTriangle, Inbox, KeyRound, WifiOff } from "lucide-react";
import { cn } from "../lib/cn";
import { isApiError, toUserMessage } from "../api/errors";
import { Button } from "./Button";

export type EmptyStateProps = {
    /** Usually a `lucide-react` icon; a default is provided. */
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
    size?: "sm" | "md";
};

/** Nothing to show, and that is fine. Never used for failures. */
export function EmptyState({
    icon,
    title,
    description,
    action,
    className,
    size = "md",
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center text-center",
                size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
                className,
            )}
        >
            <span className="text-ink-subtle" aria-hidden>
                {icon ?? <Inbox className={size === "sm" ? "h-6 w-6" : "h-9 w-9"} />}
            </span>
            <p
                className={cn(
                    "font-medium text-ink",
                    size === "sm" ? "text-sm" : "text-base",
                )}
            >
                {title}
            </p>
            {description !== undefined && (
                <p className="max-w-md text-sm text-ink-muted">{description}</p>
            )}
            {action !== undefined && <div className="mt-1">{action}</div>}
        </div>
    );
}

export type ErrorStateProps = {
    /** Anything thrown: an `ApiError`, an `Error`, a string. */
    error?: unknown;
    title?: ReactNode;
    description?: ReactNode;
    onRetry?: () => void;
    retryLabel?: string;
    /** Replaces the retry button, e.g. with a link to the settings. */
    action?: ReactNode;
    className?: string;
    size?: "sm" | "md";
};

/**
 * A failure, explained in French.
 *
 * `RIOT_KEY_MISSING` (428) is deliberately *not* handled here — it is not a
 * failure. Views check `isRiotKeyMissing(error)` first and render
 * {@link RiotKeyMissingState} instead.
 */
export function ErrorState({
    error,
    title,
    description,
    onRetry,
    retryLabel = "Réessayer",
    action,
    className,
    size = "md",
}: ErrorStateProps) {
    const offline = isApiError(error) && error.isNetwork;
    const message = description ?? (error === undefined ? null : toUserMessage(error));
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center text-center",
                size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
                className,
            )}
            role="alert"
        >
            <span className="text-negative" aria-hidden>
                {offline ? (
                    <WifiOff className={size === "sm" ? "h-6 w-6" : "h-9 w-9"} />
                ) : (
                    <AlertTriangle className={size === "sm" ? "h-6 w-6" : "h-9 w-9"} />
                )}
            </span>
            <p
                className={cn(
                    "font-medium text-ink",
                    size === "sm" ? "text-sm" : "text-base",
                )}
            >
                {title ?? (offline ? "Serveur injoignable" : "Une erreur est survenue")}
            </p>
            {message !== null && (
                <p className="max-w-md text-sm text-ink-muted">{message}</p>
            )}
            {action ??
                (onRetry && (
                    <Button variant="secondary" size="sm" onClick={onRetry}>
                        {retryLabel}
                    </Button>
                ))}
        </div>
    );
}

export type RiotKeyMissingStateProps = {
    /** What the account feature needs the key for, in one sentence. */
    description?: ReactNode;
    /** The "connecter mon compte" control — a `<Link>` to /parametres. */
    action?: ReactNode;
    className?: string;
    size?: "sm" | "md";
};

/**
 * The 428 state, as a call to action rather than an error.
 *
 * Every `/api/account/*` route answers `RIOT_KEY_MISSING` until a key is
 * configured; this is what the user sees instead of a red toast.
 */
export function RiotKeyMissingState({
    description = "Ajoutez votre clé d'API Riot dans les paramètres pour afficher votre profil, votre historique et votre style de jeu.",
    action,
    className,
    size = "md",
}: RiotKeyMissingStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center text-center",
                size === "sm" ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
                className,
            )}
        >
            <span className="text-gold" aria-hidden>
                <KeyRound className={size === "sm" ? "h-6 w-6" : "h-9 w-9"} />
            </span>
            <p
                className={cn(
                    "font-medium text-ink",
                    size === "sm" ? "text-sm" : "text-base",
                )}
            >
                Connectez votre compte Riot
            </p>
            <p className="max-w-md text-sm text-ink-muted">{description}</p>
            {action !== undefined && <div className="mt-1">{action}</div>}
        </div>
    );
}
