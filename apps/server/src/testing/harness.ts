import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { StaticData } from "@draftpredict/data";
import {
    BundledFixtureProvider,
    DatasetService,
    loadStaticData,
} from "@draftpredict/data";
import type { RiotFetch } from "@draftpredict/riot";
import { RiotApiClient } from "@draftpredict/riot";
import type { CreateAppOptions } from "../app.js";
import { createApp } from "../app.js";
import { ConfigService } from "../config/service.js";
import { ConfigStore } from "../config/store.js";
import type { RiotClientFactory } from "../services/riot.js";

/**
 * Test harness.
 *
 * Every test runs against the deterministic bundled fixture, a temporary
 * config directory and no League Client — no network, no `~/.draftpredict`,
 * no shared state between tests.
 */

let cachedStaticData: StaticData | undefined;

export function testStaticData(): StaticData {
    return (cachedStaticData ??= loadStaticData());
}

export function testDatasetService(providers?: DatasetService["providers"]): DatasetService {
    return new DatasetService({
        providers: providers ?? [
            new BundledFixtureProvider({ staticData: testStaticData() }),
        ],
        persist: false,
    });
}

export type TestApp = {
    app: FastifyInstance;
    config: ConfigService;
    configDir: string;
    close(): Promise<void>;
};

export type TestAppOptions = CreateAppOptions & {
    env?: NodeJS.ProcessEnv;
    /** Fake transport for the Riot client, when a test needs one. */
    riotFetch?: RiotFetch;
};

export async function createTestApp(
    options: TestAppOptions = {},
): Promise<TestApp> {
    const configDir = mkdtempSync(join(tmpdir(), "draftpredict-test-"));

    const config =
        options.config ??
        new ConfigService({
            store: new ConfigStore({ dir: configDir }),
            env: options.env ?? {},
            allowProbe: false,
        });

    const riotClientFactory: RiotClientFactory | undefined = options.riotFetch
        ? ({ apiKey, platform }) =>
              new RiotApiClient({
                  apiKey,
                  platform,
                  fetch: options.riotFetch as RiotFetch,
                  cache: false,
                  maxRetries: 0,
              })
        : options.riotClientFactory;

    const app = await createApp({
        lcuWatcher: null,
        startLcu: false,
        heartbeatMs: 0,
        logger: false,
        webRoot: null,
        ...options,
        config,
        staticData: options.staticData ?? testStaticData(),
        datasetService: options.datasetService ?? testDatasetService(),
        ...(riotClientFactory ? { riotClientFactory } : {}),
    });

    await app.ready();

    return {
        app,
        config,
        configDir,
        async close() {
            await app.close();
            rmSync(configDir, { recursive: true, force: true });
        },
    };
}

/** A `fetch` that answers from a table of `url substring -> payload`. */
export function fakeRiotFetch(
    routes: { match: string; status?: number; body: unknown }[],
): RiotFetch {
    return async (url) => {
        const route = routes.find((candidate) => url.includes(candidate.match));
        const status = route?.status ?? (route ? 200 : 404);
        const body = route ? JSON.stringify(route.body) : JSON.stringify({});
        return {
            status,
            headers: { get: () => null },
            text: async () => body,
        };
    };
}

/** A valid-looking development key. Not a real one — it matches nothing. */
export const FAKE_API_KEY = "RGAPI-00000000-1111-2222-3333-444444444444";
