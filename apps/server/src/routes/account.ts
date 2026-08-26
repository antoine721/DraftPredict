import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { analyzeConfigOf } from "../context.js";
import { booleanQuery } from "./query.js";

/**
 * Riot-account features: lookup, profile, match history, playstyle, live game.
 *
 * Every one of these needs the API key, so every one of them can answer 428
 * `RIOT_KEY_MISSING` — the UI turns that into a "connecter mon compte" call to
 * action rather than an error toast.
 *
 * Playstyle profiling reads 50 matches one by one through a rate limiter; it
 * is cached per puuid, forced with `refresh=1`, and streams progress over the
 * WebSocket so the UI can show a real progress bar instead of a spinner.
 */
export async function accountRoutes(app: FastifyInstance): Promise<void> {
    const ctx = app.ctx;

    /** Riot calls it a platform (`euw1`); the UI calls it a region (`EUW`). */
    const platformQuery = z
        .object({
            platform: z.string().min(2).optional(),
            region: z.string().min(2).optional(),
        })
        .strip()
        .transform((value) => value.platform ?? value.region);

    app.get("/api/account/lookup", async (request) => {
        const query = z
            .object({
                riotId: z.string().min(3),
                platform: z.string().min(2).optional(),
                region: z.string().min(2).optional(),
            })
            .strip()
            .parse(request.query);

        const account = await ctx.riot.lookup(
            query.riotId,
            query.platform ?? query.region,
        );
        return {
            puuid: account.puuid,
            gameName: account.gameName,
            tagLine: account.tagLine,
            platform: account.platform,
        };
    });

    app.get<{ Params: { puuid: string } }>(
        "/api/account/:puuid/profile",
        async (request) => {
            const platform = platformQuery.parse(request.query);
            const profile = await ctx.riot.profile(request.params.puuid, platform);
            return {
                platform: profile.platform,
                account: profile.account,
                summoner: profile.summoner,
                ranks: profile.ranks,
                mastery: profile.mastery.map((entry) => ({
                    ...entry,
                    champion: ctx.staticData.championRef(String(entry.championId)),
                })),
            };
        },
    );

    app.get<{ Params: { puuid: string } }>(
        "/api/account/:puuid/matches",
        async (request) => {
            const query = z
                .object({
                    platform: z.string().min(2).optional(),
                    region: z.string().min(2).optional(),
                    count: z.coerce.number().int().min(1).max(100).optional(),
                    refresh: booleanQuery.optional(),
                })
                .strip()
                .parse(request.query);

            const puuid = request.params.puuid;
            const history = await ctx.riot.matches(puuid, {
                ...(query.count === undefined ? {} : { count: query.count }),
                ...(query.platform ?? query.region
                    ? { platform: (query.platform ?? query.region) as string }
                    : {}),
                refresh: query.refresh ?? false,
                onProgress: (progress) =>
                    ctx.ws.broadcast({
                        type: "job:progress",
                        job: "matches",
                        key: puuid,
                        ...progress,
                    }),
            });

            return history;
        },
    );

    app.get<{ Params: { puuid: string } }>(
        "/api/account/:puuid/playstyle",
        async (request) => {
            const query = z
                .object({
                    platform: z.string().min(2).optional(),
                    region: z.string().min(2).optional(),
                    count: z.coerce.number().int().min(1).max(100).optional(),
                    refresh: booleanQuery.optional(),
                })
                .strip()
                .parse(request.query);

            const puuid = request.params.puuid;
            return ctx.riot.playstyle(puuid, {
                ...(query.count === undefined ? {} : { count: query.count }),
                ...(query.platform ?? query.region
                    ? { platform: (query.platform ?? query.region) as string }
                    : {}),
                refresh: query.refresh ?? false,
                onProgress: (progress) =>
                    ctx.ws.broadcast({
                        type: "job:progress",
                        job: "playstyle",
                        key: puuid,
                        ...progress,
                    }),
            });
        },
    );

    app.get<{ Params: { puuid: string } }>(
        "/api/account/:puuid/live",
        async (request) => {
            const platform = platformQuery.parse(request.query);
            const config = ctx.config.get();
            const pair = await ctx.dataset.getPair({
                rank: config.rank,
                region: config.region,
            });

            const live = await ctx.riot.live(request.params.puuid, {
                ...(platform === undefined ? {} : { platform }),
                dataset: pair.fullDataset,
            });

            if (!live.inGame || !live.draft) {
                return { ...live, analysis: null, dataset: pair.meta };
            }

            const team = new Map(live.draft.ally);
            const enemy = new Map(live.draft.opponent);

            return {
                ...live,
                dataset: pair.meta,
                analysis: ctx.draft.analyze(
                    pair,
                    { team, enemy, bans: live.draft.bans },
                    analyzeConfigOf(ctx.config),
                ),
            };
        },
    );
}
