import type { ApiErrorBody, ApiErrorCode } from "./types";

/**
 * Every failure the UI can see, in one shape.
 *
 * The server always answers `{error:{code,message,details?}}`; a dead network
 * or an unparsable body is normalised into the same object with the synthetic
 * code `NETWORK_ERROR`, so a component never has to tell a `TypeError` from a
 * 503.
 */
export class ApiError extends Error {
    readonly code: ApiErrorCode;
    readonly status: number;
    readonly details: unknown;
    readonly endpoint: string;

    constructor(options: {
        code: ApiErrorCode;
        message: string;
        status: number;
        details?: unknown;
        endpoint?: string;
        cause?: unknown;
    }) {
        super(
            options.message,
            options.cause === undefined ? {} : { cause: options.cause },
        );
        this.name = "ApiError";
        this.code = options.code;
        this.status = options.status;
        this.details = options.details;
        this.endpoint = options.endpoint ?? "";
    }

    /**
     * 428 `RIOT_KEY_MISSING` — not an error, a call to action. Every
     * `/api/account/*` route answers this until a key is configured.
     */
    get isRiotKeyMissing(): boolean {
        return this.code === "RIOT_KEY_MISSING" || this.status === 428;
    }

    get isNotFound(): boolean {
        return this.code === "NOT_FOUND" || this.status === 404;
    }

    get isRateLimited(): boolean {
        return this.code === "RATE_LIMITED" || this.status === 429;
    }

    get isDatasetUnavailable(): boolean {
        return this.code.startsWith("DATASET_");
    }

    get isNetwork(): boolean {
        return this.code === "NETWORK_ERROR";
    }

    /** Worth retrying automatically: transient transport or server faults. */
    get isRetryable(): boolean {
        if (this.isRiotKeyMissing || this.isNotFound) return false;
        return this.isNetwork || this.isRateLimited || this.status >= 500;
    }

    /** The message to actually show a user, in French. */
    get userMessage(): string {
        return frenchMessage(this);
    }
}

export function isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
}

/** `RIOT_KEY_MISSING` for any thrown value, without a `try`/`instanceof` dance. */
export function isRiotKeyMissing(value: unknown): boolean {
    return isApiError(value) && value.isRiotKeyMissing;
}

export function errorCodeOf(value: unknown): ApiErrorCode | null {
    return isApiError(value) ? value.code : null;
}

/** Parses `{error:{…}}`, tolerating a body that is not one. */
export function parseErrorBody(
    body: unknown,
): { code: string; message: string; details?: unknown } | null {
    if (typeof body !== "object" || body === null) return null;
    const envelope = (body as ApiErrorBody).error;
    if (typeof envelope !== "object" || envelope === null) return null;
    const code = typeof envelope.code === "string" ? envelope.code : "INTERNAL_ERROR";
    const message =
        typeof envelope.message === "string" ? envelope.message : "Erreur inconnue";
    return { code, message, details: envelope.details };
}

const MESSAGES: Record<string, string> = {
    VALIDATION_ERROR: "La requête est invalide.",
    UNKNOWN_CHAMPION: "Ce champion est absent du jeu de données.",
    CHAMPION_ON_BOTH_TEAMS: "Un champion ne peut pas être dans les deux équipes.",
    DUPLICATE_ROLE: "Deux champions occupent le même rôle.",
    INVALID_RIOT_ID: "Le Riot ID doit s'écrire Nom#TAG.",
    RIOT_KEY_INVALID: "Cette clé d'API ne ressemble pas à une clé Riot.",
    RIOT_KEY_REJECTED: "Riot a refusé cette clé d'API (expirée ou révoquée).",
    UNKNOWN_PLATFORM: "Cette région n'existe pas.",
    NOT_FOUND: "Introuvable.",
    LCU_NO_SUMMONER: "Aucun client League of Legends connecté.",
    RIOT_KEY_MISSING: "Aucune clé d'API Riot n'est configurée.",
    RATE_LIMITED: "Riot limite temporairement les requêtes. Réessayez dans un instant.",
    DATASET_UNAVAILABLE: "Aucune source de données n'a pu être chargée.",
    INTERNAL_ERROR: "Le serveur a rencontré une erreur inattendue.",
    NETWORK_ERROR: "Le serveur DraftPredict est injoignable.",
};

function frenchMessage(error: ApiError): string {
    if (error.isDatasetUnavailable) {
        return MESSAGES.DATASET_UNAVAILABLE!;
    }
    return MESSAGES[error.code] ?? error.message ?? "Erreur inconnue";
}

/** A French sentence for any thrown value, `ApiError` or not. */
export function toUserMessage(value: unknown): string {
    if (isApiError(value)) return value.userMessage;
    if (value instanceof Error && value.name === "AbortError") {
        return "Requête annulée.";
    }
    if (value instanceof Error) return value.message;
    return "Erreur inconnue";
}
