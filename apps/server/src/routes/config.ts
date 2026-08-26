import type { FastifyInstance } from "fastify";
import { configUpdateSchema } from "../config/schema.js";

/**
 * Settings.
 *
 * `GET` never returns the Riot API key — only `hasRiotApiKey` and a
 * `RGAPI-****1234` preview, which is enough for a user to recognise the key
 * they pasted and useless to anyone else.
 *
 * `POST` checks the key's shape, then makes one best-effort live call. That
 * call is *allowed* to fail: plenty of machines cannot reach
 * `api.riotgames.com`, and refusing to save a valid key because of a proxy
 * would be worse than saving one that later turns out to be expired. Only an
 * explicit 401/403 from Riot rejects the write.
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    app.get("/api/config", async () => ({
        config: ctx.config.getPublic(),
        dataset: {
            providers: ctx.dataset.providers(),
            last: ctx.dataset.lastMeta(),
        },
        staticData: {
            version: ctx.staticData.data.version,
            source: ctx.staticData.data.source,
            language: ctx.staticData.data.language,
        },
    }));

    app.post("/api/config", async (request) => {
        const patch = configUpdateSchema.parse(request.body ?? {});
        // The broadcast is wired to ConfigService.onChange in createApp, so it
        // fires for every writer (REST, desktop shell, a future CLI) — not
        // just this route.
        const { config, probe } = await ctx.config.update(patch);
        return { config, probe };
    });
}
