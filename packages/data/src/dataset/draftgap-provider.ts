import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { Dataset } from "@draftpredict/core";
import type { Logger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import type { DatasetParams, DatasetProvider } from "./types.js";
import { DatasetError } from "./types.js";
import { validateDataset } from "./validate.js";

const gunzipAsync = promisify(gunzip);

/**
 * Reads public DraftGap datasets from `bucket.draftgap.com`.
 *
 * The payloads are gzipped JSON in the v5 format this engine already speaks,
 * so nothing has to be converted — only downloaded, decompressed and checked.
 *
 * The host is unreachable from the dev container, which is the normal case
 * this class is written for: every failure is a typed {@link DatasetError} so
 * {@link DatasetService} can fall through to the next provider instead of
 * surfacing a stack trace.
 */

export const DRAFTGAP_BUCKET_URL = "https://bucket.draftgap.com";

/** The 30-day dataset lives under a fixed path segment rather than a patch. */
export const DRAFTGAP_FULL_WINDOW_SEGMENT = "30";

export type DatasetFetch = (
    input: string,
    init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
    ok: boolean;
    status: number;
    statusText?: string;
    headers?: { get(name: string): string | null };
    arrayBuffer(): Promise<ArrayBuffer>;
}>;

export type DraftGapRemoteProviderOptions = {
    /** Bucket origin. Overridable for mirrors and tests. */
    baseUrl?: string;
    /** Builds the URL for a request. Override if the bucket layout changes. */
    buildUrl?: (params: DatasetParams, baseUrl: string) => string;
    /** Per-request timeout in ms. Default 30000. */
    timeoutMs?: number;
    /** Injected for tests; defaults to the global `fetch`. */
    fetch?: DatasetFetch;
    logger?: Logger;
    /** Cap on the decompressed payload, in bytes. Default 256 MB. */
    maxBytes?: number;
};

export class DraftGapRemoteProvider implements DatasetProvider {
    readonly name = "draftgap-remote";

    private readonly baseUrl: string;
    private readonly timeoutMs: number;
    private readonly logger: Logger;
    private readonly maxBytes: number;
    private readonly fetchImpl: DatasetFetch | undefined;
    private readonly buildUrlImpl: (params: DatasetParams, baseUrl: string) => string;

    constructor(options: DraftGapRemoteProviderOptions = {}) {
        this.baseUrl = (options.baseUrl ?? DRAFTGAP_BUCKET_URL).replace(/\/+$/, "");
        this.timeoutMs = options.timeoutMs ?? 30_000;
        this.logger = options.logger ?? silentLogger;
        this.maxBytes = options.maxBytes ?? 256 * 1024 * 1024;
        this.fetchImpl = options.fetch;
        this.buildUrlImpl = options.buildUrl ?? defaultBuildUrl;
    }

    describe(): string {
        return `Public DraftGap datasets from ${this.baseUrl}`;
    }

    /** URL this provider would request for `params`. */
    urlFor(params: DatasetParams): string {
        return this.buildUrlImpl(params, this.baseUrl);
    }

    async available(): Promise<boolean> {
        return (this.fetchImpl ?? globalThis.fetch) !== undefined;
    }

    async load(params: DatasetParams): Promise<Dataset> {
        const url = this.urlFor(params);
        const buffer = await this.download(url, params.signal);
        const json = await this.decode(buffer, url);
        return validateDataset(json, { source: `${this.name} (${url})` });
    }

    private async download(url: string, signal?: AbortSignal): Promise<Buffer> {
        const fetchImpl =
            this.fetchImpl ?? (globalThis.fetch as DatasetFetch | undefined);
        if (!fetchImpl) {
            throw new DatasetError("unavailable", "No fetch implementation available", {
                provider: this.name,
            });
        }

        if (signal?.aborted) {
            throw new DatasetError("aborted", "Request aborted before it started", {
                provider: this.name,
            });
        }

        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, this.timeoutMs);

        try {
            const response = await fetchImpl(url, { signal: controller.signal });

            if (response.status === 404) {
                throw new DatasetError("not-found", `No dataset at ${url}`, {
                    provider: this.name,
                });
            }
            if (!response.ok) {
                throw new DatasetError(
                    "network",
                    `HTTP ${response.status}${
                        response.statusText ? ` ${response.statusText}` : ""
                    } for ${url}`,
                    { provider: this.name },
                );
            }

            const buffer = Buffer.from(await response.arrayBuffer());
            if (buffer.byteLength > this.maxBytes) {
                throw new DatasetError(
                    "invalid-payload",
                    `Dataset at ${url} is larger than the ${this.maxBytes} byte limit`,
                    { provider: this.name },
                );
            }
            return buffer;
        } catch (error) {
            if (DatasetError.is(error)) throw error;
            if (timedOut) {
                throw new DatasetError(
                    "timeout",
                    `Timed out after ${this.timeoutMs}ms fetching ${url}`,
                    { provider: this.name, cause: error },
                );
            }
            if (signal?.aborted || isAbortError(error)) {
                throw new DatasetError("aborted", `Aborted while fetching ${url}`, {
                    provider: this.name,
                    cause: error,
                });
            }
            throw new DatasetError(
                "network",
                `Could not fetch ${url}: ${describe(error)}`,
                { provider: this.name, cause: error },
            );
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
        }
    }

    private async decode(buffer: Buffer, url: string): Promise<unknown> {
        const raw = isGzip(buffer) ? await this.gunzip(buffer, url) : buffer;

        try {
            return JSON.parse(raw.toString("utf8"));
        } catch (error) {
            throw new DatasetError(
                "invalid-payload",
                `Dataset at ${url} is not valid JSON: ${describe(error)}`,
                { provider: this.name, cause: error },
            );
        }
    }

    private async gunzip(buffer: Buffer, url: string): Promise<Buffer> {
        try {
            return await gunzipAsync(buffer);
        } catch (error) {
            this.logger.debug(`dataset: gunzip failed for ${url}`);
            throw new DatasetError(
                "invalid-payload",
                `Could not decompress the dataset at ${url}: ${describe(error)}`,
                { provider: this.name, cause: error },
            );
        }
    }
}

/**
 * `<base>/datasets/v5/<30 | patch>/<region>/<RANK>.json.gz`
 *
 * The 30-day ("full") dataset sits under a fixed `30` segment; the per-patch
 * dataset under the patch itself, or `latest` when the caller does not pin one.
 */
export function defaultBuildUrl(params: DatasetParams, baseUrl: string): string {
    const windowSegment =
        (params.window ?? "patch") === "full"
            ? DRAFTGAP_FULL_WINDOW_SEGMENT
            : (params.patch ?? "latest");

    return [
        baseUrl,
        "datasets",
        "v5",
        encodeURIComponent(windowSegment),
        encodeURIComponent(params.region),
        `${encodeURIComponent(params.rank)}.json.gz`,
    ].join("/");
}

/** gzip files start with 0x1f 0x8b. */
function isGzip(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function isAbortError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error as { name?: unknown }).name === "AbortError"
    );
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
