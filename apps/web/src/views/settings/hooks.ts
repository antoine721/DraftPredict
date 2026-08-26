import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
    ApiError,
    queryKeys,
    useLcuLiveStatus,
    useLcuStatus,
    useUpdateConfig,
    type ConfigUpdate,
    type ConfigUpdateResponse,
    type LcuStatus,
} from "../../api";
import { toast } from "../../app/toast";

/**
 * The settings screen's data plumbing.
 *
 * `useAccountMe` lives in `src/api` — three views needed it, so it was promoted
 * there and is re-exported here for convenience. What is genuinely local is the
 * `window.draftpredict` bridge, which is optional by construction: the same
 * bundle runs in a plain browser.
 */

/** Re-exported so the panels in this folder keep a single import site. */
export { useAccountMe, type AccountMeResponse } from "../../api";

// -------------------------------------------------------------- config writes ---

export type SaveMessage = { title: string; description?: string };

export type ConfigSaver = {
    /** Resolves with the response, or `null` when the write failed. */
    save: (
        patch: ConfigUpdate,
        message: SaveMessage,
    ) => Promise<ConfigUpdateResponse | null>;
    isSaving: boolean;
    /** The last failure, kept so the panel can show it inline, not just as a toast. */
    error: ApiError | null;
    clearError: () => void;
};

/**
 * `POST /api/config`, with the two rules the whole screen obeys: a successful
 * write is confirmed by a toast, and a failed one is *reported* — the control
 * keeps showing the server's value rather than silently pretending.
 *
 * `useUpdateConfig` already invalidates config, health, dataset, draft, builds
 * and account, so the draft board reflects a new risk level immediately.
 */
export function useConfigSaver(): ConfigSaver {
    const mutation = useUpdateConfig();
    const [error, setError] = useState<ApiError | null>(null);

    const save = useCallback(
        async (patch: ConfigUpdate, message: SaveMessage) => {
            try {
                const response = await mutation.mutateAsync(patch);
                setError(null);
                toast.success(message.title, message.description);
                return response;
            } catch (cause) {
                const apiError =
                    cause instanceof ApiError
                        ? cause
                        : new ApiError({
                              code: "INTERNAL_ERROR",
                              message: "Erreur inconnue",
                              status: 0,
                              cause,
                          });
                setError(apiError);
                toast.fromError(apiError, "Enregistrement impossible");
                return null;
            }
        },
        [mutation],
    );

    return {
        save,
        isSaving: mutation.isPending,
        error,
        clearError: useCallback(() => setError(null), []),
    };
}

// ----------------------------------------------------------- League client ---

export type ClientState = {
    status: LcuStatus | null;
    isLoading: boolean;
    isFetching: boolean;
    /** Forces a fresh read of the client state (there is no reconnect route). */
    refresh: () => Promise<LcuStatus | null>;
};

/** The live socket status when there is one, the REST status otherwise. */
export function useClientStatus(): ClientState {
    const live = useLcuLiveStatus();
    const query = useLcuStatus();
    const client = useQueryClient();

    // `refetch` is stable across renders; the query object is not.
    const { refetch } = query;
    const refresh = useCallback(async () => {
        await client.invalidateQueries({ queryKey: queryKeys.lcu.all });
        const result = await refetch();
        return result.data ?? null;
    }, [client, refetch]);

    return {
        status: live ?? query.data ?? null,
        isLoading: query.isLoading,
        isFetching: query.isFetching,
        refresh,
    };
}

// ---------------------------------------------------------- desktop bridge ---

/** Mirrors `apps/desktop`'s bridge contract, structurally — no import, no coupling. */
export type DesktopAppInfo = {
    appVersion: string;
    serverVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    platform: string;
    arch: string;
    serverUrl: string;
    dev: boolean;
    overlay: boolean;
};

export type DesktopPreferences = {
    startWithLeagueClient: boolean;
    autoShowOnChampSelect: boolean;
    preferOverlayInChampSelect: boolean;
    minimizeToTray: boolean;
};

export type DesktopUpdateState =
    | "disabled"
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "error";

export type DesktopUpdateStatus = {
    state: DesktopUpdateState;
    currentVersion: string;
    nextVersion: string | null;
    message: string | null;
    checkedAt: number | null;
};

export type DesktopBridge = {
    getAppInfo(): Promise<DesktopAppInfo>;
    openExternal?(url: string): Promise<boolean>;
    overlay: {
        control(action: "show" | "hide" | "toggle" | "state"): Promise<{
            visible: boolean;
        }>;
        onChange(listener: (state: { visible: boolean }) => void): () => void;
    };
    preferences: {
        get(): Promise<DesktopPreferences>;
        set(patch: Partial<DesktopPreferences>): Promise<DesktopPreferences>;
        onChange(listener: (preferences: DesktopPreferences) => void): () => void;
    };
    updates: {
        status(): Promise<DesktopUpdateStatus>;
        check(): Promise<DesktopUpdateStatus>;
        onChange(listener: (status: DesktopUpdateStatus) => void): () => void;
    };
};

/** `window.draftpredict`, or `null` in a browser. Never assume it is there. */
export function readDesktopBridge(): DesktopBridge | null {
    if (typeof window === "undefined") return null;
    const bridge = (window as unknown as { draftpredict?: Partial<DesktopBridge> })
        .draftpredict;
    if (!bridge?.overlay || !bridge.preferences || !bridge.updates) return null;
    return bridge as DesktopBridge;
}

export type DesktopState = {
    bridge: DesktopBridge | null;
    info: DesktopAppInfo | null;
    preferences: DesktopPreferences | null;
    update: DesktopUpdateStatus | null;
    overlayVisible: boolean | null;
    /** A bridge call rejected — shown as-is rather than swallowed. */
    error: string | null;
    busy: boolean;
    setPreference: (patch: Partial<DesktopPreferences>) => Promise<void>;
    toggleOverlay: () => Promise<void>;
    checkForUpdates: () => Promise<void>;
};

function describeBridgeFailure(cause: unknown): string {
    if (cause instanceof Error && cause.message) return cause.message;
    return "L'application de bureau n'a pas répondu.";
}

/**
 * Everything the Electron shell exposes, loaded on mount and kept in sync
 * through the bridge's own change events.
 *
 * Detection happens in an effect: server rendering has no `window`, and the
 * browser build must not branch on a build flag — the same bundle is served
 * both inside and outside the shell.
 */
export function useDesktopBridge(): DesktopState {
    const [bridge, setBridge] = useState<DesktopBridge | null>(null);
    const [info, setInfo] = useState<DesktopAppInfo | null>(null);
    const [preferences, setPreferences] = useState<DesktopPreferences | null>(null);
    const [update, setUpdate] = useState<DesktopUpdateStatus | null>(null);
    const [overlayVisible, setOverlayVisible] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        const detected = readDesktopBridge();
        setBridge(detected);
        if (!detected) return () => {};

        const unsubscribes: Array<() => void> = [];
        void (async () => {
            try {
                const [appInfo, prefs, status, overlay] = await Promise.all([
                    detected.getAppInfo(),
                    detected.preferences.get(),
                    detected.updates.status(),
                    detected.overlay.control("state"),
                ]);
                if (!alive.current) return;
                setInfo(appInfo);
                setPreferences(prefs);
                setUpdate(status);
                setOverlayVisible(overlay.visible);
            } catch (cause) {
                if (alive.current) setError(describeBridgeFailure(cause));
            }
        })();

        unsubscribes.push(
            detected.preferences.onChange((next) => setPreferences(next)),
            detected.updates.onChange((next) => setUpdate(next)),
            detected.overlay.onChange((next) => setOverlayVisible(next.visible)),
        );

        return () => {
            alive.current = false;
            for (const unsubscribe of unsubscribes) unsubscribe();
        };
    }, []);

    const run = useCallback(async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (cause) {
            setError(describeBridgeFailure(cause));
        } finally {
            setBusy(false);
        }
    }, []);

    const setPreference = useCallback(
        async (patch: Partial<DesktopPreferences>) => {
            if (!bridge) return;
            await run(async () => {
                const next = await bridge.preferences.set(patch);
                setPreferences(next);
                toast.success("Préférence enregistrée");
            });
        },
        [bridge, run],
    );

    const toggleOverlay = useCallback(async () => {
        if (!bridge) return;
        await run(async () => {
            const next = await bridge.overlay.control("toggle");
            setOverlayVisible(next.visible);
        });
    }, [bridge, run]);

    const checkForUpdates = useCallback(async () => {
        if (!bridge) return;
        await run(async () => {
            const next = await bridge.updates.check();
            setUpdate(next);
        });
    }, [bridge, run]);

    return {
        bridge,
        info,
        preferences,
        update,
        overlayVisible,
        error,
        busy,
        setPreference,
        toggleOverlay,
        checkForUpdates,
    };
}
