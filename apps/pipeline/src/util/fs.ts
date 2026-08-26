import { createReadStream, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createGunzip, gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/** Creates `dir` (recursively) when it does not exist yet. */
export function ensureDir(dir: string): string {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
}

/**
 * Writes a file through a temporary name and renames it into place, so an
 * interrupted run never leaves a half-written dataset or state file behind.
 */
export async function writeFileAtomic(
    path: string,
    data: string | Uint8Array,
): Promise<void> {
    ensureDir(dirname(path));
    const temporary = `${path}.tmp-${process.pid}`;
    await writeFile(temporary, data);
    try {
        renameSync(temporary, path);
    } catch (error) {
        await rm(temporary, { force: true });
        throw error;
    }
}

export type WriteJsonOptions = {
    /** Gzip the payload. Inferred from a `.gz` suffix when omitted. */
    gzip?: boolean;
    /** Indent the JSON. Never do this for a real dataset — it doubles the size. */
    pretty?: boolean;
};

/** Writes JSON (optionally gzipped) atomically. Returns the bytes written. */
export async function writeJsonFile(
    path: string,
    value: unknown,
    options: WriteJsonOptions = {},
): Promise<number> {
    const compress = options.gzip ?? path.endsWith(".gz");
    const json = options.pretty ? JSON.stringify(value, null, 4) : JSON.stringify(value);
    const payload = compress
        ? await gzipAsync(Buffer.from(json, "utf8"), { level: 9 })
        : Buffer.from(json, "utf8");
    await writeFileAtomic(path, payload);
    return payload.byteLength;
}

/** Reads JSON from a plain or gzipped file (detected by magic bytes). */
export async function readJsonFile<T>(path: string): Promise<T> {
    const buffer = await readFile(path);
    const raw = isGzip(buffer) ? await gunzipAsync(buffer) : buffer;
    return JSON.parse(raw.toString("utf8")) as T;
}

export function isGzip(buffer: Uint8Array): boolean {
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
}

/** A readable stream over a file, transparently gunzipped when needed. */
export function openMaybeGzipped(path: string): NodeJS.ReadableStream {
    const stream = createReadStream(path);
    return path.endsWith(".gz") ? stream.pipe(createGunzip()) : stream;
}

export function fileSize(path: string): number {
    try {
        return statSync(path).size;
    } catch {
        return 0;
    }
}

/** Human-readable byte count, for log lines and reports. */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes)) return "?";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`;
}

/** `<root>/<window>/<patch>/<region>/<RANK>.json.gz` — the layout `LocalFileProvider` reads. */
export function datasetOutputPath(args: {
    root: string;
    window: string;
    patch: string;
    region: string;
    rank: string;
    gzip?: boolean;
}): string {
    const name = `${args.rank}.json${args.gzip === false ? "" : ".gz"}`;
    return join(args.root, args.window, args.patch, args.region, name);
}
