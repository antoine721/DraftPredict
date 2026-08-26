import { LcuClient, type LcuClientOptions } from "./client.js";
import {
    discoverCredentials,
    type DiscoverCredentialsOptions,
} from "./discovery/discover.js";

export type ConnectOptions = Omit<LcuClientOptions, "credentials"> & {
    discovery?: DiscoverCredentialsOptions;
};

/**
 * Discovery plus a client, in one call.
 *
 * Returns `null` when the League Client is not running — the caller decides
 * whether to retry (or to use {@link LcuWatcher}, which does it for them).
 */
export async function connectToLcu(
    options: ConnectOptions = {},
): Promise<LcuClient | null> {
    const { discovery, ...clientOptions } = options;
    const credentials = await discoverCredentials({
        ...(clientOptions.logger ? { logger: clientOptions.logger } : {}),
        ...discovery,
    });
    if (!credentials) return null;
    return new LcuClient({ ...clientOptions, credentials });
}
