import type { FastifyInstance } from "fastify";
import type { DatasetMeta } from "../services/dataset.js";

/**
 * `GET /api/health` answers the four questions the UI asks on boot: which
 * dataset is being served (and whether it is the offline demo), which patch
 * the static data describes, whether the League Client is connected, and
 * whether a Riot API key is configured.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
    app.get("/api/health", async () => {
        const ctx = app.ctx;
        const config = ctx.config.get();

        let dataset: DatasetMeta | null = ctx.dataset.lastMeta();
        let datasetError: string | null = null;
        if (!dataset) {
            try {
                dataset = await ctx.dataset.getMeta({
                    rank: config.rank,
                    region: config.region,
                });
            } catch (error) {
                datasetError =
                    error instanceof Error ? error.message : "Dataset unavailable";
            }
        }

        return {
            status: datasetError ? "degraded" : "ok",
            version: ctx.version,
            uptimeMs: Date.now() - ctx.startedAt,
            staticData: {
                version: ctx.staticData.data.version,
                language: ctx.staticData.data.language,
                source: ctx.staticData.data.source,
                champions: ctx.staticData.data.championList.length,
            },
            dataset:
                dataset === null
                    ? { available: false, error: datasetError }
                    : { available: true, ...dataset, providers: ctx.dataset.providers() },
            lcu: ctx.lcu.status(),
            riot: {
                configured: ctx.config.hasRiotApiKey(),
                platform: config.platform,
            },
            web: { served: ctx.webRoot !== null, root: ctx.webRoot },
            websocket: { clients: ctx.ws.size, heartbeatMs: ctx.ws.heartbeatMs },
        };
    });
}
