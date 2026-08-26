import type { Dataset } from "@draftpredict/core";
import type { GenerateFixtureDatasetOptions } from "../fixtures/dataset.js";
import { DEFAULT_FIXTURE_SEED, generateFixtureDataset } from "../fixtures/dataset.js";
import { loadStaticData } from "../static/load.js";
import type { StaticData } from "../static/types.js";
import { hash32 } from "../fixtures/rng.js";
import type { DatasetParams, DatasetProvider } from "./types.js";

/**
 * Serves deterministic synthetic datasets built from the bundled champion list.
 *
 * Always available, which makes it the natural last link in a provider chain:
 * the app works offline, in CI and in this container, where every upstream host
 * is blocked.
 */
export type BundledFixtureProviderOptions = {
    /** Base seed. Rank/region/patch are mixed in so each combination differs. */
    seed?: number;
    /** Reuse one static-data instance instead of loading it per call. */
    staticData?: StaticData;
    /** Extra options forwarded to the generator. */
    generatorOptions?: Omit<GenerateFixtureDatasetOptions, "seed" | "window">;
    /** Keep generated datasets in memory. Default `true`. */
    memoize?: boolean;
};

export class BundledFixtureProvider implements DatasetProvider {
    readonly name = "bundled-fixture";

    private readonly seed: number;
    private readonly options: BundledFixtureProviderOptions;
    private readonly cache = new Map<string, Dataset>();
    private staticData: StaticData | undefined;

    constructor(options: BundledFixtureProviderOptions = {}) {
        this.seed = options.seed ?? DEFAULT_FIXTURE_SEED;
        this.options = options;
        this.staticData = options.staticData;
    }

    describe(): string {
        return `Synthetic dataset generated offline from the bundled champion list (seed ${this.seed})`;
    }

    async available(): Promise<boolean> {
        return true;
    }

    async load(params: DatasetParams): Promise<Dataset> {
        const window = params.window ?? "patch";
        const key = `${window}:${params.rank}:${params.region}:${params.patch ?? ""}`;

        const cached = this.cache.get(key);
        if (cached) return cached;

        // Mixing the params into the seed means Iron and Challenger do not get
        // literally the same numbers, while each stays reproducible.
        const seed = (this.seed ^ hash32(`${params.rank}:${params.region}`)) >>> 0;

        const dataset = generateFixtureDataset({
            ...this.options.generatorOptions,
            staticData:
                this.options.generatorOptions?.staticData ?? this.getStaticData(),
            seed,
            window,
        });

        if (this.options.memoize !== false) this.cache.set(key, dataset);
        return dataset;
    }

    private getStaticData(): StaticData {
        this.staticData ??= loadStaticData();
        return this.staticData;
    }
}
