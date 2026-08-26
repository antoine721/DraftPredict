import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ConfigFileInput } from "./schema.js";
import { configFileSchema } from "./schema.js";

/**
 * Reads and writes `~/.draftpredict/config.json`.
 *
 * The file holds the Riot API key, so the directory is created 0700 and the
 * file 0600, and the write goes through a temporary file so a crash can never
 * leave a half-written config (or a world-readable one) behind.
 */

export const CONFIG_DIR_NAME = ".draftpredict";
export const CONFIG_FILE_NAME = "config.json";

export type ConfigStoreOptions = {
    /** Overrides the whole path. Mostly for tests. */
    file?: string;
    /** Overrides the directory; the file name stays `config.json`. */
    dir?: string;
    /** Home directory used to derive the default path. */
    home?: string;
};

export function defaultConfigPath(home = homedir()): string {
    return join(home, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export class ConfigStore {
    readonly path: string;

    constructor(options: ConfigStoreOptions = {}) {
        this.path =
            options.file ??
            (options.dir
                ? join(options.dir, CONFIG_FILE_NAME)
                : defaultConfigPath(options.home));
    }

    exists(): boolean {
        return existsSync(this.path);
    }

    /**
     * The stored settings, or `{}` when the file is missing, unreadable or
     * corrupt. A broken config must never stop the server from booting.
     */
    read(): ConfigFileInput {
        if (!existsSync(this.path)) return {};
        try {
            const raw = readFileSync(this.path, "utf8");
            const parsed: unknown = JSON.parse(raw);
            const result = configFileSchema.safeParse(parsed);
            return result.success ? result.data : {};
        } catch {
            return {};
        }
    }

    /** Merges `patch` into the stored settings and rewrites the file 0600. */
    write(patch: ConfigFileInput): ConfigFileInput {
        const next: ConfigFileInput = { ...this.read(), ...patch };
        for (const [key, value] of Object.entries(next)) {
            if (value === undefined) delete (next as Record<string, unknown>)[key];
        }

        const dir = dirname(this.path);
        mkdirSync(dir, { recursive: true, mode: 0o700 });

        const tmp = `${this.path}.${process.pid}.tmp`;
        writeFileSync(tmp, `${JSON.stringify(next, null, 4)}\n`, { mode: 0o600 });
        renameSync(tmp, this.path);
        // `rename` keeps the temp file's mode, but be explicit: a config that
        // predates this code may still be 0644.
        chmodSync(this.path, 0o600);

        return next;
    }
}
