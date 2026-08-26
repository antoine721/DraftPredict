import { EventEmitter } from "node:events";
import { app, autoUpdater } from "electron";
import type { UpdateStatus } from "./bridge.js";

/**
 * Auto-update status, exposed read-only to the UI.
 *
 * DraftPredict ships **no update feed by default**: the shell must not phone
 * home to an endpoint nobody configured, and the container this was written in
 * could not reach one anyway. The controller therefore reports `disabled`
 * unless `DRAFTPREDICT_UPDATE_FEED` names an `https://` feed, in which case
 * Electron's built-in `autoUpdater` (Squirrel on Windows, ServerToServer on
 * macOS) is wired to it. Linux packages update through the distribution
 * channel they came from (AppImage), so the updater stays disabled there.
 *
 * Nothing here can install anything on its own: `quitAndInstall` is only
 * called from the explicit menu entry in `main.ts`.
 */
export class UpdaterController extends EventEmitter {
    private status: UpdateStatus;
    private wired = false;

    constructor(private readonly currentVersion: string) {
        super();
        this.status = {
            state: "disabled",
            currentVersion,
            nextVersion: null,
            message: "Aucun canal de mise à jour configuré.",
            checkedAt: null,
        };
    }

    getStatus(): UpdateStatus {
        return { ...this.status };
    }

    /** Wires the feed when there is one. Safe to call once, at startup. */
    initialize(): void {
        if (this.wired) return;
        this.wired = true;

        const feed = feedUrl();
        if (!feed || process.platform === "linux" || !app.isPackaged) {
            this.update({
                state: "disabled",
                message: !feed
                    ? "Aucun canal de mise à jour configuré."
                    : process.platform === "linux"
                      ? "Les mises à jour AppImage passent par votre gestionnaire de paquets."
                      : "Mises à jour désactivées en développement.",
            });
            return;
        }

        try {
            autoUpdater.setFeedURL({ url: feed });
        } catch (error: unknown) {
            this.update({ state: "error", message: describe(error) });
            return;
        }

        autoUpdater.on("checking-for-update", () => {
            this.update({ state: "checking", message: null });
        });
        autoUpdater.on("update-available", () => {
            this.update({ state: "downloading", message: "Téléchargement en cours…" });
        });
        autoUpdater.on("update-not-available", () => {
            this.update({
                state: "idle",
                message: "DraftPredict est à jour.",
                checkedAt: Date.now(),
            });
        });
        autoUpdater.on("update-downloaded", (_event, _notes, name: string) => {
            this.update({
                state: "downloaded",
                nextVersion: typeof name === "string" ? name : null,
                message: "Redémarrez pour installer la mise à jour.",
                checkedAt: Date.now(),
            });
        });
        autoUpdater.on("error", (error: Error) => {
            this.update({ state: "error", message: describe(error) });
        });

        this.update({ state: "idle", message: null });
    }

    /** Triggers a check; a no-op (and honest about it) when disabled. */
    check(): UpdateStatus {
        if (this.status.state === "disabled") return this.getStatus();
        try {
            autoUpdater.checkForUpdates();
            this.update({ state: "checking", message: null });
        } catch (error: unknown) {
            this.update({ state: "error", message: describe(error) });
        }
        return this.getStatus();
    }

    /** `true` when an update is staged and the app may restart into it. */
    canInstall(): boolean {
        return this.status.state === "downloaded";
    }

    install(): void {
        if (!this.canInstall()) return;
        autoUpdater.quitAndInstall();
    }

    private update(patch: Partial<UpdateStatus>): void {
        this.status = { ...this.status, ...patch, currentVersion: this.currentVersion };
        this.emit("status", this.getStatus());
    }
}

function feedUrl(): string | null {
    const raw = process.env.DRAFTPREDICT_UPDATE_FEED;
    if (!raw) return null;
    try {
        const url = new URL(raw);
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    // Never leak a signed feed URL (they can carry a token in the query).
    return message.replace(/https?:\/\/\S+/g, "<url>").slice(0, 300);
}
