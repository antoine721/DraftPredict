import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, app, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { DEFAULT_PREFERENCES, IPC } from "./bridge.js";
import type {
    AppInfo,
    DesktopPreferences,
    OverlayAction,
    OverlayState,
    UpdateStatus,
    WindowAction,
} from "./bridge.js";
import { PreferencesStore, preferencesPath } from "./preferences.js";
import { internalOrigins, isExternalHttpsUrl } from "./security.js";
import { startEmbeddedServer } from "./server.js";
import type { EmbeddedServer } from "./server.js";
import { createTray } from "./tray.js";
import type { TrayController } from "./tray.js";
import { UpdaterController } from "./updater.js";
import { WindowStateStore } from "./window-state.js";
import { createMainWindow, createOverlayWindow } from "./windows.js";

/**
 * DraftPredict — Electron main process.
 *
 * One process does everything: it hosts the Fastify server (see `server.ts`),
 * owns the two windows, the tray and the League-Client-driven behaviour. The
 * renderer is a plain web client of `http://127.0.0.1:<port>` with a tiny,
 * fixed IPC bridge (see `preload.ts`).
 *
 * The League Client integration is **read-only**: the server's LCU watcher
 * polls the client's local API for the champ-select session, and the shell
 * reacts by showing a window. Nothing is ever written back to the client and
 * no input is injected — see `docs/DESKTOP.md`.
 */

const DEV = process.env.DRAFTPREDICT_DEV === "1";
const DEV_URL = process.env.DRAFTPREDICT_DEV_URL ?? "http://localhost:5173";
const APP_ID = "com.draftpredict.app";
/** Set by the login item: start in the tray, do not steal focus at boot. */
const START_HIDDEN = process.argv.includes("--hidden");

const OVERLAY_HTML = fileURLToPath(new URL("../static/overlay.html", import.meta.url));
const FALLBACK_HTML = fileURLToPath(new URL("../static/no-web-build.html", import.meta.url));

let server: EmbeddedServer | null = null;
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: TrayController | null = null;
let preferences: PreferencesStore | null = null;
let windowState: WindowStateStore | null = null;
let updater: UpdaterController | null = null;
let allowedOrigins: string[] = [];
let lcuStatusLabel = "Client League : en attente";
let champSelectHandled = false;
let quitting = false;
let shuttingDown = false;

// --------------------------------------------------------- single instance ---
// A second launch must never start a second server: it just wakes the window
// that is already running (the one holding the lock).

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        revealMainWindow();
    });
    void bootstrap();
}

async function bootstrap(): Promise<void> {
    app.setAppUserModelId(APP_ID);
    // The renderer never needs a menu; keep the accelerators in development.
    if (!DEV) Menu.setApplicationMenu(null);

    await app.whenReady();

    const userData = app.getPath("userData");
    preferences = new PreferencesStore(preferencesPath(userData));
    windowState = new WindowStateStore(join(userData, "window-state.json"));
    updater = new UpdaterController(app.getVersion());

    try {
        server = await startEmbeddedServer();
    } catch (error: unknown) {
        dialog.showErrorBox(
            "DraftPredict n'a pas pu démarrer",
            `Le serveur local n'a pas démarré :\n\n${
                error instanceof Error ? error.message : String(error)
            }`,
        );
        app.exit(1);
        return;
    }

    allowedOrigins = internalOrigins(server.url, DEV);

    registerIpc();
    updater.initialize();
    updater.on("status", (status: UpdateStatus) => broadcast(IPC.updateChanged, status));

    preferences.onChange((prefs) => {
        applyLoginItem(prefs.startWithLeagueClient);
        broadcast(IPC.preferencesChanged, prefs);
        renderTray();
    });
    applyLoginItem(preferences.get().startWithLeagueClient);

    tray = createTray({
        toggleWindow: () => {
            if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
                mainWindow.hide();
            } else {
                revealMainWindow();
            }
            renderTray();
        },
        toggleOverlay: () => setOverlayVisible(!isOverlayVisible()),
        setPreference: (key, value) => preferences?.set({ [key]: value }),
        quit: () => {
            quitting = true;
            app.quit();
        },
    });

    watchLeagueClient();
    openMainWindow();
    renderTray();
}

// -------------------------------------------------------------- main window ---

let hasShownOnce = false;

function openMainWindow(startHidden = START_HIDDEN): BrowserWindow {
    if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;

    const window = createMainWindow({
        allowedOrigins,
        state: windowState!,
        dev: DEV,
        startHidden: startHidden && !hasShownOnce,
    });
    hasShownOnce = true;
    mainWindow = window;

    const target = DEV ? DEV_URL : (server?.url ?? DEV_URL);
    if (!DEV && !server?.ctx.webRoot) {
        // The UI bundle is missing (a source checkout that never ran
        // `npm run build -w @draftpredict/web`). Say so instead of showing a
        // bare 404 from the API.
        void window.loadFile(FALLBACK_HTML);
    } else {
        void window.loadURL(target);
    }

    window.on("show", renderTray);
    window.on("hide", renderTray);
    window.on("focus", renderTray);

    window.on("close", (event) => {
        if (quitting || !preferences?.get().minimizeToTray) return;
        // Closing hides to the tray: the point of the app is to keep watching
        // the League Client while you play.
        event.preventDefault();
        window.hide();
        renderTray();
    });

    window.on("closed", () => {
        mainWindow = null;
    });

    return window;
}

function revealMainWindow(): void {
    const window = openMainWindow(false);
    if (window.isMinimized()) window.restore();
    if (!window.isVisible()) window.show();
    window.focus();
}

// ----------------------------------------------------------------- overlay ---

function openOverlayWindow(): BrowserWindow {
    if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

    const window = createOverlayWindow({
        allowedOrigins,
        state: windowState!,
        dev: DEV,
    });
    overlayWindow = window;

    // The overlay is a self-contained page shipped with the shell; it talks to
    // the embedded server over the documented WebSocket protocol, so it works
    // even while the main UI is closed.
    void window.loadFile(OVERLAY_HTML, {
        query: { server: server?.url ?? "", overlay: "1" },
    });

    window.on("closed", () => {
        overlayWindow = null;
        broadcastOverlayState();
        renderTray();
    });

    return window;
}

function isOverlayVisible(): boolean {
    return Boolean(
        overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible(),
    );
}

function setOverlayVisible(visible: boolean): OverlayState {
    if (visible) {
        const window = openOverlayWindow();
        window.showInactive();
        window.setAlwaysOnTop(true, "screen-saver");
    } else if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
    }
    broadcastOverlayState();
    renderTray();
    return { visible: isOverlayVisible() };
}

function broadcastOverlayState(): void {
    broadcast(IPC.overlayChanged, { visible: isOverlayVisible() });
}

// ------------------------------------------------------- League Client hook ---

/**
 * Reacts to the server's champ-select events.
 *
 * The server already debounces the client's update bursts, so this only has to
 * decide *once per session* whether to bring something to the front — never on
 * every pick, which would fight the user for focus.
 */
function watchLeagueClient(): void {
    const lcu = server?.ctx.lcu;
    if (!lcu) return;

    lcu.on("status", (status) => {
        lcuStatusLabel = describeLcu(status.connected, status.phase, status.enabled);
        renderTray();
    });

    lcu.on("update", () => {
        lcuStatusLabel = "Client League : champ select";
        renderTray();
        if (champSelectHandled) return;
        champSelectHandled = true;

        const prefs = preferences?.get() ?? DEFAULT_PREFERENCES;
        if (!prefs.autoShowOnChampSelect) return;
        if (prefs.preferOverlayInChampSelect) setOverlayVisible(true);
        else revealMainWindow();
    });

    lcu.on("end", () => {
        champSelectHandled = false;
        lcuStatusLabel = "Client League : connecté";
        const prefs = preferences?.get() ?? DEFAULT_PREFERENCES;
        if (prefs.preferOverlayInChampSelect && isOverlayVisible()) {
            setOverlayVisible(false);
        }
        renderTray();
    });

    // The watcher never throws; a failure is reported and life goes on.
    lcu.on("error", () => {
        lcuStatusLabel = "Client League : erreur de connexion";
        renderTray();
    });
}

function describeLcu(connected: boolean, phase: string | null, enabled: boolean): string {
    if (!enabled) return "Client League : désactivé";
    if (!connected) return "Client League : en attente";
    return phase ? `Client League : ${phase}` : "Client League : connecté";
}

// --------------------------------------------------------------------- tray ---

function renderTray(): void {
    if (!tray || !preferences) return;
    tray.render({
        windowVisible: Boolean(mainWindow && mainWindow.isVisible()),
        overlayVisible: isOverlayVisible(),
        preferences: preferences.get(),
        status: lcuStatusLabel,
    });
}

// ---------------------------------------------------------------------- IPC ---

/**
 * Every channel is `handle`-based, validates its argument and ignores calls
 * from web contents that are not one of our own windows.
 */
function registerIpc(): void {
    const fromOurWindow = (event: IpcMainInvokeEvent): BrowserWindow | null => {
        const window = BrowserWindow.fromWebContents(event.sender);
        if (!window) return null;
        if (window !== mainWindow && window !== overlayWindow) return null;
        return window;
    };

    ipcMain.handle(IPC.appInfo, (event): AppInfo => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return {
            appVersion: app.getVersion(),
            serverVersion: server?.version ?? "unknown",
            electronVersion: process.versions.electron ?? "",
            chromeVersion: process.versions.chrome ?? "",
            nodeVersion: process.versions.node,
            platform: process.platform,
            arch: process.arch,
            serverUrl: server?.url ?? "",
            dev: DEV,
            overlay: window !== null && window === overlayWindow,
        };
    });

    ipcMain.handle(IPC.openExternal, async (event, url: unknown) => {
        if (!fromOurWindow(event)) return false;
        if (!isExternalHttpsUrl(url)) return false;
        await shell.openExternal(url as string);
        return true;
    });

    ipcMain.handle(IPC.windowControl, (event, action: unknown) => {
        const window = fromOurWindow(event);
        if (!window) return;
        applyWindowAction(window, action);
    });

    ipcMain.handle(IPC.overlayControl, (event, action: unknown): OverlayState => {
        if (!fromOurWindow(event)) return { visible: isOverlayVisible() };
        switch (action as OverlayAction) {
            case "show":
                return setOverlayVisible(true);
            case "hide":
                return setOverlayVisible(false);
            case "toggle":
                return setOverlayVisible(!isOverlayVisible());
            default:
                return { visible: isOverlayVisible() };
        }
    });

    ipcMain.handle(IPC.preferencesGet, (): DesktopPreferences =>
        preferences?.get() ?? DEFAULT_PREFERENCES,
    );

    ipcMain.handle(IPC.preferencesSet, (event, patch: unknown): DesktopPreferences => {
        if (!fromOurWindow(event) || !preferences) {
            return preferences?.get() ?? DEFAULT_PREFERENCES;
        }
        // `set` sanitizes: unknown keys and non-booleans are dropped.
        return preferences.set((patch ?? {}) as Partial<DesktopPreferences>);
    });

    ipcMain.handle(
        IPC.updateStatus,
        (): UpdateStatus => updater?.getStatus() ?? disabledUpdateStatus(),
    );
    ipcMain.handle(IPC.updateCheck, (event): UpdateStatus => {
        if (!fromOurWindow(event)) return updater?.getStatus() ?? disabledUpdateStatus();
        return updater?.check() ?? disabledUpdateStatus();
    });
}

function applyWindowAction(window: BrowserWindow, action: unknown): void {
    switch (action as WindowAction) {
        case "minimize":
            window.minimize();
            break;
        case "maximize":
            window.maximize();
            break;
        case "unmaximize":
            window.unmaximize();
            break;
        case "toggle-maximize":
            if (window.isMaximized()) window.unmaximize();
            else window.maximize();
            break;
        case "hide":
            window.hide();
            break;
        case "close":
            window.close();
            break;
        default:
            break;
    }
}

function disabledUpdateStatus(): UpdateStatus {
    return {
        state: "disabled",
        currentVersion: app.getVersion(),
        nextVersion: null,
        message: null,
        checkedAt: null,
    };
}

function broadcast(channel: string, payload: unknown): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
}

/**
 * « Démarrer avec le client League ».
 *
 * Electron only implements login items on Windows and macOS. On Linux the
 * preference is remembered but has no effect; the UI reads the platform from
 * `getAppInfo()` and can say so.
 */
function applyLoginItem(enabled: boolean): void {
    if (process.platform !== "win32" && process.platform !== "darwin") return;
    if (!app.isPackaged) return; // a dev run must not register itself at login
    try {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            openAsHidden: true,
            args: ["--hidden"],
        });
    } catch {
        // Not fatal: the user can still start the app manually.
    }
}

// ----------------------------------------------------------------- lifecycle ---

// A tray app stays alive with no windows; macOS re-opens on dock click.
app.on("window-all-closed", () => {
    if (!preferences?.get().minimizeToTray && process.platform !== "darwin") {
        quitting = true;
        app.quit();
    }
});

app.on("activate", () => {
    revealMainWindow();
});

/** Graceful shutdown: close every socket and the Fastify server before exit. */
app.on("before-quit", (event) => {
    quitting = true;
    if (shuttingDown) return;
    shuttingDown = true;
    event.preventDefault();

    tray?.destroy();
    tray = null;

    const done = (): void => app.exit(0);
    const timeout = setTimeout(done, 5000);
    timeout.unref?.();

    void (server ? server.close() : Promise.resolve())
        .catch(() => undefined)
        .finally(() => {
            clearTimeout(timeout);
            done();
        });
});
