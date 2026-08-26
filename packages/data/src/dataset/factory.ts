import type { Logger } from "../util/logger.js";
import type { BundledFixtureProviderOptions } from "./fixture-provider.js";
import { BundledFixtureProvider } from "./fixture-provider.js";
import type { DraftGapRemoteProviderOptions } from "./draftgap-provider.js";
import { DraftGapRemoteProvider } from "./draftgap-provider.js";
import type { LocalFileProviderOptions } from "./local-file-provider.js";
import { LocalFileProvider } from "./local-file-provider.js";
import type { DatasetServiceOptions } from "./service.js";
import { DatasetService } from "./service.js";
import type { DatasetProvider } from "./types.js";

/**
 * The provider chain the app ships with, in priority order:
 *
 *  1. datasets built locally by `apps/pipeline`, when a directory is configured,
 *  2. the public DraftGap bucket, when remote data is allowed,
 *  3. the deterministic bundled fixture, which never fails.
 *
 * The fixture at the end is what guarantees the app always has something to
 * analyze — offline, in CI, and in the dev container where both upstreams are
 * blocked.
 */
export type CreateDatasetServiceOptions = Omit<DatasetServiceOptions, "providers"> & {
    /** Directory holding pipeline output. Omitted -> the provider is skipped. */
    localRoot?: string;
    localFileOptions?: LocalFileProviderOptions;
    /** Set `false` to never touch the network. Default `true`. */
    remote?: boolean;
    remoteOptions?: DraftGapRemoteProviderOptions;
    fixtureOptions?: BundledFixtureProviderOptions;
    /** Providers to try before all of the above. */
    extraProviders?: DatasetProvider[];
    logger?: Logger;
};

export function createDatasetService(
    options: CreateDatasetServiceOptions = {},
): DatasetService {
    const {
        localRoot,
        localFileOptions,
        remote,
        remoteOptions,
        fixtureOptions,
        extraProviders,
        ...serviceOptions
    } = options;

    const providers: DatasetProvider[] = [...(extraProviders ?? [])];

    if (localRoot || localFileOptions?.file || localFileOptions?.root) {
        providers.push(
            new LocalFileProvider({
                root: localRoot,
                logger: options.logger,
                ...localFileOptions,
            }),
        );
    }

    if (remote !== false) {
        providers.push(
            new DraftGapRemoteProvider({ logger: options.logger, ...remoteOptions }),
        );
    }

    providers.push(new BundledFixtureProvider(fixtureOptions));

    return new DatasetService({ ...serviceOptions, providers });
}
