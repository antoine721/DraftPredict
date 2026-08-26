import { ZodError } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DatasetError } from "@draftpredict/data";
import { isRiotApiError, redactApiKey } from "@draftpredict/riot";

/**
 * Every error that leaves this server is shaped `{ error: { code, message } }`,
 * with an optional `details` for validation failures. The web app matches on
 * `code`, never on the message, so codes are part of the public contract.
 */

export type ApiErrorBody = {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};

export class ApiError extends Error {
    override readonly name = "ApiError";
    readonly statusCode: number;
    readonly code: string;
    readonly details: unknown;

    constructor(
        statusCode: number,
        code: string,
        message: string,
        details?: unknown,
    ) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }

    static badRequest(message: string, details?: unknown): ApiError {
        return new ApiError(400, "VALIDATION_ERROR", message, details);
    }

    static notFound(message: string, code = "NOT_FOUND"): ApiError {
        return new ApiError(404, code, message);
    }

    /**
     * 428 Precondition Required — the client must configure a Riot API key
     * before this route can do anything. The UI turns it into a
     * "connecter mon compte" call to action.
     */
    static riotKeyMissing(): ApiError {
        return new ApiError(
            428,
            "RIOT_KEY_MISSING",
            "No Riot API key is configured. Add one in Settings (POST /api/config) " +
                "to enable account, match history, playstyle and live-game features.",
        );
    }

    toBody(): ApiErrorBody {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.details === undefined ? {} : { details: this.details }),
            },
        };
    }
}

/** Turns a zod failure into the flat `{path, message}` list the UI renders. */
export function zodDetails(error: ZodError): { path: string; message: string }[] {
    return error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
    }));
}

type NormalizedError = {
    statusCode: number;
    body: ApiErrorBody;
    /** Whether this is a server-side fault worth logging at error level. */
    fault: boolean;
};

/** Maps any thrown value onto the wire envelope. Never leaks a Riot API key. */
export function normalizeError(error: unknown): NormalizedError {
    if (error instanceof ApiError) {
        return { statusCode: error.statusCode, body: error.toBody(), fault: false };
    }

    if (error instanceof ZodError) {
        return {
            statusCode: 400,
            body: {
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Request payload is invalid",
                    details: zodDetails(error),
                },
            },
            fault: false,
        };
    }

    if (isRiotApiError(error)) {
        // `toJSON()` is already redacted by the riot package.
        const json = error.toJSON();
        const status = error.status && error.status >= 400 ? error.status : 502;
        return {
            statusCode: status,
            body: {
                error: {
                    code: error.code,
                    message: error.message,
                    details: json,
                },
            },
            fault: status >= 500,
        };
    }

    if (error instanceof DatasetError) {
        return {
            statusCode: error.code === "not-found" ? 404 : 503,
            body: {
                error: {
                    code: `DATASET_${error.code.toUpperCase().replace(/-/g, "_")}`,
                    message: error.message,
                    details: { provider: error.provider },
                },
            },
            fault: false,
        };
    }

    // Fastify's own schema/parse failures.
    const candidate = error as {
        statusCode?: number;
        code?: string;
        message?: string;
        validation?: unknown;
    } | null;

    if (candidate && typeof candidate.statusCode === "number" && candidate.validation) {
        return {
            statusCode: 400,
            body: {
                error: {
                    code: "VALIDATION_ERROR",
                    message: redactApiKey(candidate.message ?? "Invalid request"),
                    details: candidate.validation,
                },
            },
            fault: false,
        };
    }

    if (
        candidate &&
        typeof candidate.statusCode === "number" &&
        candidate.statusCode >= 400 &&
        candidate.statusCode < 500
    ) {
        return {
            statusCode: candidate.statusCode,
            body: {
                error: {
                    code: candidate.code ?? "BAD_REQUEST",
                    message: redactApiKey(candidate.message ?? "Bad request"),
                },
            },
            fault: false,
        };
    }

    return {
        statusCode: 500,
        body: {
            error: {
                code: "INTERNAL_ERROR",
                message: "Internal server error",
            },
        },
        fault: true,
    };
}

export function registerErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
        const normalized = normalizeError(error);

        if (normalized.fault) {
            request.log.error(
                { err: error, url: redactApiKey(request.url) },
                "request failed",
            );
        } else {
            request.log.warn(
                {
                    code: normalized.body.error.code,
                    url: redactApiKey(request.url),
                },
                "request rejected",
            );
        }

        void reply.status(normalized.statusCode).send(normalized.body);
    });
}
