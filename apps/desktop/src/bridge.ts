/**
 * The contract between the Electron main process and the renderer.
 *
 * This module is deliberately free of any `electron` import so that it can be
 * consumed by the main process, by tests and by `apps/web` typings alike. The
 * preload script re-declares the channel names as literals (it is copied to a
 * standalone `.mjs` file and therefore cannot import anything at runtime); the
 * `preload.channels.test.ts` suite asserts the two lists never drift apart.
 */

export const IPC = {
    appInfo: "draftpredict:app-info",
    openExternal: "draftpredict:open-external",
    windowControl: "draftpredict:window-control",
    overlayControl: "draftpredict:overlay-control",
    overlayChanged: "draftpredict:overlay-changed",
    preferencesGet: "draftpredict:preferences-get",
    preferencesSet: "draftpredict:preferences-set",
    preferencesChanged: "draftpredict:preferences-changed",
    updateStatus: "draftpredict:update-status",
    updateCheck: "draftpredict:update-check",
    updateChanged: "draftpredict:update-changed",
} as const;

export type WindowAction =
    | "minimize"
    | "maximize"
    | "unmaximize"
    | "toggle-maximize"
    | "hide"
    | "close";

export type OverlayAction = "show" | "hide" | "toggle" | "state";

/** Everything the renderer is allowed to know about its host. */
export type AppInfo = {
    /** Version of the desktop shell (`apps/desktop/package.json`). */
    appVersion: string;
    /** Version reported by the embedded DraftPredict server. */
    serverVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    /** `win32` | `darwin` | `linux`. */
    platform: string;
    arch: string;
    /** Origin of the embedded server, e.g. `http://127.0.0.1:4700`. */
    serverUrl: string;
    /** `true` when the shell was started with `DRAFTPREDICT_DEV=1`. */
    dev: boolean;
    /** `true` when this window is the compact always-on-top overlay. */
    overlay: boolean;
};

/** User preferences owned by the shell (the rest lives in the server config). */
export type DesktopPreferences = {
    /**
     * « Démarrer avec le client League » — launch DraftPredict at login and let
     * it sit in the tray until the League Client shows up.
     */
    startWithLeagueClient: boolean;
    /** Bring the window (or the overlay) to the front when champ select opens. */
    autoShowOnChampSelect: boolean;
    /** Show the compact overlay instead of the main window in champ select. */
    preferOverlayInChampSelect: boolean;
    /** Closing the window hides it to the tray instead of quitting. */
    minimizeToTray: boolean;
};

export const DEFAULT_PREFERENCES: DesktopPreferences = {
    startWithLeagueClient: false,
    autoShowOnChampSelect: true,
    preferOverlayInChampSelect: false,
    minimizeToTray: true,
};

export type UpdateState =
    | "disabled"
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "downloaded"
    | "error";

export type UpdateStatus = {
    state: UpdateState;
    /** Version currently installed. */
    currentVersion: string;
    /** Version found on the feed, when there is one. */
    nextVersion: string | null;
    /** Human readable detail — never contains a URL with credentials. */
    message: string | null;
    checkedAt: number | null;
};

export type OverlayState = { visible: boolean };

/** `window.draftpredict`, the entire surface the renderer gets. */
export type DraftPredictBridge = {
    getAppInfo(): Promise<AppInfo>;
    /** Opens an `https://` URL in the OS browser. Resolves `false` if refused. */
    openExternal(url: string): Promise<boolean>;
    window: {
        control(action: WindowAction): Promise<void>;
    };
    overlay: {
        control(action: OverlayAction): Promise<OverlayState>;
        onChange(listener: (state: OverlayState) => void): () => void;
    };
    preferences: {
        get(): Promise<DesktopPreferences>;
        set(patch: Partial<DesktopPreferences>): Promise<DesktopPreferences>;
        onChange(listener: (preferences: DesktopPreferences) => void): () => void;
    };
    updates: {
        status(): Promise<UpdateStatus>;
        check(): Promise<UpdateStatus>;
        onChange(listener: (status: UpdateStatus) => void): () => void;
    };
};
