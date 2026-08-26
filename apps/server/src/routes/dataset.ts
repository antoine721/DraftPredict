import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { datasetQuerySchema } from "./query.js";

/**
 * Dataset access.
 *
 * The payload is large (tens of MB for a real DraftGap dataset), so `include`
 * defaults to metadata only; the UI asks for the full body just once, when it
 * wants to analyse locally. Whatever the shape, `meta.provider` and
 * `meta.offline` always say where the numbers came from.
 */
export async function datasetRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    const query = datasetQuerySchema.extend({
        include: z.enum(["meta", "full"]).optional(),
    });

    app.get("/api/dataset", async (request) => {
        const { include, ...params } = query.parse(request.query);

        if (include !== "full") {
            const meta = await ctx.dataset.getMeta(params);
            return { meta, providers: ctx.dataset.providers() };
        }

        const entry = await ctx.dataset.getEntry(params);
        return {
            meta: await ctx.dataset.getMeta(params),
            providers: ctx.dataset.providers(),
            dataset: entry.dataset,
        };
    });

    app.get("/api/dataset/providers", async () => ({
        providers: ctx.dataset.providers(),
        last: ctx.dataset.lastMeta(),
    }));

    app.post("/api/dataset/refresh", async (request) => {
        const params = datasetQuerySchema.parse(request.body ?? {});
        const meta = await ctx.dataset.refresh(params);
        ctx.ws.broadcast({ type: "dataset:update", dataset: meta });
        return { dataset: meta };
    });
}
