import type { FastifyInstance } from "fastify";

/**
 * League Client state over REST, for clients that connect after champion
 * select started (or that do not use the WebSocket at all). The payloads are
 * exactly what `{type:"lcu:status"}` and `{type:"champselect:update"}` carry.
 */
export async function lcuRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    app.get("/api/lcu/status", async () => ctx.lcu.status());

    app.get("/api/lcu/summoner", async (_request, reply) => {
        const summoner = ctx.lcu.getSummoner();
        if (!summoner) {
            return reply.status(404).send({
                error: {
                    code: "LCU_NO_SUMMONER",
                    message:
                        "No League Client is connected, or no summoner is logged in.",
                },
            });
        }
        return summoner;
    });

    app.get("/api/lcu/champ-select", async () => {
        const current = ctx.lcu.getCurrent();
        return {
            inChampSelect: current !== null,
            status: ctx.lcu.status(),
            ...(current ?? { state: null, analysis: null, suggestions: null }),
        };
    });
}
