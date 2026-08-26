import Fastify from "fastify";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import type { StaticData } from "@draftpredict/data";
import { DatasetService, createDatasetService, loadStaticData } from "@draftpredict/data";
import { LcuWatcher } from "@draftpredict/lcu";
import { redactApiKey } from "@draftpredict/riot";
import { ConfigService } from "./config/service.js";
import type { ServerContext } from "./context.js";
import { registerErrorHandler } from "./errors.js";
import { LcuService } from "./lcu/service.js";
import { accountRoutes } from "./routes/account.js";
import { buildsRoutes } from "./routes/builds.js";
import { configRoutes } from "./routes/config.js";
import { datasetRoutes } from "./routes/dataset.js";
import { draftRoutes } from "./routes/draft.js";
import { healthRoutes } from "./routes/health.js";
import { lcuRoutes } from "./routes/lcu.js";
import { staticRoutes } from "./routes/static.js";
import { BuildsService } from "./services/builds.js";
import { DatasetContext } from "./services/dataset.js";
import { DraftAnalysisService } from "./services/draft.js";
import type { RiotClientFactory } from "./services/riot.js";
import { RiotService } from "./services/riot.js";
import { StaticDataService } from "./services/static-data.js";
import { findWebRoot } from "./web-root.js";
import { WsHub } from "./ws/hub.js";
import { websocketRoutes } from "./ws/routes.js";

export const SERVER_VERSION = "0.1.0";

/**
 * Origins the Vite dev server runs on. In production the UI is served from
 * this same process, so it is same-origin and needs no entry here.
 */
export const DEV_ORIGIN_PATTERN =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):(5173|5174|4173|4700)$/;

export type CreateAppOptions = {
    /** Pre-built settings service. Defaults to the real one (`~/.draftpredict`). */
    config?: ConfigService;
    /** Static data, already loaded. Defaults to `loadStaticData()`. */
    staticData?: StaticData | StaticDataService;
    /** Dataset service. Defaults to the standard provider chain. */
    datasetService?: DatasetService;
    /** Overrides how Riot clients are built (tests inject a fake fetch here). */
    riotClientFactory?: RiotClientFactory;
    riot?: RiotService;
    /**
     * League Client watcher. `null` disables the integration; omitted means
     * "build the real one when the configuration allows it".
     */
    lcuWatcher?: LcuWatcher | null;
    lcu?: LcuService;
    /** Start the watcher during `createApp`. Default `true`. */
    startLcu?: boolean;
    lcuDebounceMs?: number;
    /** Directory of the built web app; `null` disables static serving. */
    webRoot?: string | null;
    logger?: FastifyServerOptions["logger"];
    /** WebSocket heartbeat interval. `0` disables it (tests do). */
    heartbeatMs?: number;
    version?: string;
};

/**
 * Builds the server.
 *
 * Everything it needs is injectable, which is the whole point: the test suite
 * passes a fixture-only dataset service, a fake Riot client factory and no LCU
 * watcher, so `fastify.inject` exercises the real routing, validation and
 * serialization without touching the network or the League Client.
 */
export async function createApp(
    options: CreateAppOptions = {},
): Promise<FastifyInstance> {
    const config = options.config ?? new ConfigService();
    const settings = config.get();

    const staticData =
        options.staticData instanceof StaticDataService
            ? options.staticData
            : new StaticDataService(options.staticData ?? loadStaticData());

    const datasetService =
        options.datasetService ??
        createDatasetService({
            remote: settings.allowRemoteDataset,
            ...(settings.datasetLocalRoot
                ? { localRoot: settings.datasetLocalRoot }
                : {}),
            fixtureOptions: { staticData: staticData.data },
        });

    const dataset = new DatasetContext({
        service: datasetService,
        defaults: () => {
            const current = config.get();
            return { rank: current.rank, region: current.region };
        },
    });

    const draft = new DraftAnalysisService(staticData);
    const builds = new BuildsService(staticData);
    const riot =
        options.riot ??
        new RiotService({
            config,
            ...(options.riotClientFactory
                ? { factory: options.riotClientFactory }
                : {}),
        });

    const app = Fastify({
        logger: options.logger ?? defaultLoggerOptions(),
        bodyLimit: 4 * 1024 * 1024,
        trustProxy: false,
    });

    const ws = new WsHub({
        ...(options.heartbeatMs === undefined
            ? {}
            : { heartbeatMs: options.heartbeatMs }),
        onError: (error, clientId) =>
            app.log.warn({ err: error, clientId }, "websocket send failed"),
    });

    const watcher =
        options.lcuWatcher === undefined
            ? settings.lcuEnabled
                ? new LcuWatcher({
                      mapContext: { staticData: staticData.data },
                  })
                : null
            : options.lcuWatcher;

    const lcu =
        options.lcu ??
        new LcuService({
            watcher,
            config,
            dataset,
            draft,
            ...(options.lcuDebounceMs === undefined
                ? {}
                : { debounceMs: options.lcuDebounceMs }),
        });

    const context: ServerContext = {
        config,
        staticData,
        dataset,
        draft,
        builds,
        riot,
        lcu,
        ws,
        startedAt: Date.now(),
        version: options.version ?? SERVER_VERSION,
        webRoot: findWebRoot(options.webRoot),
    };

    app.decorate("ctx", context);

    // ------------------------------------------------------------ plugins ---

    await app.register(cors, {
        origin: (origin, callback) => {
            // Same-origin requests and non-browser clients send no Origin.
            if (!origin) return callback(null, true);
            callback(null, DEV_ORIGIN_PATTERN.test(origin));
        },
        credentials: true,
    });

    await app.register(websocket, {
        options: { maxPayload: 1024 * 1024 },
    });

    if (context.webRoot) {
        await app.register(fastifyStatic, {
            root: context.webRoot,
            prefix: "/",
            wildcard: false,
            index: ["index.html"],
        });
    }

    // ------------------------------------------------------ cross-cutting ---
    // Fastify's own request/response logging goes through the redacting
    // serializers below, so a key pasted into a query string never lands in a
    // log file.

    registerErrorHandler(app);
    registerNotFoundHandler(app);

    // ------------------------------------------------------------- routes ---

    await app.register(healthRoutes);
    await app.register(configRoutes);
    await app.register(staticRoutes);
    await app.register(datasetRoutes);
    await app.register(draftRoutes);
    await app.register(buildsRoutes);
    await app.register(accountRoutes);
    await app.register(lcuRoutes);
    await app.register(websocketRoutes);

    // ------------------------------------------------------------- wiring ---

    lcu.on("status", (status) => {
        ws.broadcast({ type: "lcu:status", status });
    });
    lcu.on("update", (update) => {
        ws.broadcast({
            type: "champselect:update",
            state: update.state,
            analysis: update.analysis,
            suggestions: update.suggestions,
        });
    });
    lcu.on("end", () => {
        ws.forget("champselect:update");
        ws.broadcast({ type: "champselect:end" });
    });
    lcu.on("error", (error) => {
        app.log.warn({ err: error }, "league client integration error");
    });

    config.onChange((publicConfig) => {
        ws.broadcast({ type: "config:update", config: publicConfig });
    });

    datasetService.on("updated", (entry) => {
        app.log.info(
            { provider: entry.provider, key: entry.key },
            "dataset updated",
        );
    });
    datasetService.on("error", (event) => {
        app.log.warn(
            { provider: event.provider, key: event.key },
            "dataset provider failed, falling back",
        );
    });

    if (options.startLcu !== false) lcu.start();

    // ----------------------------------------------------------- shutdown ---

    app.addHook("onClose", async () => {
        lcu.stop();
        ws.close();
    });

    return app;
}

function registerNotFoundHandler(app: FastifyInstance): void {
    app.setNotFoundHandler((request, reply) => {
        const url = request.url;
        const isApi = url.startsWith("/api") || url.startsWith("/ws");

        if (!isApi && app.ctx.webRoot && request.method === "GET") {
            // Single-page app: unknown non-API GETs are client-side routes.
            return reply.sendFile("index.html", app.ctx.webRoot);
        }

        return reply.status(404).send({
            error: {
                code: "NOT_FOUND",
                message: `No route for ${request.method} ${redactApiKey(url)}`,
            },
        });
    });
}

function defaultLoggerOptions(): FastifyServerOptions["logger"] {
    return {
        level: process.env.LOG_LEVEL ?? "info",
        redact: {
            paths: [
                "req.headers.authorization",
                'req.headers["x-riot-token"]',
                "req.headers.cookie",
                "apiKey",
                "riotApiKey",
                "*.apiKey",
                "*.riotApiKey",
                "config.riotApiKey",
            ],
            censor: "[REDACTED]",
        },
        serializers: {
            req(request: { method: string; url: string }) {
                return { method: request.method, url: redactApiKey(request.url) };
            },
            err(error: Error) {
                return {
                    type: error.name,
                    message: redactApiKey(error.message),
                    stack: redactApiKey(error.stack ?? ""),
                };
            },
        },
    };
}
