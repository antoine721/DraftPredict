import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_PREFERENCES } from "./bridge.js";
import type { DesktopPreferences } from "./bridge.js";

/**
 * The shell's own preferences, stored next to Electron's `userData`
 * (`preferences.json`). Deliberately separate from the server configuration in
 * `~/.draftpredict/config.json`: that file holds the Riot API key and belongs
 * to the server, this one holds window/tray behaviour and belongs to the shell.
 *
 * The store never throws: a missing, unreadable or corrupt file simply yields
 * the defaults, because a broken preferences file must not stop the app from
 * starting.
 */
export class PreferencesStore {
    readonly path: string;

    private current: DesktopPreferences;
    private readonly listeners = new Set<(prefs: DesktopPreferences) => void>();

    constructor(path: string) {
        this.path = path;
        this.current = readPreferences(path);
    }

    get(): DesktopPreferences {
        return { ...this.current };
    }

    /** Applies a partial patch, ignoring unknown keys and wrong types. */
    set(patch: Partial<DesktopPreferences>): DesktopPreferences {
        const next = sanitize({ ...this.current, ...patch });
        const changed = (Object.keys(next) as (keyof DesktopPreferences)[]).some(
            (key) => next[key] !== this.current[key],
        );
        this.current = next;
        if (changed) {
            this.persist();
            for (const listener of this.listeners) listener(this.get());
        }
        return this.get();
    }

    onChange(listener: (prefs: DesktopPreferences) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private persist(): void {
        try {
            mkdirSync(dirname(this.path), { recursive: true });
            const temp = `${this.path}.${process.pid}.tmp`;
            writeFileSync(temp, `${JSON.stringify(this.current, null, 4)}\n`, "utf8");
            renameSync(temp, this.path);
        } catch {
            // Preferences are a convenience; losing them is not fatal.
        }
    }
}

/** Default location, given Electron's `userData` directory. */
export function preferencesPath(userData: string): string {
    return join(userData, "preferences.json");
}

function readPreferences(path: string): DesktopPreferences {
    if (!existsSync(path)) return { ...DEFAULT_PREFERENCES };
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFERENCES };
        return sanitize(parsed as Partial<DesktopPreferences>);
    } catch {
        return { ...DEFAULT_PREFERENCES };
    }
}

function sanitize(input: Partial<DesktopPreferences>): DesktopPreferences {
    const result = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof DesktopPreferences)[]) {
        const value = input[key];
        if (typeof value === "boolean") result[key] = value;
    }
    return result;
}
