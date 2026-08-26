import type { Dataset, Rank, Region } from "@draftpredict/core";
import type { DatasetWindow } from "../fixtures/dataset.js";

export type { DatasetWindow };

/**
 * What identifies a dataset.
 *
 * `window` distinguishes the current-patch sample from the 30-day sample.
 * `analyzeDraft` needs both — see {@link DatasetService.getPair} — but a
 * provider only ever loads one at a time, so it travels with the params.
 */
export type DatasetParams = {
    rank: Rank;
    region: Region;
    /** Patch to load, e.g. "16.17". Defaults to the provider's newest. */
    patch?: string;
    /** Defaults to `"patch"`. */
    window?: DatasetWindow;
    /**
     * Cancels an in-flight load. Never part of the cache key — two requests
     * that differ only by signal are the same dataset.
     */
    signal?: AbortSignal;
};

/** A source datasets can be loaded from. */
export type DatasetProvider = {
    /** Stable machine-readable name, used in cache keys and events. */
    name: string;
    /** One line describing where the data comes from, for logs and settings UI. */
    describe(): string;
    load(params: DatasetParams): Promise<Dataset>;
    /** Whether this provider can serve a request right now. Must not throw. */
    available(): Promise<boolean>;
};

export type DatasetErrorCode =
    | "unavailable"
    | "not-found"
    | "network"
    | "timeout"
    | "aborted"
    | "invalid-payload"
    | "io";

/** Every failure this package raises for dataset loading. */
export class DatasetError extends Error {
    override readonly name = "DatasetError";
    readonly code: DatasetErrorCode;
    readonly provider: string | undefined;

    constructor(
        code: DatasetErrorCode,
        message: string,
        options: { provider?: string; cause?: unknown } = {},
    ) {
        super(message, { cause: options.cause });
        this.code = code;
        this.provider = options.provider;
    }

    static is(error: unknown, code?: DatasetErrorCode): error is DatasetError {
        return (
            error instanceof DatasetError && (code === undefined || error.code === code)
        );
    }
}

/** Raised by {@link DatasetService} when no provider could serve a request. */
export class NoProviderAvailableError extends DatasetError {
    readonly failures: { provider: string; error: unknown }[];

    constructor(failures: { provider: string; error: unknown }[]) {
        super(
            "unavailable",
            failures.length === 0
                ? "No dataset providers are configured"
                : `No dataset provider could serve the request (tried ${failures
                      .map((f) => f.provider)
                      .join(", ")})`,
        );
        this.failures = failures;
    }
}

/** Canonical cache key for a set of params. */
export function datasetCacheKey(params: DatasetParams): string {
    return [
        params.window ?? "patch",
        params.rank,
        params.region,
        params.patch ?? "latest",
    ].join("_");
}

/** Fills in the defaults so downstream code never has to. */
export function normalizeParams(
    params: DatasetParams,
): Required<Pick<DatasetParams, "rank" | "region" | "window">> & DatasetParams {
    return {
        ...params,
        rank: params.rank,
        region: params.region,
        window: params.window ?? "patch",
    };
}
