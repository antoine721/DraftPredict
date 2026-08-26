import type { AnalyzeDraftConfig } from "@draftpredict/core";
import type { ConfigService } from "./config/service.js";
import type { LcuService } from "./lcu/service.js";
import type { BuildsService } from "./services/builds.js";
import type { DatasetContext } from "./services/dataset.js";
import type { DraftAnalysisService } from "./services/draft.js";
import type { RiotService } from "./services/riot.js";
import type { StaticDataService } from "./services/static-data.js";
import type { WsHub } from "./ws/hub.js";

/**
 * Everything the routes are allowed to touch, assembled once in `createApp`
 * and decorated onto the Fastify instance as `app.ctx`. Routes never construct
 * a service themselves, which is what makes them testable with fakes.
 */
export type ServerContext = {
    config: ConfigService;
    staticData: StaticDataService;
    dataset: DatasetContext;
    draft: DraftAnalysisService;
    builds: BuildsService;
    riot: RiotService;
    lcu: LcuService;
    ws: WsHub;
    startedAt: number;
    version: string;
    /** Directory of the built web app, when it is being served. */
    webRoot: string | null;
};

/** The engine config implied by the current settings. */
export function analyzeConfigOf(config: ConfigService): AnalyzeDraftConfig {
    const current = config.get();
    return {
        riskLevel: current.riskLevel,
        minGames: current.minGames,
        ignoreChampionWinrates: current.ignoreChampionWinrates,
    };
}

declare module "fastify" {
    interface FastifyInstance {
        ctx: ServerContext;
    }
}
