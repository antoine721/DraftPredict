import { Menu, Tray } from "electron";
import type { MenuItemConstructorOptions } from "electron";
import { trayIcon } from "./icons.js";
import type { DesktopPreferences } from "./bridge.js";

/**
 * The tray icon — the app's real home while a game is running.
 *
 * DraftPredict is meant to be launched once and forgotten: the window hides to
 * the tray, the League Client integration keeps watching, and champ select
 * brings the window (or the compact overlay) back. The menu is rebuilt on
 * every state change because Electron menus are immutable once assigned.
 */

export type TrayState = {
    windowVisible: boolean;
    overlayVisible: boolean;
    preferences: DesktopPreferences;
    /** One-line status, e.g. "Client League connecté — champ select". */
    status: string;
};

export type TrayHandlers = {
    toggleWindow(): void;
    toggleOverlay(): void;
    setPreference<K extends keyof DesktopPreferences>(
        key: K,
        value: DesktopPreferences[K],
    ): void;
    quit(): void;
};

export type TrayController = {
    tray: Tray;
    render(state: TrayState): void;
    destroy(): void;
};

export function createTray(handlers: TrayHandlers): TrayController {
    const tray = new Tray(trayIcon());
    tray.setToolTip("DraftPredict");

    // Left-click behaves like the "Afficher / Masquer" entry on Windows and
    // Linux; on macOS a click opens the menu, which is the platform norm.
    tray.on("click", () => {
        if (process.platform === "darwin") return;
        handlers.toggleWindow();
    });
    tray.on("double-click", () => handlers.toggleWindow());

    const render = (state: TrayState): void => {
        const template: MenuItemConstructorOptions[] = [
            { label: state.status, enabled: false },
            { type: "separator" },
            {
                label: state.windowVisible ? "Masquer" : "Afficher",
                click: () => handlers.toggleWindow(),
            },
            {
                label: "Aperçu compact (overlay)",
                type: "checkbox",
                checked: state.overlayVisible,
                click: () => handlers.toggleOverlay(),
            },
            { type: "separator" },
            {
                label: "Démarrer avec le client League",
                type: "checkbox",
                checked: state.preferences.startWithLeagueClient,
                click: (item) =>
                    handlers.setPreference("startWithLeagueClient", item.checked),
            },
            {
                label: "Afficher automatiquement en champ select",
                type: "checkbox",
                checked: state.preferences.autoShowOnChampSelect,
                click: (item) =>
                    handlers.setPreference("autoShowOnChampSelect", item.checked),
            },
            {
                label: "Utiliser l'aperçu compact en champ select",
                type: "checkbox",
                checked: state.preferences.preferOverlayInChampSelect,
                click: (item) =>
                    handlers.setPreference("preferOverlayInChampSelect", item.checked),
            },
            { type: "separator" },
            { label: "Quitter", click: () => handlers.quit() },
        ];
        tray.setContextMenu(Menu.buildFromTemplate(template));
    };

    return {
        tray,
        render,
        destroy: () => {
            if (!tray.isDestroyed()) tray.destroy();
        },
    };
}
