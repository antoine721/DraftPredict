import { fileURLToPath } from "node:url";
import { BrowserWindow, shell } from "electron";
import { appIcon } from "./icons.js";
import { isExternalHttpsUrl, isInternalUrl } from "./security.js";
import type { WindowStateStore } from "./window-state.js";

/**
 * Window construction and, more importantly, window *policy*.
 *
 * Both windows are created with the same hardening:
 *  - `contextIsolation: true`, `nodeIntegration: false`, no `webviewTag`;
 *  - `window.open` is denied outright — an `https://` target is handed to the
 *    OS browser instead, anything else is dropped;
 *  - navigation is restricted to the embedded server (and the Vite dev server
 *    in development); every other URL is cancelled and, if it is `https://`,
 *    opened externally.
 *
 * `sandbox` is `false` because the preload script is an ES module, which
 * Electron only supports in unsandboxed preloads. The preload itself imports
 * nothing and exposes a fixed, non-generic API surface — see `preload.ts`.
 */

export const BACKGROUND = "#0b0f19";

const PRELOAD = fileURLToPath(new URL("./preload.mjs", import.meta.url));

export type WindowDeps = {
    /** Origins the windows may navigate to. */
    allowedOrigins: string[];
    state: WindowStateStore;
    dev: boolean;
    /** Start in the tray without showing the window (login-item `--hidden`). */
    startHidden?: boolean;
};

export function createMainWindow(deps: WindowDeps): BrowserWindow {
    const saved = deps.state.get("main", { width: 1280, height: 860 });

    const window = new BrowserWindow({
        width: saved.width,
        height: saved.height,
        ...(saved.x !== undefined && saved.y !== undefined
            ? { x: saved.x, y: saved.y }
            : {}),
        minWidth: 1024,
        minHeight: 700,
        backgroundColor: BACKGROUND,
        show: false,
        // The UI draws its own header; the native menu bar is only useful for
        // the devtools shortcut in development.
        autoHideMenuBar: !deps.dev,
        icon: process.platform === "darwin" ? undefined : appIcon(),
        title: "DraftPredict",
        webPreferences: {
            preload: PRELOAD,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInWorker: false,
            sandbox: false,
            webviewTag: false,
            spellcheck: false,
            devTools: deps.dev,
        },
    });

    if (saved.maximized) window.maximize();
    if (!deps.startHidden) window.once("ready-to-show", () => window.show());

    const remember = (): void => {
        if (window.isDestroyed() || window.isMinimized()) return;
        const bounds = window.getNormalBounds();
        deps.state.save("main", { ...bounds, maximized: window.isMaximized() });
    };
    window.on("resize", remember);
    window.on("move", remember);
    window.on("close", remember);

    hardenWebContents(window, deps.allowedOrigins);
    return window;
}

/**
 * The compact champ-select overlay: a small frameless always-on-top window
 * with the win probability and the best suggestions, meant to sit next to the
 * League client during picks and bans.
 *
 * It is a *display*: it never receives game input and never sends any.
 */
export function createOverlayWindow(deps: WindowDeps): BrowserWindow {
    const saved = deps.state.get("overlay", { width: 340, height: 420 });

    const window = new BrowserWindow({
        width: saved.width,
        height: saved.height,
        ...(saved.x !== undefined && saved.y !== undefined
            ? { x: saved.x, y: saved.y }
            : {}),
        minWidth: 260,
        minHeight: 200,
        maxWidth: 560,
        backgroundColor: BACKGROUND,
        frame: false,
        show: false,
        skipTaskbar: true,
        resizable: true,
        maximizable: false,
        fullscreenable: false,
        title: "DraftPredict — aperçu",
        webPreferences: {
            preload: PRELOAD,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            webviewTag: false,
            spellcheck: false,
            devTools: deps.dev,
        },
    });

    // "screen-saver" keeps it above borderless-fullscreen League; it still
    // cannot draw over an exclusive-fullscreen game (see docs/DESKTOP.md).
    window.setAlwaysOnTop(true, "screen-saver");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    const remember = (): void => {
        if (window.isDestroyed()) return;
        deps.state.save("overlay", window.getNormalBounds());
    };
    window.on("resize", remember);
    window.on("move", remember);

    hardenWebContents(window, deps.allowedOrigins);
    return window;
}

/** Applies the navigation / popup policy to a window's web contents. */
export function hardenWebContents(
    window: BrowserWindow,
    allowedOrigins: string[],
): void {
    const contents = window.webContents;

    contents.setWindowOpenHandler(({ url }) => {
        if (isExternalHttpsUrl(url)) void shell.openExternal(url);
        return { action: "deny" };
    });

    contents.on("will-navigate", (event, url) => {
        if (isInternalUrl(url, allowedOrigins)) return;
        event.preventDefault();
        if (isExternalHttpsUrl(url)) void shell.openExternal(url);
    });

    // Renderers have no business attaching anything.
    contents.on("will-attach-webview", (event) => event.preventDefault());

    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
        callback(false);
    });
}
