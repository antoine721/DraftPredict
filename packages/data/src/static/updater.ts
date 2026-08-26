import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeJsonFileAtomic } from "../util/json.js";
import type { Logger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import { ensureDir, getStaticCacheDir } from "../util/paths.js";
import type { SnapshotMeta } from "./ddragon-raw.js";
import {
    clearStaticDataCache,
    compareVersions,
    listSnapshots,
    loadStaticData,
    resolveSnapshot,
    SNAPSHOT_FILES,
} from "./load.js";
import type { LoadStaticDataOptions } from "./load.js";
import type { StaticData } from "./types.js";
import { DDRAGON_BASE_URL, dataFileUrl, versionsUrl } from "./urls.js";

/**
 * Keeps the static data current by downloading newer Data Dragon patches into
 * `~/.draftpredict/static/<version>/`.
 *
 * Every operation fails soft. The dev container blocks
 * `ddragon.leagueoflegends.com` outright, and end-user machines go offline all
 * the time, so a failed update is logged and the bundled snapshot keeps being
 * used — it is never an error the caller has to handle.
 */

export type StaticDataFetch = (
    input: string,
    init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{
    ok: boolean;
    status: number;
    statusText?: string;
    text(): Promise<string>;
}>;

export type StaticDataUpdaterOptions = {
    /** Where downloaded patches are written. Default `~/.draftpredict/static`. */
    cacheDir?: string;
    /** Data Dragon origin. Overridable for tests and mirrors. */
    baseUrl?: string;
    /** Snapshot language. Default `en_US`. */
    language?: string;
    /** Per-request timeout in ms. Default 20000. */
    timeoutMs?: number;
    /** Injected for tests; defaults to the global `fetch`. */
    fetch?: StaticDataFetch;
    logger?: Logger;
    /** How many downloaded patches to keep. Default 2 (0 disables pruning). */
    keepVersions?: number;
};

export type UpdateResult =
    | { status: "updated"; version: string; directory: string }
    | { status: "up-to-date"; version: string }
    | { status: "failed"; reason: string; error?: unknown };

export class StaticDataUpdater {
    private readonly cacheDir: string;
    private readonly baseUrl: string;
    private readonly language: string;
    private readonly timeoutMs: number;
    private readonly logger: Logger;
    private readonly keepVersions: number;
    private readonly fetchImpl: StaticDataFetch | undefined;
    private inFlight: Promise<UpdateResult> | undefined;

    constructor(options: StaticDataUpdaterOptions = {}) {
        this.cacheDir = options.cacheDir ?? getStaticCacheDir();
        this.baseUrl = options.baseUrl ?? DDRAGON_BASE_URL;
        this.language = options.language ?? "en_US";
        this.timeoutMs = options.timeoutMs ?? 20_000;
        this.logger = options.logger ?? silentLogger;
        this.keepVersions = options.keepVersions ?? 2;
        this.fetchImpl = options.fetch;
    }

    /** Patch versions already downloaded, oldest first. */
    listCachedVersions(): string[] {
        return listSnapshots(this.cacheDir);
    }

    /**
     * The newest patch Data Dragon advertises, or `undefined` when the version
     * manifest cannot be reached.
     */
    async getLatestVersion(): Promise<string | undefined> {
        try {
            const versions = await this.fetchJson<string[]>(versionsUrl(this.baseUrl));
            const latest = versions?.[0];
            if (typeof latest !== "string" || latest.length === 0) {
                this.logger.warn("static data: version manifest was empty");
                return undefined;
            }
            return latest;
        } catch (error) {
            this.logger.warn(
                `static data: could not read the version manifest (${describe(error)})`,
            );
            return undefined;
        }
    }

    /**
     * Downloads `targetVersion` (default: the newest patch) unless it is
     * already available. Concurrent calls share one download.
     */
    async update(targetVersion?: string): Promise<UpdateResult> {
        if (this.inFlight) return this.inFlight;
        this.inFlight = this.runUpdate(targetVersion).finally(() => {
            this.inFlight = undefined;
        });
        return this.inFlight;
    }

    private async runUpdate(targetVersion?: string): Promise<UpdateResult> {
        const version = targetVersion ?? (await this.getLatestVersion());
        if (!version) {
            return { status: "failed", reason: "no-version" };
        }

        const currentVersion = this.currentVersion();
        if (currentVersion && compareVersions(version, currentVersion) <= 0) {
            this.logger.debug(`static data: already on patch ${currentVersion}`);
            return { status: "up-to-date", version: currentVersion };
        }

        const directory = join(this.cacheDir, version);
        try {
            const files = await this.downloadSnapshot(version);
            ensureDir(directory);
            for (const [name, payload] of files) {
                writeJsonFileAtomic(join(directory, name), payload);
            }
            const meta: SnapshotMeta = {
                version,
                language: this.language,
                source: this.baseUrl,
                fetchedAt: new Date().toISOString(),
            };
            writeJsonFileAtomic(join(directory, SNAPSHOT_FILES.meta), meta);

            clearStaticDataCache();
            this.prune(version);

            this.logger.info(`static data: downloaded patch ${version}`);
            return { status: "updated", version, directory };
        } catch (error) {
            // Leave a partial download behind? No: a half-written directory
            // would look like a valid snapshot to the loader.
            this.discard(directory);
            this.logger.warn(
                `static data: update to ${version} failed, keeping the bundled snapshot (${describe(error)})`,
            );
            return { status: "failed", reason: "download-failed", error };
        }
    }

    /**
     * Updates in the background and resolves with the freshest static data
     * available — never rejects.
     */
    async updateAndLoad(
        loadOptions: LoadStaticDataOptions = {},
    ): Promise<{ staticData: StaticData; update: UpdateResult }> {
        const update = await this.update();
        const staticData = loadStaticData({
            cacheDir: this.cacheDir,
            ...loadOptions,
        });
        return { staticData, update };
    }

    /** The newest patch available locally (downloaded or bundled). */
    currentVersion(): string {
        return resolveSnapshot({ cacheDir: this.cacheDir }, this.logger).version;
    }

    private async downloadSnapshot(version: string): Promise<[string, unknown][]> {
        const wanted: [string, string][] = [
            [SNAPSHOT_FILES.champions, SNAPSHOT_FILES.champions],
            [SNAPSHOT_FILES.items, SNAPSHOT_FILES.items],
            [SNAPSHOT_FILES.runes, SNAPSHOT_FILES.runes],
            [SNAPSHOT_FILES.summonerSpells, SNAPSHOT_FILES.summonerSpells],
        ];

        const downloaded = await Promise.all(
            wanted.map(async ([name, remoteFile]) => {
                const payload = await this.fetchJson<unknown>(
                    dataFileUrl(version, remoteFile, this.language, this.baseUrl),
                );
                if (payload === undefined || payload === null) {
                    throw new Error(`empty payload for ${remoteFile}`);
                }
                return [name, payload] as [string, unknown];
            }),
        );

        return downloaded;
    }

    private async fetchJson<T>(url: string): Promise<T> {
        const fetchImpl =
            this.fetchImpl ?? (globalThis.fetch as StaticDataFetch | undefined);
        if (!fetchImpl) throw new Error("no fetch implementation available");

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetchImpl(url, { signal: controller.signal });
            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}${
                        response.statusText ? ` ${response.statusText}` : ""
                    } for ${url}`,
                );
            }
            return JSON.parse(await response.text()) as T;
        } finally {
            clearTimeout(timer);
        }
    }

    /** Removes downloaded patches beyond `keepVersions`, newest kept. */
    private prune(keep: string): void {
        if (this.keepVersions <= 0) return;
        const versions = this.listCachedVersions().filter((v) => v !== keep);
        const excess = versions.slice(
            0,
            Math.max(0, versions.length - (this.keepVersions - 1)),
        );
        for (const version of excess) this.discard(join(this.cacheDir, version));
    }

    private discard(directory: string): void {
        if (!existsSync(directory)) return;
        try {
            rmSync(directory, { recursive: true, force: true });
        } catch (error) {
            this.logger.debug(
                `static data: could not remove ${directory} (${describe(error)})`,
            );
        }
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
