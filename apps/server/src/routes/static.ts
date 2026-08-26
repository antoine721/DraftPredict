import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sendCachedJson } from "../util/etag.js";

/**
 * The static catalogue.
 *
 * `/summary` is the one the champion picker loads on every page view, so it
 * carries the smallest payload that can render a champion tile: key, id, name,
 * title, tags and an icon URL. The heavier routes exist for the champion page.
 */
export async function staticRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    app.get("/api/static/summary", (request, reply) =>
        sendCachedJson(request, reply, ctx.staticData.summary()),
    );

    app.get("/api/static/champions", (request, reply) =>
        sendCachedJson(request, reply, ctx.staticData.champions()),
    );

    app.get("/api/static/items", (request, reply) =>
        sendCachedJson(request, reply, ctx.staticData.items()),
    );

    app.get("/api/static/runes", (request, reply) =>
        sendCachedJson(request, reply, ctx.staticData.runes()),
    );

    app.get("/api/static/summoner-spells", (request, reply) =>
        sendCachedJson(request, reply, ctx.staticData.summonerSpells()),
    );

    const searchQuery = z
        .object({
            q: z.string().default(""),
            limit: z.coerce.number().int().min(1).max(50).optional(),
        })
        .strip();

    app.get("/api/static/search", async (request) => {
        const { q, limit } = searchQuery.parse(request.query);
        return {
            query: q,
            results: ctx.staticData.search(q, limit ?? 10),
        };
    });
}
