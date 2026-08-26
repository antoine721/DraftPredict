import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Remembered geometry for a window. */
export type WindowBounds = {
    x?: number;
    y?: number;
    width: number;
    height: number;
    maximized?: boolean;
};

type State = Record<string, WindowBounds>;

/**
 * Window geometry, remembered between runs.
 *
 * Kept out of `PreferencesStore` on purpose: geometry is written on every
 * resize and is not part of the renderer contract. Like the preferences store,
 * it never throws — a bad file just means default geometry.
 */
export class WindowStateStore {
    private state: State;

    constructor(private readonly path: string) {
        this.state = read(path);
    }

    get(key: string, fallback: WindowBounds): WindowBounds {
        const saved = this.state[key];
        if (!saved) return { ...fallback };
        return {
            ...fallback,
            ...saved,
            width: Math.max(saved.width || fallback.width, 200),
            height: Math.max(saved.height || fallback.height, 120),
        };
    }

    save(key: string, bounds: WindowBounds): void {
        this.state = { ...this.state, [key]: bounds };
        try {
            mkdirSync(dirname(this.path), { recursive: true });
            const temp = `${this.path}.${process.pid}.tmp`;
            writeFileSync(temp, `${JSON.stringify(this.state, null, 4)}\n`, "utf8");
            renameSync(temp, this.path);
        } catch {
            // Geometry is a nicety, not a feature.
        }
    }
}

function read(path: string): State {
    if (!existsSync(path)) return {};
    try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
        return parsed && typeof parsed === "object" ? (parsed as State) : {};
    } catch {
        return {};
    }
}
