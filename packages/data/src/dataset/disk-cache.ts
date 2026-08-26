import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
    parseJson,
    writeJsonFileAtomic,
    writeJsonFileAtomicAsync,
} from "../util/json.js";
import type { Logger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import { ensureDir, getDatasetCacheDir } from "../util/paths.js";

/**
 * The second cache tier: plain JSON files under `~/.draftpredict/cache/`.
 *
 * Every operation fails soft. A cache that cannot be written (read-only home
 * directory, full disk) must slow the app down, never break it.
 */
export type DiskCacheRecord<V> = {
    key: string;
    storedAt: number;
    expiresAt: number | null;
    value: V;
};

export type DiskCacheOptions = {
    dir?: string;
    /** Entry lifetime in ms. `0` disables expiry. */
    ttlMs?: number;
    logger?: Logger;
    now?: () => number;
};

export class DiskCache {
    readonly dir: string;
    private readonly ttlMs: number;
    private readonly logger: Logger;
    private readonly now: () => number;

    constructor(options: DiskCacheOptions = {}) {
        this.dir = options.dir ?? getDatasetCacheDir();
        this.ttlMs = options.ttlMs ?? 0;
        this.logger = options.logger ?? silentLogger;
        this.now = options.now ?? Date.now;
    }

    pathFor(key: string): string {
        return join(this.dir, `${sanitize(key)}.json`);
    }

    /** Reads an entry, or `undefined` when missing, unreadable or expired. */
    read<V>(
        key: string,
        options: { allowStale?: boolean } = {},
    ): DiskCacheRecord<V> | undefined {
        const path = this.pathFor(key);
        if (!existsSync(path)) return undefined;

        let record: DiskCacheRecord<V>;
        try {
            record = parseJson<DiskCacheRecord<V>>(readFileSync(path, "utf8"), path);
        } catch (error) {
            this.logger.debug(
                `cache: dropping unreadable entry ${path} (${describe(error)})`,
            );
            this.delete(key);
            return undefined;
        }

        return this.isFresh(record, options) ? record : undefined;
    }

    /**
     * Async twin of {@link DiskCache.write}. Datasets are large enough that
     * writing them synchronously would stall a server mid-request.
     */
    async writeAsync<V>(key: string, value: V, ttlMs = this.ttlMs): Promise<void> {
        try {
            ensureDir(this.dir);
            await writeJsonFileAtomicAsync(this.pathFor(key), this.record(key, value, ttlMs));
        } catch (error) {
            this.logger.warn(`cache: could not persist ${key} (${describe(error)})`);
        }
    }

    /** Async twin of {@link DiskCache.read}. */
    async readAsync<V>(
        key: string,
        options: { allowStale?: boolean } = {},
    ): Promise<DiskCacheRecord<V> | undefined> {
        const path = this.pathFor(key);
        if (!existsSync(path)) return undefined;

        let record: DiskCacheRecord<V>;
        try {
            record = parseJson<DiskCacheRecord<V>>(await readFile(path, "utf8"), path);
        } catch (error) {
            this.logger.debug(
                `cache: dropping unreadable entry ${path} (${describe(error)})`,
            );
            this.delete(key);
            return undefined;
        }

        return this.isFresh(record, options) ? record : undefined;
    }

    write<V>(key: string, value: V, ttlMs = this.ttlMs): void {
        try {
            ensureDir(this.dir);
            writeJsonFileAtomic(this.pathFor(key), this.record(key, value, ttlMs));
        } catch (error) {
            this.logger.warn(`cache: could not persist ${key} (${describe(error)})`);
        }
    }

    private record<V>(key: string, value: V, ttlMs: number): DiskCacheRecord<V> {
        const storedAt = this.now();
        return {
            key,
            storedAt,
            expiresAt: ttlMs > 0 && Number.isFinite(ttlMs) ? storedAt + ttlMs : null,
            value,
        };
    }

    private isFresh<V>(
        record: DiskCacheRecord<V>,
        options: { allowStale?: boolean },
    ): boolean {
        if (options.allowStale) return true;
        return record.expiresAt === null || record.expiresAt > this.now();
    }

    delete(key: string): void {
        const path = this.pathFor(key);
        try {
            if (existsSync(path)) rmSync(path, { force: true });
        } catch (error) {
            this.logger.debug(`cache: could not delete ${path} (${describe(error)})`);
        }
    }

    clear(): void {
        try {
            if (!existsSync(this.dir)) return;
            for (const name of readdirSync(this.dir)) {
                if (!name.endsWith(".json")) continue;
                rmSync(join(this.dir, name), { force: true });
            }
        } catch (error) {
            this.logger.debug(
                `cache: could not clear ${this.dir} (${describe(error)})`,
            );
        }
    }

    /** Total bytes currently held on disk, best effort. */
    sizeBytes(): number {
        try {
            if (!existsSync(this.dir)) return 0;
            return readdirSync(this.dir)
                .filter((name) => name.endsWith(".json"))
                .reduce((total, name) => {
                    try {
                        return total + statSync(join(this.dir, name)).size;
                    } catch {
                        return total;
                    }
                }, 0);
        } catch {
            return 0;
        }
    }
}

/** Keeps cache keys safe as file names without losing readability. */
function sanitize(key: string): string {
    return key.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
