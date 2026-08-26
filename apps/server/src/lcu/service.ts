import { EventEmitter } from "node:events";
import type { AnalyzeDraftConfig, Role } from "@draftpredict/core";
import type { ChampSelectState, LcuSummoner, LcuWatcher } from "@draftpredict/lcu";
import type { ConfigService } from "../config/service.js";
import type { DatasetContext } from "../services/dataset.js";
import type {
    AnalyzePayload,
    DraftAnalysisService,
    SuggestionsPayload,
} from "../services/draft.js";
import type { LcuStatus, SerializedChampSelectState } from "./serialize.js";
import { serializeChampSelectState } from "./serialize.js";

/**
 * The bridge between the League Client and the rest of the server.
 *
 * Two rules govern this file:
 *
 *  - **the LCU never takes the server down.** The watcher already swallows
 *    connection problems, but analysis runs on live data and could still
 *    throw; every path here is wrapped, and failures become an `error` event
 *    plus a status update, never a rejected promise nobody awaits.
 *  - **bursts are coalesced.** The client fires several session updates per
 *    second during picks and bans. Each one would otherwise trigger a full
 *    suggestion sweep over ~170 champions, so updates are debounced and only
 *    the most recent state is ever analysed.
 */

export type ChampSelectUpdate = {
    state: SerializedChampSelectState;
    analysis: AnalyzePayload;
    suggestions: SuggestionsPayload;
    updatedAt: number;
};

export type LcuServiceEvents = {
    status: [status: LcuStatus];
    update: [update: ChampSelectUpdate];
    end: [];
    error: [error: Error];
};

export type LcuServiceOptions = {
    /** The watcher to follow. `null` disables the integration entirely. */
    watcher: LcuWatcher | null;
    config: ConfigService;
    dataset: DatasetContext;
    draft: DraftAnalysisService;
    /** Burst window, in ms. Default 150. */
    debounceMs?: number;
    /** Suggestions kept per open role. Default 8. */
    suggestionLimit?: number;
    /** Set `false` to keep the watcher stopped. Default from configuration. */
    enabled?: boolean;
    now?: () => number;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface LcuService {
    on<K extends keyof LcuServiceEvents>(
        event: K,
        listener: (...args: LcuServiceEvents[K]) => void,
    ): this;
    off<K extends keyof LcuServiceEvents>(
        event: K,
        listener: (...args: LcuServiceEvents[K]) => void,
    ): this;
    emit<K extends keyof LcuServiceEvents>(
        event: K,
        ...args: LcuServiceEvents[K]
    ): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LcuService extends EventEmitter {
    readonly watcher: LcuWatcher | null;

    private readonly config: ConfigService;
    private readonly datasetContext: DatasetContext;
    private readonly draft: DraftAnalysisService;
    private readonly debounceMs: number;
    private readonly suggestionLimit: number;
    private readonly now: () => number;

    private enabled: boolean;
    private started = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private pending: ChampSelectState | null = null;
    private analysing = false;
    private current: ChampSelectUpdate | null = null;
    private summoner: LcuSummoner | null = null;
    private lastError: string | null = null;
    private statusAt = 0;

    constructor(options: LcuServiceOptions) {
        super();
        this.watcher = options.watcher;
        this.config = options.config;
        this.datasetContext = options.dataset;
        this.draft = options.draft;
        this.debounceMs = options.debounceMs ?? 150;
        this.suggestionLimit = options.suggestionLimit ?? 8;
        this.now = options.now ?? Date.now;
        this.enabled =
            options.enabled ??
            (this.watcher !== null && this.config.get().lcuEnabled);
        this.statusAt = this.now();
    }

    // ---------------------------------------------------------- lifecycle ---

    start(): void {
        if (this.started || !this.watcher || !this.enabled) {
            this.publishStatus();
            return;
        }
        this.started = true;

        const watcher = this.watcher;
        // The watcher only emits "error" when someone is listening, and an
        // unhandled "error" on an EventEmitter throws — so subscribe first.
        watcher.on("error", (error) => this.handleError(error));
        watcher.on("connected", (summoner) => {
            this.summoner = summoner;
            this.lastError = null;
            this.publishStatus();
        });
        watcher.on("disconnected", () => {
            this.summoner = null;
            this.clearChampSelect();
            this.publishStatus();
        });
        watcher.on("current-summoner", (summoner) => {
            this.summoner = summoner;
            this.publishStatus();
        });
        watcher.on("gameflow-phase", () => this.publishStatus());
        watcher.on("champ-select-state", (state) => this.schedule(state));
        watcher.on("champ-select-end", () => {
            this.clearChampSelect();
            this.emitSafely("end");
            this.publishStatus();
        });

        try {
            watcher.start();
        } catch (error) {
            this.handleError(error);
        }
        this.publishStatus();
    }

    stop(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pending = null;
        try {
            this.watcher?.stop();
        } catch (error) {
            this.handleError(error);
        }
        this.watcher?.removeAllListeners();
        this.started = false;
        this.publishStatus();
    }

    // --------------------------------------------------------------- state ---

    isEnabled(): boolean {
        return this.enabled && this.watcher !== null;
    }

    status(): LcuStatus {
        const watcher = this.watcher;
        return {
            enabled: this.isEnabled(),
            running: watcher?.isRunning() ?? false,
            connected: watcher?.isConnected() ?? false,
            polling: watcher?.isPolling() ?? false,
            phase: watcher?.getPhase() ?? null,
            inChampSelect: this.current !== null,
            summoner: this.summoner
                ? {
                      puuid: this.summoner.puuid,
                      gameName: this.summoner.gameName ?? null,
                      tagLine: this.summoner.tagLine ?? null,
                      displayName: this.summoner.displayName ?? null,
                      summonerLevel: this.summoner.summonerLevel ?? null,
                      profileIconId: this.summoner.profileIconId ?? null,
                  }
                : null,
            lastError: this.lastError,
            updatedAt: this.statusAt,
        };
    }

    /** The last analysed champ select, for clients that connect late. */
    getCurrent(): ChampSelectUpdate | null {
        return this.current;
    }

    getSummoner(): LcuSummoner | null {
        return this.summoner;
    }

    /** Analyses a state immediately, bypassing the debounce (used by tests). */
    async handleState(state: ChampSelectState): Promise<ChampSelectUpdate | null> {
        return this.analyse(state);
    }

    /** Queues a state for analysis, coalescing bursts. */
    schedule(state: ChampSelectState): void {
        this.pending = state;
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.drain();
        }, this.debounceMs);
        // A pending analysis must never keep the process alive on shutdown.
        this.timer.unref?.();
    }

    // ---------------------------------------------------------- internals ---

    private async drain(): Promise<void> {
        if (this.analysing) return;
        const state = this.pending;
        this.pending = null;
        if (!state) return;

        this.analysing = true;
        try {
            await this.analyse(state);
        } finally {
            this.analysing = false;
        }

        // Something arrived while we were busy: analyse the newest state only.
        if (this.pending) this.schedule(this.pending);
    }

    private async analyse(state: ChampSelectState): Promise<ChampSelectUpdate | null> {
        try {
            const config = this.config.get();
            const analyzeConfig: AnalyzeDraftConfig = {
                riskLevel: config.riskLevel,
                minGames: config.minGames,
                ignoreChampionWinrates: config.ignoreChampionWinrates,
            };

            const pair = await this.datasetContext.getPair({
                rank: config.rank,
                region: config.region,
            });

            const input = {
                team: mergeHovers(state.ally, state.allyHovers),
                enemy: mergeHovers(state.opponent, state.opponentHovers),
                bans: { ally: [...state.bans.ally], opponent: [...state.bans.opponent] },
            };

            const update: ChampSelectUpdate = {
                state: serializeChampSelectState(state),
                analysis: this.draft.analyze(pair, input, analyzeConfig),
                suggestions: this.draft.suggestions(pair, input, analyzeConfig, {
                    limit: this.suggestionLimit,
                }),
                updatedAt: this.now(),
            };

            this.current = update;
            this.statusAt = update.updatedAt;
            this.emitSafely("update", update);
            this.publishStatus();
            return update;
        } catch (error) {
            this.handleError(error);
            return null;
        }
    }

    private clearChampSelect(): void {
        this.current = null;
        this.pending = null;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private publishStatus(): void {
        this.statusAt = this.now();
        this.emitSafely("status", this.status());
    }

    private handleError(error: unknown): void {
        const normalized =
            error instanceof Error ? error : new Error(String(error));
        this.lastError = normalized.message;
        this.emitSafely("error", normalized);
    }

    /**
     * `EventEmitter` rethrows an `error` event with no listener, which would
     * turn a League Client hiccup into a crashed process.
     */
    private emitSafely<K extends keyof LcuServiceEvents>(
        event: K,
        ...args: LcuServiceEvents[K]
    ): void {
        if (event === "error" && this.listenerCount("error") === 0) return;
        try {
            this.emit(event, ...args);
        } catch {
            // Listener bugs are the listener's problem.
        }
    }
}

/** Hovers fill slots that are not locked yet, so the UI reacts immediately. */
export function mergeHovers(
    locked: Map<Role, string>,
    hovers: Map<Role, string>,
): Map<Role, string> {
    const merged = new Map(locked);
    const taken = new Set(locked.values());
    for (const [role, championKey] of hovers) {
        if (merged.has(role) || taken.has(championKey)) continue;
        merged.set(role, championKey);
        taken.add(championKey);
    }
    return merged;
}
