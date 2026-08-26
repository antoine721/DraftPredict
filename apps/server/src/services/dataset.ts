import type { Dataset, Rank, Region } from "@draftpredict/core";
import type {
    DatasetEntry,
    DatasetParams,
    DatasetService,
    DatasetWindow,
} from "@draftpredict/data";

/**
 * A thin façade over {@link DatasetService} whose only job is honesty.
 *
 * The provider chain silently falls back to a synthetic offline fixture when
 * DraftGap's bucket is unreachable. That is the right behaviour, but the UI
 * must be able to say "données de démonstration hors-ligne" instead of
 * presenting made-up numbers as live statistics — so every dataset-backed
 * response carries the provider that actually served it and the dataset's date.
 */

export type DatasetMeta = {
    rank: Rank;
    region: Region;
    window: DatasetWindow;
    patch: string | null;
    /** Provider that produced the data, e.g. `draftgap-remote`. */
    provider: string;
    /** Cache tier it came out of: memory, disk, provider or stale. */
    source: DatasetEntry["source"];
    /** Dataset format version. */
    version: string;
    /** Day the sample was collected, `YYYY-MM-DD`. */
    date: string;
    championCount: number;
    loadedAt: number;
    /** `true` when the numbers are the offline demo fixture, not real data. */
    offline: boolean;
};

export type DatasetPairMeta = {
    rank: Rank;
    region: Region;
    /** Provider of the current-patch dataset — what the UI shows. */
    provider: string;
    date: string;
    offline: boolean;
    patch: DatasetMeta;
    full: DatasetMeta;
};

export type ResolvedPair = {
    dataset: Dataset;
    fullDataset: Dataset;
    meta: DatasetPairMeta;
};

/** Providers whose data is synthetic and must never be presented as live. */
export const OFFLINE_PROVIDERS = new Set(["bundled-fixture"]);

export type DatasetContextOptions = {
    service: DatasetService;
    /** Rank/region to use when the request does not specify them. */
    defaults: () => { rank: Rank; region: Region };
};

export class DatasetContext {
    readonly service: DatasetService;

    private readonly defaults: () => { rank: Rank; region: Region };
    private last: DatasetMeta | null = null;

    constructor(options: DatasetContextOptions) {
        this.service = options.service;
        this.defaults = options.defaults;
    }

    /** Fills in rank/region from the configuration when they are omitted. */
    resolveParams(params: Partial<DatasetParams> = {}): DatasetParams {
        const defaults = this.defaults();
        return {
            rank: params.rank ?? defaults.rank,
            region: params.region ?? defaults.region,
            ...(params.patch === undefined ? {} : { patch: params.patch }),
            ...(params.window === undefined ? {} : { window: params.window }),
        };
    }

    async getEntry(params: Partial<DatasetParams> = {}): Promise<DatasetEntry> {
        const entry = await this.service.getEntry(this.resolveParams(params));
        this.last = describeEntry(entry);
        return entry;
    }

    async getMeta(params: Partial<DatasetParams> = {}): Promise<DatasetMeta> {
        return describeEntry(await this.getEntry(params));
    }

    /** The `{dataset, fullDataset}` pair the engine needs, plus its provenance. */
    async getPair(params: Partial<DatasetParams> = {}): Promise<ResolvedPair> {
        const resolved = this.resolveParams(params);
        const [patchEntry, fullEntry] = await Promise.all([
            this.service.getEntry({ ...resolved, window: "patch" }),
            this.service.getEntry({ ...resolved, window: "full" }),
        ]);

        const patchMeta = describeEntry(patchEntry);
        const fullMeta = describeEntry(fullEntry);
        this.last = patchMeta;

        return {
            dataset: patchEntry.dataset,
            fullDataset: fullEntry.dataset,
            meta: {
                rank: resolved.rank,
                region: resolved.region,
                provider: patchMeta.provider,
                date: patchMeta.date,
                offline: patchMeta.offline || fullMeta.offline,
                patch: patchMeta,
                full: fullMeta,
            },
        };
    }

    async refresh(params: Partial<DatasetParams> = {}): Promise<DatasetPairMeta> {
        const resolved = this.resolveParams(params);
        await this.service.refreshPair(resolved);
        return (await this.getPair(resolved)).meta;
    }

    /** Last dataset served, without triggering a load. `null` before the first. */
    lastMeta(): DatasetMeta | null {
        return this.last;
    }

    /** One line per provider, in the order they are tried. */
    providers(): string[] {
        return this.service.describeProviders();
    }
}

export function describeEntry(entry: DatasetEntry): DatasetMeta {
    return {
        rank: entry.params.rank,
        region: entry.params.region,
        window: entry.params.window ?? "patch",
        patch: entry.params.patch ?? null,
        provider: entry.provider,
        source: entry.source,
        version: entry.dataset.version,
        date: entry.dataset.date,
        championCount: Object.keys(entry.dataset.championData).length,
        loadedAt: entry.loadedAt,
        offline: OFFLINE_PROVIDERS.has(entry.provider),
    };
}
