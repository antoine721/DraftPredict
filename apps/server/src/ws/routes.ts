import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { analyzeConfigOf } from "../context.js";
import { normalizeError } from "../errors.js";
import {
    resolveAnalyzeConfig,
    validateDraft,
} from "../services/draft-schema.js";
import type { WsClient } from "./hub.js";
import type { ClientMessage, WsTopic } from "./protocol.js";
import { clientMessageSchema, isWsTopic } from "./protocol.js";

/**
 * `GET /ws`.
 *
 * On connect a client receives `hello` plus the last known LCU status, champ
 * select, config and dataset messages, so a page reload during champion select
 * repaints instantly. Then it is a two-way channel: the server pushes live
 * updates, and `draft:set` lets the UI analyse a hand-edited draft without a
 * round-trip through REST.
 */
export async function websocketRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    app.get("/ws", { websocket: true }, (socket: WebSocket) => {
        const client = ctx.ws.add(socket, ctx.staticData.data.version);

        socket.on("message", (raw: unknown) => {
            void handleMessage(app, client, String(raw));
        });
    });
}

async function handleMessage(
    app: FastifyInstance,
    client: WsClient,
    raw: string,
): Promise<void> {
    const ctx = app.ctx;

    let message: ClientMessage;
    try {
        message = clientMessageSchema.parse(JSON.parse(raw));
    } catch (error) {
        const normalized = normalizeError(error);
        ctx.ws.send(client, {
            type: "error",
            requestId: null,
            error: normalized.body.error,
        });
        return;
    }

    switch (message.type) {
        case "ping":
            ctx.ws.send(client, { type: "pong", time: Date.now() });
            return;

        case "subscribe":
            ctx.ws.subscribe(client, parseTopics(message.topics));
            return;

        case "unsubscribe":
            ctx.ws.unsubscribe(client, parseTopics(message.topics));
            return;

        case "draft:set": {
            const requestId = message.requestId ?? null;
            try {
                const pair = await ctx.dataset.getPair();
                const { state } = validateDraft(
                    {
                        team: message.team,
                        enemy: message.enemy,
                        bans: message.bans,
                        config: message.config,
                    },
                    pair.dataset,
                );
                const input = {
                    team: state.ally,
                    enemy: state.opponent,
                    bans: state.bans,
                };
                const config = resolveAnalyzeConfig(
                    analyzeConfigOf(ctx.config),
                    message.config,
                );

                ctx.ws.send(client, {
                    type: "draft:analysis",
                    requestId,
                    analysis: ctx.draft.analyze(pair, input, config),
                    suggestions:
                        message.suggestions === false
                            ? null
                            : ctx.draft.suggestions(pair, input, config, {
                                  limit: message.limit ?? 8,
                              }),
                });
            } catch (error) {
                const normalized = normalizeError(error);
                if (normalized.fault) {
                    app.log.error({ err: error }, "draft:set failed");
                }
                ctx.ws.send(client, {
                    type: "error",
                    requestId,
                    error: normalized.body.error,
                });
            }
            return;
        }

        default:
            return;
    }
}

/** Unknown topic names are ignored; omitting them means "all of them". */
function parseTopics(topics: string[] | undefined): WsTopic[] {
    if (!topics) return [...(["lcu", "champselect", "draft", "config", "dataset", "jobs"] as WsTopic[])];
    return topics.filter(isWsTopic);
}
