/**
 * `@draftpredict/server` — the Fastify backend.
 *
 * `createApp` is exported so the Electron shell (and the test suite) can run
 * the server in-process instead of spawning `main.ts`.
 */
export { createApp, SERVER_VERSION, DEV_ORIGIN_PATTERN } from "./app.js";
export type { CreateAppOptions } from "./app.js";
export type { ServerContext } from "./context.js";
export { ApiError } from "./errors.js";
export type { ApiErrorBody } from "./errors.js";
export { ConfigService } from "./config/service.js";
export { ConfigStore, defaultConfigPath } from "./config/store.js";
export type { PublicConfig, ServerConfig } from "./config/types.js";
export { DatasetContext } from "./services/dataset.js";
export type { DatasetMeta, DatasetPairMeta } from "./services/dataset.js";
export { StaticDataService } from "./services/static-data.js";
export { DraftAnalysisService } from "./services/draft.js";
export type {
    AnalyzePayload,
    BansPayload,
    SuggestionsPayload,
} from "./services/draft.js";
export { BuildsService } from "./services/builds.js";
export type { BuildsPayload } from "./services/builds.js";
export { RiotService } from "./services/riot.js";
export { LcuService } from "./lcu/service.js";
export type { LcuStatus, SerializedChampSelectState } from "./lcu/serialize.js";
export { WsHub } from "./ws/hub.js";
export { WS_TOPICS } from "./ws/protocol.js";
export type { ClientMessage, ServerMessage, WsTopic } from "./ws/protocol.js";
