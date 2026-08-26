import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import type { Dataset } from "@draftpredict/core";
import type { Logger } from "../util/logger.js";
import { silentLogger } from "../util/logger.js";
import type { DatasetParams, DatasetProvider } from "./types.js";
import { DatasetError } from "./types.js";
import { validateDataset } from "./validate.js";

const gunzipAsync = promisify(gunzip);

/**
 * Loads datasets that `apps/pipeline` wrote to disk.
 *
 * The pipeline lays files out as
 * `<root>/<window>/<patch>/<region>/<RANK>.json[.gz]`, and this provider walks
 * a list of candidate names so a hand-placed `PLATINUM_PLUS.json` works too.
 */
export type LocalFileProviderOptions = {
    /** Directory the pipeline writes into. */
    root?: string;
    /** Load exactly this file, ignoring the params entirely. */
    file?: string;
    /** Builds candidate paths (first match wins). Overrides the default layout. */
    resolvePaths?: (params: DatasetParams, root: string) => string[];
    logger?: Logger;
};

export class LocalFileProvider implements DatasetProvider {
    readonly name = "local-file";

    private readonly root: string | undefined;
    private readonly file: string | undefined;
    private readonly logger: Logger;
    private readonly resolvePathsImpl: (
        params: DatasetParams,
        root: string,
    ) => string[];

    constructor(options: LocalFileProviderOptions = {}) {
        this.root = options.root;
        this.file = options.file;
        this.logger = options.logger ?? silentLogger;
        this.resolvePathsImpl = options.resolvePaths ?? defaultResolvePaths;
    }

    describe(): string {
        return this.file
            ? `Local dataset file ${this.file}`
            : `Local datasets under ${this.root ?? "(no root configured)"}`;
    }

    /** Every path this provider would try, in order. */
    candidatePaths(params: DatasetParams): string[] {
        if (this.file) return [this.file];
        if (!this.root) return [];
        return this.resolvePathsImpl(params, this.root);
    }

    async available(): Promise<boolean> {
        if (this.file) return existsSync(this.file);
        return this.root !== undefined && existsSync(this.root);
    }

    async load(params: DatasetParams): Promise<Dataset> {
        const candidates = this.candidatePaths(params);
        if (candidates.length === 0) {
            throw new DatasetError(
                "unavailable",
                "No local dataset root or file configured",
                { provider: this.name },
            );
        }

        const path = candidates.find((candidate) => existsSync(candidate));
        if (!path) {
            throw new DatasetError(
                "not-found",
                `No local dataset found (looked for ${candidates.join(", ")})`,
                { provider: this.name },
            );
        }

        let buffer: Buffer;
        try {
            buffer = await readFile(path);
        } catch (error) {
            throw new DatasetError("io", `Could not read ${path}: ${describe(error)}`, {
                provider: this.name,
                cause: error,
            });
        }

        const raw = isGzip(buffer) ? await this.gunzip(buffer, path) : buffer;

        let json: unknown;
        try {
            json = JSON.parse(raw.toString("utf8"));
        } catch (error) {
            throw new DatasetError(
                "invalid-payload",
                `${path} is not valid JSON: ${describe(error)}`,
                { provider: this.name, cause: error },
            );
        }

        this.logger.debug(`dataset: loaded ${path}`);
        return validateDataset(json, { source: `${this.name} (${path})` });
    }

    private async gunzip(buffer: Buffer, path: string): Promise<Buffer> {
        try {
            return await gunzipAsync(buffer);
        } catch (error) {
            throw new DatasetError(
                "invalid-payload",
                `Could not decompress ${path}: ${describe(error)}`,
                { provider: this.name, cause: error },
            );
        }
    }
}

/** `<root>/<window>/<patch>/<region>/<RANK>.json[.gz]`, plus flatter fallbacks. */
export function defaultResolvePaths(params: DatasetParams, root: string): string[] {
    const window = params.window ?? "patch";
    const patch = params.patch ?? "latest";
    const names = [`${params.rank}.json.gz`, `${params.rank}.json`];

    const directories = [
        join(root, window, patch, params.region),
        join(root, window, params.region),
        join(root, window),
        join(root, params.region),
        root,
    ];

    return directories.flatMap((directory) =>
        names.map((name) => join(directory, name)),
    );
}

function isGzip(buffer: Buffer): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
