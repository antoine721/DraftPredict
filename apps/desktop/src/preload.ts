import { contextBridge, ipcRenderer } from "electron";
import type {
    AppInfo,
    DesktopPreferences,
    DraftPredictBridge,
    OverlayAction,
    OverlayState,
    UpdateStatus,
    WindowAction,
} from "./bridge.js";

/**
 * The only code that runs with Node privileges next to the renderer.
 *
 * Rules this file obeys, and the reason for each:
 *
 *  - **no generic IPC.** There is no `invoke(channel, …)` escape hatch: every
 *    exposed function targets one fixed channel with a validated argument, so
 *    a compromised renderer cannot reach a channel we did not intend.
 *  - **no `fs`, no `child_process`, no `require`.** The renderer talks to the
 *    local server over HTTP like any browser client.
 *  - **no runtime imports besides `electron`.** The build copies the compiled
 *    file to `preload.mjs` (Electron only accepts ES-module preloads with that
 *    extension), so the channel names are literals here. `IPC` in `bridge.ts`
 *    is the same list and `preload.channels.test.ts` fails if they diverge.
 *  - **event listeners get the payload only.** The `IpcRendererEvent` (which
 *    carries `sender`) is never forwarded to renderer code.
 */

type Unsubscribe = () => void;

function subscribe<T>(channel: string, listener: (value: T) => void): Unsubscribe {
    const handler = (_event: unknown, value: T): void => listener(value);
    ipcRenderer.on(channel, handler);
    return () => {
        ipcRenderer.off(channel, handler);
    };
}

const api: DraftPredictBridge = {
    getAppInfo: () => ipcRenderer.invoke("draftpredict:app-info") as Promise<AppInfo>,

    openExternal: (url: string) =>
        ipcRenderer.invoke(
            "draftpredict:open-external",
            String(url),
        ) as Promise<boolean>,

    window: {
        control: (action: WindowAction) =>
            ipcRenderer.invoke(
                "draftpredict:window-control",
                String(action),
            ) as Promise<void>,
    },

    overlay: {
        control: (action: OverlayAction) =>
            ipcRenderer.invoke(
                "draftpredict:overlay-control",
                String(action),
            ) as Promise<OverlayState>,
        onChange: (listener) =>
            subscribe<OverlayState>("draftpredict:overlay-changed", listener),
    },

    preferences: {
        get: () =>
            ipcRenderer.invoke(
                "draftpredict:preferences-get",
            ) as Promise<DesktopPreferences>,
        set: (patch: Partial<DesktopPreferences>) =>
            ipcRenderer.invoke(
                "draftpredict:preferences-set",
                // Structured-cloned as-is; the main process validates it.
                { ...patch },
            ) as Promise<DesktopPreferences>,
        onChange: (listener) =>
            subscribe<DesktopPreferences>("draftpredict:preferences-changed", listener),
    },

    updates: {
        status: () =>
            ipcRenderer.invoke("draftpredict:update-status") as Promise<UpdateStatus>,
        check: () =>
            ipcRenderer.invoke("draftpredict:update-check") as Promise<UpdateStatus>,
        onChange: (listener) =>
            subscribe<UpdateStatus>("draftpredict:update-changed", listener),
    },
};

contextBridge.exposeInMainWorld("draftpredict", api);
