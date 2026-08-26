import type { FastifyInstance } from "fastify";
import type { Role } from "@draftpredict/core";
import { analyzeConfigOf } from "../context.js";
import {
    bansRequestSchema,
    draftRequestSchema,
    resolveAnalyzeConfig,
    suggestionsRequestSchema,
    validateDraft,
} from "../services/draft-schema.js";
import type { DraftRequest } from "../services/draft-schema.js";
import type { ResolvedPair } from "../services/dataset.js";
import type { DraftInput } from "../services/draft.js";

/**
 * The three draft endpoints.
 *
 * All of them take the same body — two teams as `[role, championKey][]`, plus
 * bans and an optional analysis config — and all of them validate that body
 * against the dataset they are about to analyse it with, so an unknown
 * champion key is a 400 rather than a silently ignored slot.
 */
export async function draftRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    async function prepare(
        request: DraftRequest,
    ): Promise<{ pair: ResolvedPair; input: DraftInput }> {
        const pair = await ctx.dataset.getPair({
            ...(request.rank === undefined ? {} : { rank: request.rank }),
            ...(request.region === undefined ? {} : { region: request.region }),
            ...(request.patch === undefined ? {} : { patch: request.patch }),
        });
        const { state } = validateDraft(request, pair.dataset);
        return {
            pair,
            input: { team: state.ally, enemy: state.opponent, bans: state.bans },
        };
    }

    app.post("/api/draft/analyze", async (request) => {
        const body = draftRequestSchema.parse(request.body ?? {});
        const { pair, input } = await prepare(body);
        const config = resolveAnalyzeConfig(analyzeConfigOf(ctx.config), body.config);
        return ctx.draft.analyze(pair, input, config);
    });

    app.post("/api/draft/suggestions", async (request) => {
        const body = suggestionsRequestSchema.parse(request.body ?? {});
        const { pair, input } = await prepare(body);
        const config = resolveAnalyzeConfig(analyzeConfigOf(ctx.config), body.config);
        return ctx.draft.suggestions(pair, input, config, {
            ...(body.limit === undefined ? {} : { limit: body.limit }),
            ...(body.roles === undefined ? {} : { roles: body.roles as Role[] }),
        });
    });

    app.post("/api/draft/bans", async (request) => {
        const body = bansRequestSchema.parse(request.body ?? {});
        const { pair, input } = await prepare(body);
        const config = resolveAnalyzeConfig(analyzeConfigOf(ctx.config), body.config);
        return ctx.draft.bans(pair, input, config, {
            ...(body.limit === undefined ? {} : { limit: body.limit }),
        });
    });
}
