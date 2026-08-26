import { EventEmitter } from "node:events";
import type {
    ChampSelectMapContext,
    ChampSelectState,
    GameflowPhase,
    LcuChampSelectSession,
    LcuCredentials,
    LcuSummoner,
    LcuWatcher,
    LcuWatcherClient,
} from "@draftpredict/lcu";
import { emptyChampSelectState } from "@draftpredict/lcu";
import type { Role } from "@draftpredict/core";

/**
 * A stand-in for {@link LcuWatcher} that emits whatever a test tells it to.
 *
 * It implements the surface `LcuService` actually uses, which is the point:
 * the champ-select pipeline can be exercised end to end — debounce, analysis,
 * broadcast — without a League Client anywhere near the test runner.
 */
export class FakeLcuWatcher extends EventEmitter {
    running = false;
    connected = false;
    polling = false;
    phase: GameflowPhase | null = null;
    session: LcuChampSelectSession | null = null;

    start(): void {
        this.running = true;
    }

    stop(): void {
        this.running = false;
        this.connected = false;
    }

    isRunning(): boolean {
        return this.running;
    }

    isConnected(): boolean {
        return this.connected;
    }

    isPolling(): boolean {
        return this.polling;
    }

    getPhase(): GameflowPhase | null {
        return this.phase;
    }

    getSession(): LcuChampSelectSession | null {
        return this.session;
    }

    getState(_context?: ChampSelectMapContext): ChampSelectState | null {
        return null;
    }

    getClient(): LcuWatcherClient | null {
        return null;
    }

    getCredentials(): LcuCredentials | null {
        return null;
    }

    /** Pretends a client came up. */
    connect(summoner: LcuSummoner | null = null): void {
        this.connected = true;
        this.running = true;
        this.phase = "Lobby";
        this.emit("connected", summoner);
    }

    /** Pushes a mapped champ-select state, exactly like the real watcher. */
    pushChampSelect(state: ChampSelectState): void {
        this.phase = "ChampSelect";
        this.emit("champ-select-state", state);
    }

    endChampSelect(): void {
        this.emit("champ-select-end");
    }

    /** Usable where an `LcuWatcher` is expected. */
    asWatcher(): LcuWatcher {
        return this as unknown as LcuWatcher;
    }
}

/** Builds a champ-select state with the given picks. */
export function champSelectState(options: {
    ally?: [Role, string][];
    opponent?: [Role, string][];
    allyHovers?: [Role, string][];
    bans?: { ally?: string[]; opponent?: string[] };
}): ChampSelectState {
    const state = emptyChampSelectState();
    state.phase = "BAN_PICK";
    state.timerMs = 27_000;
    for (const [role, key] of options.ally ?? []) state.ally.set(role, key);
    for (const [role, key] of options.opponent ?? []) state.opponent.set(role, key);
    for (const [role, key] of options.allyHovers ?? []) {
        state.allyHovers.set(role, key);
    }
    state.bans = {
        ally: [...(options.bans?.ally ?? [])],
        opponent: [...(options.bans?.opponent ?? [])],
    };
    return state;
}
