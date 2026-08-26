import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Role } from "@draftpredict/core";
import { ApiError } from "../errors.js";
import { analyzeConfigOf } from "../context.js";
import { resolveAnalyzeConfig } from "../services/draft-schema.js";
import { analyzeConfigQuerySchema, datasetQuerySchema, roleQuerySchema } from "./query.js";

/**
 * `GET /api/builds/:championKey?role=&vs=`
 *
 * `role` accepts a number or a name (`2`, `mid`, `MIDDLE`). `vs` is a
 * comma-separated list of enemy champions, each optionally carrying its role
 * (`157:2,64`): those are the matchups the build is rated against, which is
 * what makes the answer draft-aware rather than a generic tier list.
 */
export async function buildsRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    const query = datasetQuerySchema
        .merge(analyzeConfigQuerySchema)
        .extend({
            role: roleQuerySchema.optional(),
            vs: z.string().optional(),
        });

    app.get<{ Params: { championKey: string } }>(
        "/api/builds/:championKey",
        async (request) => {
            const { role, vs, riskLevel, minGames, ignoreChampionWinrates, ...params } =
                query.parse(request.query);

            const championKey = request.params.championKey.trim();
            const pair = await ctx.dataset.getPair(params);

            const resolvedKey = resolveChampionKey(app, championKey);
            if (pair.dataset.championData[resolvedKey] === undefined) {
                throw ApiError.notFound(
                    `No dataset entry for champion ${championKey}`,
                    "UNKNOWN_CHAMPION",
                );
            }

            const resolvedRole = role ?? ctx.builds.bestRole(pair.dataset, resolvedKey);
            const matchups = parseMatchups(vs, resolvedRole).map((matchup) => {
                if (pair.dataset.championData[matchup.championKey] === undefined) {
                    throw new ApiError(
                        400,
                        "UNKNOWN_CHAMPION",
                        `Unknown champion key in "vs": ${matchup.championKey}`,
                    );
                }
                return matchup;
            });

            const config = resolveAnalyzeConfig(analyzeConfigOf(ctx.config), {
                ...(riskLevel === undefined ? {} : { riskLevel }),
                ...(minGames === undefined ? {} : { minGames }),
                ...(ignoreChampionWinrates === undefined
                    ? {}
                    : { ignoreChampionWinrates }),
            });

            return {
                dataset: pair.meta,
                ...ctx.builds.analyze({
                    championKey: resolvedKey,
                    role: resolvedRole,
                    matchups,
                    config,
                }),
            };
        },
    );
}

/** Accepts a dataset key (`266`) or a Data Dragon id (`Aatrox`). */
function resolveChampionKey(app: FastifyInstance, value: string): string {
    if (/^[0-9]+$/.test(value)) return value;
    const champion = app.ctx.staticData.champion(value);
    if (!champion) {
        throw ApiError.notFound(`Unknown champion: ${value}`, "UNKNOWN_CHAMPION");
    }
    return champion.key;
}

/** `"157:2,64"` -> `[{championKey:"157", role:2}, {championKey:"64", role}]`. */
export function parseMatchups(
    value: string | undefined,
    defaultRole: Role,
): { championKey: string; role: Role }[] {
    if (!value) return [];
    return value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => {
            const [key, role] = part.split(":");
            if (!key || !/^[0-9]+$/.test(key)) {
                throw ApiError.badRequest(
                    `"vs" entries must be numeric champion keys, got "${part}"`,
                );
            }
            const parsedRole =
                role === undefined ? defaultRole : Number.parseInt(role, 10);
            if (!Number.isInteger(parsedRole) || parsedRole < 0 || parsedRole > 4) {
                throw ApiError.badRequest(`Invalid role in "vs": ${part}`);
            }
            return { championKey: key, role: parsedRole as Role };
        });
}
