/**
 * `localStorage` that cannot throw.
 *
 * Private-mode Safari, a disabled-cookies policy, an Electron sandbox or a
 * quota error all turn a plain `localStorage.setItem` into an exception in the
 * middle of a render. Preferences are a convenience, never a reason to crash.
 */

const memory = new Map<string, string>();

function backend(): Storage | null {
    try {
        if (typeof globalThis.localStorage === "undefined") return null;
        const probe = "__dp_probe__";
        globalThis.localStorage.setItem(probe, "1");
        globalThis.localStorage.removeItem(probe);
        return globalThis.localStorage;
    } catch {
        return null;
    }
}

export const safeStorage = {
    getItem(key: string): string | null {
        const store = backend();
        if (!store) return memory.get(key) ?? null;
        try {
            return store.getItem(key);
        } catch {
            return memory.get(key) ?? null;
        }
    },
    setItem(key: string, value: string): void {
        memory.set(key, value);
        const store = backend();
        if (!store) return;
        try {
            store.setItem(key, value);
        } catch {
            // Quota or policy: the in-memory copy keeps the session working.
        }
    },
    removeItem(key: string): void {
        memory.delete(key);
        const store = backend();
        if (!store) return;
        try {
            store.removeItem(key);
        } catch {
            // Ignored on purpose.
        }
    },
};

/** Reads and parses JSON, falling back to `fallback` on anything unexpected. */
export function readJson<T>(key: string, fallback: T): T {
    const raw = safeStorage.getItem(key);
    if (raw === null) return fallback;
    try {
        const parsed = JSON.parse(raw) as T;
        return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
        return fallback;
    }
}

export function writeJson(key: string, value: unknown): void {
    try {
        safeStorage.setItem(key, JSON.stringify(value));
    } catch {
        // A value that cannot be serialised is simply not persisted.
    }
}
