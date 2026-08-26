import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./keys";
import { LiveSocket, type LiveSnapshot, type LiveSocketOptions } from "./ws";
import type {
    ClientMessage,
    ConfigResponse,
    DatasetPairMeta,
    LcuChampSelectResponse,
    LcuStatus,
    PublicConfig,
    ServerMessageOf,
    ServerMessageType,
    WsConnectionState,
} from "./types";

/**
 * React binding for the `/ws` socket.
 *
 * One socket for the whole app, created once and mounted at the root. Server
 * pushes are mirrored into the TanStack Query cache, so a component reading
 * `useLcuStatus()` over HTTP and one reading `useLcuLiveStatus()` over the
 * socket always agree.
 */

type LiveContextValue = {
    socket: LiveSocket;
};

const LiveContext = createContext<LiveContextValue | null>(null);

export type LiveSocketProviderProps = {
    children: ReactNode;
    options?: LiveSocketOptions;
    /** Set `false` in tests or Storybook to keep the socket closed. */
    enabled?: boolean;
};

export function LiveSocketProvider({
    children,
    options,
    enabled = true,
}: LiveSocketProviderProps) {
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const [socket] = useState(() => new LiveSocket(optionsRef.current ?? {}));
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!enabled) return;
        socket.connect();
        return () => {
            // `close()`, not `dispose()`: StrictMode mounts twice.
            socket.close();
        };
    }, [socket, enabled]);

    // Mirror every pushed state into the query cache.
    useEffect(() => {
        const unsubscribers = [
            socket.on("lcu:status", (message) => {
                queryClient.setQueryData<LcuStatus>(
                    queryKeys.lcu.status,
                    message.status,
                );
            }),
            socket.on("champselect:update", (message) => {
                queryClient.setQueryData<LcuChampSelectResponse>(
                    queryKeys.lcu.champSelect,
                    (previous) => ({
                        inChampSelect: true,
                        status: previous?.status ??
                            socket.getSnapshot().lcu ?? {
                                enabled: true,
                                running: true,
                                connected: true,
                                polling: false,
                                phase: "ChampSelect",
                                inChampSelect: true,
                                summoner: null,
                                lastError: null,
                                updatedAt: Date.now(),
                            },
                        state: message.state,
                        analysis: message.analysis,
                        suggestions: message.suggestions,
                        updatedAt: Date.now(),
                    }),
                );
            }),
            socket.on("champselect:end", () => {
                queryClient.setQueryData<LcuChampSelectResponse>(
                    queryKeys.lcu.champSelect,
                    (previous) =>
                        previous
                            ? {
                                  ...previous,
                                  inChampSelect: false,
                                  state: null,
                                  analysis: null,
                                  suggestions: null,
                              }
                            : previous,
                );
            }),
            socket.on("config:update", (message) => {
                queryClient.setQueryData<ConfigResponse>(
                    queryKeys.config,
                    (previous) =>
                        previous ? { ...previous, config: message.config } : previous,
                );
                void queryClient.invalidateQueries({ queryKey: queryKeys.config });
            }),
            socket.on("dataset:update", () => {
                void queryClient.invalidateQueries({ queryKey: queryKeys.dataset.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.draft.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.builds.all });
                void queryClient.invalidateQueries({ queryKey: queryKeys.health });
            }),
        ];
        return () => {
            for (const unsubscribe of unsubscribers) unsubscribe();
        };
    }, [socket, queryClient]);

    const value = useMemo(() => ({ socket }), [socket]);
    return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/** The shared socket. Throws outside the provider — that is a wiring bug. */
export function useLiveSocket(): LiveSocket {
    const context = useContext(LiveContext);
    if (!context) {
        throw new Error("useLiveSocket must be used inside <LiveSocketProvider>");
    }
    return context.socket;
}

/** `connecting` | `open` | `reconnecting` | `closed`, re-rendered on change. */
export function useLiveConnectionState(): WsConnectionState {
    const socket = useLiveSocket();
    return useSyncExternalStore(
        useCallback((onChange) => socket.onStateChange(onChange), [socket]),
        () => socket.getState(),
        () => "closed" as WsConnectionState,
    );
}

/** The last replayed state of everything (LCU, champ select, config, dataset). */
export function useLiveSnapshot(): LiveSnapshot {
    const socket = useLiveSocket();
    const [snapshot, setSnapshot] = useState<LiveSnapshot>(() => socket.getSnapshot());
    useEffect(() => {
        setSnapshot(socket.getSnapshot());
        return socket.onAny(() => setSnapshot(socket.getSnapshot()));
    }, [socket]);
    return snapshot;
}

/**
 * Subscribes to one server message type for as long as the component lives.
 * The handler is kept in a ref, so an inline arrow does not re-subscribe.
 */
export function useLiveEvent<T extends ServerMessageType>(
    type: T,
    handler: (message: ServerMessageOf<T>) => void,
): void {
    const socket = useLiveSocket();
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(
        () =>
            socket.on(type, ((message: ServerMessageOf<T>) => {
                handlerRef.current(message);
            }) as (message: ServerMessageOf<T>) => void),
        [socket, type],
    );
}

/** Sends a client frame; `false` when the socket is not open right now. */
export function useLiveSend(): (message: ClientMessage) => boolean {
    const socket = useLiveSocket();
    return useCallback((message: ClientMessage) => socket.send(message), [socket]);
}

export type LiveChampSelect = {
    /** `true` while the League Client is in champion select. */
    active: boolean;
    state: ServerMessageOf<"champselect:update">["state"] | null;
    analysis: ServerMessageOf<"champselect:update">["analysis"] | null;
    suggestions: ServerMessageOf<"champselect:update">["suggestions"] | null;
    /** Epoch ms of the last update, `null` when nothing was ever received. */
    updatedAt: number | null;
};

/**
 * The live champion select, straight from the League Client.
 *
 * Backed by the socket's replay buffer, so a page reload in the middle of a
 * draft repaints immediately instead of waiting for the next LCU event.
 */
export function useLiveChampSelect(): LiveChampSelect {
    const socket = useLiveSocket();
    const [value, setValue] = useState<LiveChampSelect>(() => fromSnapshot(socket));

    useEffect(() => {
        setValue(fromSnapshot(socket));
        const unsubscribers = [
            socket.on("champselect:update", (message) =>
                setValue({
                    active: true,
                    state: message.state,
                    analysis: message.analysis,
                    suggestions: message.suggestions,
                    updatedAt: Date.now(),
                }),
            ),
            socket.on("champselect:end", () =>
                setValue({
                    active: false,
                    state: null,
                    analysis: null,
                    suggestions: null,
                    updatedAt: Date.now(),
                }),
            ),
        ];
        return () => {
            for (const unsubscribe of unsubscribers) unsubscribe();
        };
    }, [socket]);

    return value;
}

function fromSnapshot(socket: LiveSocket): LiveChampSelect {
    const message = socket.getSnapshot().champSelect;
    return message
        ? {
              active: true,
              state: message.state,
              analysis: message.analysis,
              suggestions: message.suggestions,
              updatedAt: Date.now(),
          }
        : {
              active: false,
              state: null,
              analysis: null,
              suggestions: null,
              updatedAt: null,
          };
}

/** LCU status pushed over the socket (`null` until the first frame). */
export function useLcuLiveStatus(): LcuStatus | null {
    return useLiveSnapshot().lcu;
}

/** Settings pushed over the socket, whoever wrote them. */
export function useLiveConfig(): PublicConfig | null {
    return useLiveSnapshot().config;
}

/** Dataset provenance pushed over the socket. */
export function useLiveDataset(): DatasetPairMeta | null {
    return useLiveSnapshot().dataset;
}

export type JobProgress = {
    job: string;
    key: string;
    stage: string;
    loaded: number;
    total: number;
};

/**
 * Progress of a long Riot job (`matches`, `playstyle`). Pass `job` and
 * optionally `key` (the puuid) to filter. `null` when nothing is running.
 */
export function useJobProgress(job?: string, key?: string): JobProgress | null {
    const [progress, setProgress] = useState<JobProgress | null>(null);
    useLiveEvent("job:progress", (message) => {
        if (job !== undefined && message.job !== job) return;
        if (key !== undefined && message.key !== key) return;
        const next: JobProgress = {
            job: message.job,
            key: message.key,
            stage: message.stage,
            loaded: message.loaded,
            total: message.total,
        };
        setProgress(next.total > 0 && next.loaded >= next.total ? null : next);
    });
    return progress;
}
