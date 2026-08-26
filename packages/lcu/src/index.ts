/**
 * @draftpredict/lcu — the League Client (LCU) connector.
 *
 * This is what makes DraftPredict real-time: while the League Client runs it
 * exposes a local REST + WebSocket API on a random loopback port, protected by
 * a token it writes into a lockfile. No Riot API key is involved, and nothing
 * here leaves the machine.
 *
 * Three layers:
 *
 * - {@link discoverCredentials} finds a running client (lockfile, then the
 *   process command line, with environment overrides for testing);
 * - {@link LcuClient} talks to it over HTTPS with `riot:<token>` basic auth;
 * - {@link LcuWatcher} follows it — connect, champ select, disconnect,
 *   reconnect — and {@link mapChampSelectSession} turns a champ-select session
 *   into the draft shape `@draftpredict/core` reasons over.
 *
 * Nothing runs at import time and no write action is performed unless a caller
 * explicitly opts in with `allowActions: true`.
 */

// ------------------------------------------------------------ foundations ---
export * from "./types.js";
export * from "./errors.js";
export * from "./logger.js";

// ---------------------------------------------------------------- LCU API ---
export * from "./api/types.js";

// -------------------------------------------------------------- discovery ---
export * from "./discovery/paths.js";
export * from "./discovery/lockfile.js";
export * from "./discovery/process.js";
export * from "./discovery/env.js";
export * from "./discovery/discover.js";

// ----------------------------------------------------------------- client ---
export * from "./http/agent.js";
export * from "./http/transport.js";
export * from "./client.js";
export * from "./connect.js";

// ----------------------------------------------------------- champ select ---
export * from "./champ-select/state.js";
export * from "./champ-select/roles.js";
export * from "./champ-select/map.js";

// ---------------------------------------------------------------- watcher ---
export * from "./watcher/socket.js";
export * from "./watcher/watcher.js";
