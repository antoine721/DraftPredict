import type { Dataset } from "@draftpredict/core";
import { Emitter } from "../util/emitter.js";
import type { Unsubscribe } from "../util/emitter.js";
import type { Logger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import { getDatasetCacheDir } from "../util/paths.js";
import { LruCache } from "./cache.js";
import { DiskCache } from "./disk-cache.js";
import type { DatasetParams, DatasetProvider } from "./types.js";
import { datasetCacheKey, DatasetError, NoProviderAvailableError } from "./types.js";
import { validateDataset } from "./validate.js";

/**
 * The one place the rest of the app asks for a dataset.
 *
 * Providers are tried in order, results are cached in memory and on disk with
 * a TTL, and concurrent requests for the same dataset share a single load. The
 * server subscribes to `updated` and pushes a "dataset updated" message to its
 * websocket clients.
 */

export type DatasetSource = "memory" | "disk" | "provider" | "stale";

export type DatasetEntry = {
    dataset: Dataset;
    params: DatasetParams;
    key: string;
    /** Provider that produced the data, or the cache tier that held it. */
    provider: string;
    source: DatasetSource;
    loadedAt: number;
};

export type DatasetPair = {
    /** Current-patch dataset. */
    dataset: Dataset;
    /** 30-day dataset carrying the matchup and synergy samples. */
    fullDataset: Dataset;
};

export type DatasetServiceEvents = {
    /** A dataset was served, from any tier. */
    loaded: DatasetEntry;
    /** A dataset was (re)fetched from a provider — worth pushing to clients. */
    updated: DatasetEntry;
    /** A provider failed. The service may still succeed via another one. */
    error: {
        key: string;
        params: DatasetParams;
        provider: string;
        error: unknown;
    };
    /** Every provider failed and a stale cached copy was served instead. */
    stale: DatasetEntry;
};

export type DatasetServiceOptions = {
    providers: DatasetProvider[];
    /** Entry lifetime for both cache tiers, in ms. Default 6 hours. */
    ttlMs?: number;
    /** Datasets kept in memory. Default 6. */
    maxMemoryEntries?: number;
    /** Disk cache directory. Default `~/.draftpredict/cache`. */
    cacheDir?: string;
    /** Set `false` to keep everything in memory. Default `true`. */
    persist?: boolean;
    /** Serve an expired copy when every provider fails. Default `true`. */
    allowStale?: boolean;
    logger?: Logger;
    now?: () => number;
};

export const DEFAULT_DATASET_TTL_MS = 6 * 60 * 60 * 1000;

export class DatasetService {
    readonly providers: DatasetProvider[];

    private readonly memory: LruCache<DatasetEntry>;
    private readonly disk: DiskCache | undefined;
    private readonly ttlMs: number;
    private readonly allowStale: boolean;
    private readonly logger: Logger;
    private readonly now: () => number;
    private readonly emitter: Emitter<DatasetServiceEvents>;
    private readonly inFlight = new Map<string, Promise<DatasetEntry>>();

    constructor(options: DatasetServiceOptions) {
        this.providers = [...options.providers];
        this.ttlMs = options.ttlMs ?? DEFAULT_DATASET_TTL_MS;
        this.allowStale = options.allowStale ?? true;
        this.logger = options.logger ?? silentLogger;
        this.now = options.now ?? Date.now;

        this.memory = new LruCache<DatasetEntry>({
            maxEntries: options.maxMemoryEntries ?? 6,
            ttlMs: this.ttlMs,
            now: this.now,
        });

        this.disk =
            options.persist === false
                ? undefined
                : new DiskCache({
                      dir: options.cacheDir ?? getDatasetCacheDir(),
                      ttlMs: this.ttlMs,
                      logger: this.logger,
                      now: this.now,
                  });

        this.emitter = new Emitter<DatasetServiceEvents>((event, error) =>
            this.logger.warn(`dataset: a "${String(event)}" listener threw`, error),
        );
    }

    // ------------------------------------------------------------- events ---

    on<K extends keyof DatasetServiceEvents>(
        event: K,
        listener: (payload: DatasetServiceEvents[K]) => void,
    ): Unsubscribe {
        return this.emitter.on(event, listener);
    }

    once<K extends keyof DatasetServiceEvents>(
        event: K,
        listener: (payload: DatasetServiceEvents[K]) => void,
    ): Unsubscribe {
        return this.emitter.once(event, listener);
    }

    off<K extends keyof DatasetServiceEvents>(
        event: K,
        listener: (payload: DatasetServiceEvents[K]) => void,
    ): void {
        this.emitter.off(event, listener);
    }

    // ------------------------------------------------------------ loading ---

    /** One line per provider, in the order they are tried. */
    describeProviders(): string[] {
        return this.providers.map(
            (provider) => `${provider.name}: ${provider.describe()}`,
        );
    }

    async get(params: DatasetParams): Promise<Dataset> {
        return (await this.getEntry(params)).dataset;
    }

    /** The dataset plus where it came from and when. */
    async getEntry(params: DatasetParams): Promise<DatasetEntry> {
        const key = datasetCacheKey(params);

        const memoryEntry = this.memory.getEntry(key);
        if (memoryEntry) {
            const entry = { ...memoryEntry.value, source: "memory" as const };
            this.emitter.emit("loaded", entry);
            return entry;
        }

        return this.loadDeduplicated(key, params, { force: false });
    }

    /**
     * The pair `analyzeDraft` needs: the current-patch dataset and the 30-day
     * dataset. Both are loaded concurrently and cached independently.
     */
    async getPair(params: DatasetParams): Promise<DatasetPair> {
        const [dataset, fullDataset] = await Promise.all([
            this.get({ ...params, window: "patch" }),
            this.get({ ...params, window: "full" }),
        ]);
        return { dataset, fullDataset };
    }

    /** Reloads from the providers, ignoring both cache tiers. */
    async refresh(params: DatasetParams): Promise<Dataset> {
        const key = datasetCacheKey(params);
        return (await this.loadDeduplicated(key, params, { force: true })).dataset;
    }

    /** Refreshes both windows of a params set. */
    async refreshPair(params: DatasetParams): Promise<DatasetPair> {
        const [dataset, fullDataset] = await Promise.all([
            this.refresh({ ...params, window: "patch" }),
            this.refresh({ ...params, window: "full" }),
        ]);
        return { dataset, fullDataset };
    }

    /** Drops one entry from both tiers. */
    invalidate(params: DatasetParams): void {
        const key = datasetCacheKey(params);
        this.memory.delete(key);
        this.disk?.delete(key);
    }

    /** Drops everything from both tiers. */
    clear(): void {
        this.memory.clear();
        this.disk?.clear();
    }

    /** Keys currently held in memory. */
    memoryKeys(): string[] {
        return this.memory.keys();
    }

    /** Number of loads currently in flight. */
    get pendingCount(): number {
        return this.inFlight.size;
    }

    // ----------------------------------------------------------- internals ---

    private loadDeduplicated(
        key: string,
        params: DatasetParams,
        options: { force: boolean },
    ): Promise<DatasetEntry> {
        // Single-flight: ten champ-select updates in one second must not start
        // ten downloads of the same 50 MB file.
        const pending = this.inFlight.get(key);
        if (pending && !options.force) return pending;

        const promise = this.loadEntry(key, params, options).finally(() => {
            if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
        });

        this.inFlight.set(key, promise);
        return promise;
    }

    private async loadEntry(
        key: string,
        params: DatasetParams,
        options: { force: boolean },
    ): Promise<DatasetEntry> {
        if (!options.force) {
            const fromDisk = await this.readDisk(key, params);
            if (fromDisk) {
                this.memory.set(key, fromDisk, this.ttlMs);
                this.emitter.emit("loaded", fromDisk);
                return fromDisk;
            }
        }

        const failures: { provider: string; error: unknown }[] = [];

        for (const provider of this.providers) {
            if (params.signal?.aborted) {
                throw new DatasetError("aborted", "Dataset load aborted");
            }

            try {
                if (!(await provider.available())) {
                    failures.push({
                        provider: provider.name,
                        error: new DatasetError(
                            "unavailable",
                            `${provider.name} reported itself unavailable`,
                            { provider: provider.name },
                        ),
                    });
                    continue;
                }

                const dataset = await provider.load(params);
                const entry: DatasetEntry = {
                    dataset,
                    params: stripSignal(params),
                    key,
                    provider: provider.name,
                    source: "provider",
                    loadedAt: this.now(),
                };

                this.memory.set(key, entry, this.ttlMs);
                await this.disk?.writeAsync(key, entry.dataset, this.ttlMs);

                this.emitter.emit("loaded", entry);
                this.emitter.emit("updated", entry);
                return entry;
            } catch (error) {
                if (DatasetError.is(error, "aborted")) throw error;

                failures.push({ provider: provider.name, error });
                this.logger.warn(
                    `dataset: provider ${provider.name} failed for ${key}: ${describe(error)}`,
                );
                this.emitter.emit("error", {
                    key,
                    params: stripSignal(params),
                    provider: provider.name,
                    error,
                });
            }
        }

        if (this.allowStale) {
            const stale = await this.readStale(key, params);
            if (stale) {
                this.logger.warn(
                    `dataset: every provider failed for ${key}, serving a stale copy`,
                );
                this.emitter.emit("stale", stale);
                this.emitter.emit("loaded", stale);
                return stale;
            }
        }

        throw new NoProviderAvailableError(failures);
    }

    private async readDisk(
        key: string,
        params: DatasetParams,
    ): Promise<DatasetEntry | undefined> {
        const record = await this.disk?.readAsync<Dataset>(key);
        if (!record) return undefined;

        try {
            return {
                dataset: validateDataset(record.value, {
                    source: `disk cache (${key})`,
                }),
                params: stripSignal(params),
                key,
                provider: "disk-cache",
                source: "disk",
                loadedAt: record.storedAt,
            };
        } catch (error) {
            this.logger.warn(
                `dataset: dropping corrupt disk cache entry ${key} (${describe(error)})`,
            );
            this.disk?.delete(key);
            return undefined;
        }
    }

    private async readStale(
        key: string,
        params: DatasetParams,
    ): Promise<DatasetEntry | undefined> {
        const memoryEntry = this.memory.peekStale(key);
        if (memoryEntry) return { ...memoryEntry.value, source: "stale" };

        const record = await this.disk?.readAsync<Dataset>(key, { allowStale: true });
        if (!record) return undefined;

        try {
            return {
                dataset: validateDataset(record.value, {
                    source: `disk cache (${key})`,
                }),
                params: stripSignal(params),
                key,
                provider: "disk-cache",
                source: "stale",
                loadedAt: record.storedAt,
            };
        } catch {
            this.disk?.delete(key);
            return undefined;
        }
    }
}

/** Cached params must not hold on to a consumed AbortSignal. */
function stripSignal(params: DatasetParams): DatasetParams {
    const { signal: _signal, ...rest } = params;
    return rest;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
