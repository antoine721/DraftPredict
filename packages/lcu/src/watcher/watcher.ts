import { EventEmitter } from "node:events";
import type {
    GameflowPhase,
    LcuChampSelectSession,
    LcuSummoner,
} from "../api/types.js";
import { LcuClient, type LcuClientOptions } from "../client.js";
import {
    mapChampSelectSession,
    type ChampSelectMapContext,
} from "../champ-select/map.js";
import type { ChampSelectState } from "../champ-select/state.js";
import {
    discoverCredentials,
    type DiscoverCredentialsOptions,
} from "../discovery/discover.js";
import { describeError } from "../errors.js";
import { silentLogger, type Logger } from "../logger.js";
import type { LcuCredentials } from "../types.js";
import {
    SUBSCRIBE_FRAME,
    createLcuSocket,
    parseLcuEvent,
    type LcuSocket,
    type LcuSocketFactory,
} from "./socket.js";

/** REST paths the watcher reacts to. */
export const WATCHED_URIS = {
    gameflowPhase: "/lol-gameflow/v1/gameflow-phase",
    champSelectSession: "/lol-champ-select/v1/session",
    currentSummoner: "/lol-summoner/v1/current-summoner",
} as const;

/** The gameflow phase that means "champion select is running". */
export const CHAMP_SELECT_PHASE = "ChampSelect";

/** Events emitted by {@link LcuWatcher}, with their payloads. */
export type LcuWatcherEvents = {
    /** The client answered; payload is the logged-in summoner when available. */
    connected: [summoner: LcuSummoner | null];
    /** The client went away (or `stop()` was called). */
    disconnected: [reason: string];
    /** Gameflow phase changed. */
    "gameflow-phase": [phase: GameflowPhase];
    /** A new or updated champ-select session. */
    "champ-select": [session: LcuChampSelectSession];
    /** Champion select ended (locked in, dodged, or the phase moved on). */
    "champ-select-end": [];
    /**
     * The mapped session, emitted alongside `champ-select` when the watcher was
     * given a {@link LcuWatcherOptions.mapContext}.
     */
    "champ-select-state": [state: ChampSelectState];
    /** The logged-in summoner changed. */
    "current-summoner": [summoner: LcuSummoner];
    /** Something failed. Never fatal: the watcher keeps trying. */
    error: [error: Error];
};

/** The slice of {@link LcuClient} the watcher needs; makes faking trivial. */
export type LcuWatcherClient = {
    credentials: LcuCredentials;
    getCurrentSummoner(): Promise<LcuSummoner | null>;
    getGameflowPhase(): Promise<GameflowPhase>;
    getChampSelectSession(): Promise<LcuChampSelectSession | null>;
    close(): void;
};

export type LcuWatcherOptions = {
    /** Replaces credential discovery entirely. */
    discover?: () => Promise<LcuCredentials | null>;
    /** Options forwarded to {@link discoverCredentials}. */
    discoverOptions?: DiscoverCredentialsOptions;
    /** Builds the client for a set of credentials. */
    createClient?: (credentials: LcuCredentials) => LcuWatcherClient;
    /** Extra options for the default client factory. */
    clientOptions?: Omit<LcuClientOptions, "credentials">;
    /**
     * Builds the event socket. Pass `null` to skip the WebSocket entirely and
     * poll instead — useful in restricted environments.
     */
    createSocket?: LcuSocketFactory | null;
    /** How often to look for the client while disconnected. Default 2000ms. */
    pollIntervalMs?: number;
    /** Champ-select poll interval when the socket is unavailable. Default 1000ms. */
    sessionPollIntervalMs?: number;
    /** First reconnect delay. Default 1000ms. */
    reconnectBaseDelayMs?: number;
    /** Reconnect delay ceiling. Default 30 000ms. */
    reconnectMaxDelayMs?: number;
    /** Failed socket opens before falling back to polling. Default 3. */
    maxSocketAttempts?: number;
    /** When set, `champ-select-state` is emitted with the mapped session. */
    mapContext?: ChampSelectMapContext;
    logger?: Logger;
};

// Declaration merging is the only way to give `EventEmitter` typed events
// without breaking its base signatures.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface LcuWatcher {
    on<K extends keyof LcuWatcherEvents>(
        event: K,
        listener: (...args: LcuWatcherEvents[K]) => void,
    ): this;
    once<K extends keyof LcuWatcherEvents>(
        event: K,
        listener: (...args: LcuWatcherEvents[K]) => void,
    ): this;
    off<K extends keyof LcuWatcherEvents>(
        event: K,
        listener: (...args: LcuWatcherEvents[K]) => void,
    ): this;
    emit<K extends keyof LcuWatcherEvents>(
        event: K,
        ...args: LcuWatcherEvents[K]
    ): boolean;
}

/**
 * Follows a running League Client and reports what is happening in it.
 *
 * Lifecycle:
 *
 * 1. **looking** — {@link discoverCredentials} every `pollIntervalMs` until a
 *    client answers. A client that is not running is not an error.
 * 2. **connected** — `connected` is emitted with the summoner, then the
 *    WebSocket is opened and subscribed to `OnJsonApiEvent`.
 * 3. **degraded** — if the socket cannot be opened `maxSocketAttempts` times,
 *    the watcher falls back to polling the champ-select session every
 *    `sessionPollIntervalMs`, which is slower but works everywhere.
 * 4. **reconnecting** — when the client exits, `disconnected` is emitted and
 *    discovery restarts with exponential backoff. Credentials change on every
 *    client launch, so reconnection always re-discovers rather than reusing
 *    the old port and token.
 *
 * `stop()` clears every timer and closes every socket; the instance can be
 * started again afterwards.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LcuWatcher extends EventEmitter {
    private readonly options: LcuWatcherOptions;
    private readonly logger: Logger;
    private readonly pollIntervalMs: number;
    private readonly sessionPollIntervalMs: number;
    private readonly reconnectBaseDelayMs: number;
    private readonly reconnectMaxDelayMs: number;
    private readonly maxSocketAttempts: number;

    private running = false;
    private connected = false;
    private client: LcuWatcherClient | null = null;
    private socket: LcuSocket | null = null;
    private socketOpen = false;
    private socketPending = false;
    private socketAttempts = 0;
    private reconnectAttempts = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pollTimer: ReturnType<typeof setTimeout> | null = null;
    private polling = false;
    private phase: GameflowPhase | null = null;
    private session: LcuChampSelectSession | null = null;
    private sessionSignature: string | null = null;

    constructor(options: LcuWatcherOptions = {}) {
        super();
        this.options = options;
        this.logger = options.logger ?? silentLogger;
        this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
        this.sessionPollIntervalMs = options.sessionPollIntervalMs ?? 1_000;
        this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000;
        this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
        this.maxSocketAttempts = options.maxSocketAttempts ?? 3;
    }

    // -------------------------------------------------------------- state ---

    /** True between a `connected` and the matching `disconnected`. */
    isConnected(): boolean {
        return this.connected;
    }

    /** True while the watcher is looking for or following a client. */
    isRunning(): boolean {
        return this.running;
    }

    /** True when events are coming from polling instead of the WebSocket. */
    isPolling(): boolean {
        return this.polling;
    }

    /** The live client, or `null` while disconnected. */
    getClient(): LcuWatcherClient | null {
        return this.client;
    }

    getCredentials(): LcuCredentials | null {
        return this.client?.credentials ?? null;
    }

    /** Last known gameflow phase. */
    getPhase(): GameflowPhase | null {
        return this.phase;
    }

    /** Last champ-select session, or `null` outside champion select. */
    getSession(): LcuChampSelectSession | null {
        return this.session;
    }

    /** Last session, mapped. `null` outside champion select. */
    getState(context?: ChampSelectMapContext): ChampSelectState | null {
        if (!this.session) return null;
        return mapChampSelectSession(
            this.session,
            context ?? this.options.mapContext ?? {},
        );
    }

    // ---------------------------------------------------------- lifecycle ---

    /** Starts looking for a client. Idempotent. */
    start(): void {
        if (this.running) return;
        this.running = true;
        this.reconnectAttempts = 0;
        this.socketAttempts = 0;
        void this.attempt();
    }

    /** Stops everything and releases timers and sockets. Idempotent. */
    stop(): void {
        if (!this.running && !this.connected) {
            this.clearTimers();
            return;
        }
        this.running = false;
        this.clearTimers();
        this.closeSocket();
        this.client?.close();
        this.client = null;
        this.polling = false;
        this.session = null;
        this.sessionSignature = null;
        this.phase = null;
        if (this.connected) {
            this.connected = false;
            this.emit("disconnected", "stopped");
        }
    }

    // ----------------------------------------------------------- internals ---

    private async attempt(): Promise<void> {
        if (!this.running) return;

        let credentials: LcuCredentials | null = null;
        try {
            credentials = await this.discover();
        } catch (error) {
            this.emitError(error, "discovery failed");
        }

        if (!this.running) return;

        if (!credentials) {
            // Not running is the normal case: keep looking at a steady pace.
            this.schedule(() => void this.attempt(), this.pollIntervalMs);
            return;
        }

        try {
            await this.connect(credentials);
        } catch (error) {
            this.logger.debug(`LCU connect failed: ${describeError(error)}`);
            this.teardownClient();
            this.scheduleReconnect();
        }
    }

    private async connect(credentials: LcuCredentials): Promise<void> {
        const client = this.createClient(credentials);
        // The first call doubles as a health check: it either proves the
        // credentials work or throws us back into discovery.
        const summoner = await client.getCurrentSummoner();
        if (!this.running) {
            client.close();
            return;
        }

        this.client = client;
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit("connected", summoner);
        if (summoner) this.emit("current-summoner", summoner);

        await this.syncOnce();
        if (!this.running || !this.connected) return;

        const factory = this.socketFactory();
        if (factory && this.socketAttempts < this.maxSocketAttempts) {
            this.openSocket(credentials, factory);
        } else {
            this.startPolling();
        }
    }

    /** Pulls the current phase and session once, right after connecting. */
    private async syncOnce(): Promise<void> {
        const client = this.client;
        if (!client) return;
        try {
            this.handlePhase(await client.getGameflowPhase());
            const session = await client.getChampSelectSession();
            if (session) this.handleSession(session);
        } catch (error) {
            this.logger.debug(`LCU initial sync failed: ${describeError(error)}`);
            this.handleDisconnect(describeError(error));
        }
    }

    private openSocket(credentials: LcuCredentials, factory: LcuSocketFactory): void {
        this.socketOpen = false;
        this.socketPending = true;
        try {
            this.socket = factory(credentials, {
                onOpen: () => {
                    this.socketOpen = true;
                    this.socketAttempts = 0;
                    this.polling = false;
                    this.logger.debug("LCU websocket open, subscribing");
                    try {
                        this.socket?.send(SUBSCRIBE_FRAME);
                    } catch (error) {
                        this.emitError(error, "subscribe failed");
                    }
                },
                onMessage: (data) => this.handleMessage(data),
                onClose: ({ code, reason }) =>
                    this.handleSocketClosed(
                        reason.length > 0
                            ? `websocket closed (${code}: ${reason})`
                            : `websocket closed (${code})`,
                    ),
                onError: (error) => {
                    this.emitError(error, "websocket error");
                    // `ws` emits `close` after `error`; if it does not, the
                    // guard in handleSocketClosed keeps this idempotent.
                    this.handleSocketClosed(describeError(error));
                },
            });
        } catch (error) {
            this.emitError(error, "websocket could not be created");
            this.handleSocketClosed(describeError(error));
        }
    }

    private handleSocketClosed(reason: string): void {
        // A socket reports `error` and then `close`; only the first one counts.
        if (!this.socketPending) return;
        const everOpened = this.socketOpen;
        this.closeSocket();

        if (!this.running) return;

        if (!everOpened) {
            this.socketAttempts += 1;
            if (this.socketAttempts >= this.maxSocketAttempts) {
                // The socket is not going to work here (a proxy, a locked-down
                // client, an old patch). Polling still gives us champ select.
                this.logger.warn(
                    `LCU websocket unavailable after ${this.socketAttempts} attempts, ` +
                        `falling back to polling every ${this.sessionPollIntervalMs}ms`,
                );
                this.startPolling();
                return;
            }
        }

        this.handleDisconnect(reason);
    }

    private handleMessage(raw: string): void {
        const event = parseLcuEvent(raw);
        if (!event) return;

        if (event.uri === WATCHED_URIS.gameflowPhase) {
            if (typeof event.data === "string") this.handlePhase(event.data);
            return;
        }

        if (event.uri === WATCHED_URIS.champSelectSession) {
            if (event.eventType === "Delete" || !event.data) {
                this.handleChampSelectEnd();
                return;
            }
            this.handleSession(event.data as LcuChampSelectSession);
            return;
        }

        if (event.uri === WATCHED_URIS.currentSummoner) {
            if (event.data && typeof event.data === "object") {
                this.emit("current-summoner", event.data as LcuSummoner);
            }
        }
    }

    private handlePhase(phase: GameflowPhase): void {
        if (phase === this.phase) return;
        const previous = this.phase;
        this.phase = phase;
        this.emit("gameflow-phase", phase);

        if (previous === CHAMP_SELECT_PHASE && phase !== CHAMP_SELECT_PHASE) {
            this.handleChampSelectEnd();
        }
    }

    private handleSession(session: LcuChampSelectSession): void {
        // Polling re-reads an unchanged session every second; only report real
        // changes so consumers can treat every event as news.
        const signature = signatureOf(session);
        if (signature === this.sessionSignature) return;
        this.sessionSignature = signature;
        this.session = session;
        this.emit("champ-select", session);

        const context = this.options.mapContext;
        if (context) {
            try {
                this.emit(
                    "champ-select-state",
                    mapChampSelectSession(session, context),
                );
            } catch (error) {
                this.emitError(error, "champ-select mapping failed");
            }
        }
    }

    private handleChampSelectEnd(): void {
        if (!this.session) return;
        this.session = null;
        this.sessionSignature = null;
        this.emit("champ-select-end");
    }

    private startPolling(): void {
        if (!this.running || !this.connected) return;
        this.polling = true;
        this.clearPollTimer();
        this.pollTimer = setTimeout(() => void this.poll(), this.sessionPollIntervalMs);
    }

    private async poll(): Promise<void> {
        this.pollTimer = null;
        const client = this.client;
        if (!this.running || !this.connected || !client) return;

        try {
            const phase = await client.getGameflowPhase();
            this.handlePhase(phase);
            if (phase === CHAMP_SELECT_PHASE) {
                const session = await client.getChampSelectSession();
                if (session) this.handleSession(session);
                else this.handleChampSelectEnd();
            }
        } catch (error) {
            this.handleDisconnect(describeError(error));
            return;
        }

        if (!this.running || !this.connected) return;
        this.pollTimer = setTimeout(() => void this.poll(), this.sessionPollIntervalMs);
    }

    private handleDisconnect(reason: string): void {
        if (!this.connected) return;
        this.teardownClient();
        this.connected = false;
        this.emit("disconnected", reason);
        if (this.running) this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        const attempt = this.reconnectAttempts;
        this.reconnectAttempts += 1;
        const delay = Math.min(
            this.reconnectBaseDelayMs * 2 ** attempt,
            this.reconnectMaxDelayMs,
        );
        this.logger.debug(`LCU reconnecting in ${delay}ms (attempt ${attempt + 1})`);
        this.schedule(() => void this.attempt(), delay);
    }

    private teardownClient(): void {
        this.clearPollTimer();
        this.closeSocket();
        this.polling = false;
        this.phase = null;
        if (this.session) this.handleChampSelectEnd();
        this.client?.close();
        this.client = null;
    }

    private closeSocket(): void {
        const socket = this.socket;
        this.socket = null;
        this.socketOpen = false;
        this.socketPending = false;
        if (!socket) return;
        try {
            socket.close();
        } catch (error) {
            this.logger.debug(`closing LCU websocket failed: ${describeError(error)}`);
        }
    }

    private schedule(run: () => void, delayMs: number): void {
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            run();
        }, delayMs);
    }

    private clearTimer(): void {
        if (this.timer === null) return;
        clearTimeout(this.timer);
        this.timer = null;
    }

    private clearPollTimer(): void {
        if (this.pollTimer === null) return;
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
    }

    private clearTimers(): void {
        this.clearTimer();
        this.clearPollTimer();
    }

    private discover(): Promise<LcuCredentials | null> {
        if (this.options.discover) return this.options.discover();
        return discoverCredentials({
            logger: this.logger,
            ...this.options.discoverOptions,
        });
    }

    private createClient(credentials: LcuCredentials): LcuWatcherClient {
        if (this.options.createClient) return this.options.createClient(credentials);
        return new LcuClient({
            credentials,
            logger: this.logger,
            ...this.options.clientOptions,
        });
    }

    private socketFactory(): LcuSocketFactory | null {
        if (this.options.createSocket === null) return null;
        return this.options.createSocket ?? createLcuSocket;
    }

    /**
     * `error` is emitted only when someone is listening: Node's EventEmitter
     * throws an unhandled `error` event, which would turn a transient socket
     * hiccup into a crash.
     */
    private emitError(error: unknown, context: string): void {
        const wrapped =
            error instanceof Error ? error : new Error(`${context}: ${String(error)}`);
        this.logger.debug(`LCU ${context}: ${describeError(error)}`);
        if (this.listenerCount("error") > 0) this.emit("error", wrapped);
    }
}

/**
 * A cheap change detector for a session.
 *
 * `counter` alone is not enough (it does not move for every field), so the
 * whole payload is stringified. Sessions are a few kilobytes and this runs at
 * most once a second.
 */
function signatureOf(session: LcuChampSelectSession): string {
    try {
        return JSON.stringify(session);
    } catch {
        return String(session.counter ?? Math.random());
    }
}
