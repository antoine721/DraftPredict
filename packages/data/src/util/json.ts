import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ensureDir } from "./paths.js";

/** Reads and parses a JSON file. Throws with the path attached on failure. */
export function readJsonFile<T>(path: string): T {
    let raw: string;
    try {
        raw = readFileSync(path, "utf8");
    } catch (error) {
        throw new Error(`Could not read ${path}: ${describe(error)}`, {
            cause: error,
        });
    }
    return parseJson<T>(raw, path);
}

/** Parses JSON, reporting the source in the error message. */
export function parseJson<T>(raw: string, source = "<string>"): T {
    try {
        return JSON.parse(raw) as T;
    } catch (error) {
        throw new Error(`Could not parse JSON from ${source}: ${describe(error)}`, {
            cause: error,
        });
    }
}

/**
 * Writes JSON atomically: the payload lands in a sibling temp file that is
 * then renamed, so a crash mid-write can never leave a half-written cache
 * entry behind.
 */
export function writeJsonFileAtomic(path: string, value: unknown): void {
    ensureDir(dirname(path));
    const temp = join(
        dirname(path),
        `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.tmp`,
    );
    writeFileSync(temp, JSON.stringify(value), "utf8");
    renameSync(temp, path);
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Async twin of {@link writeJsonFileAtomic}.
 *
 * Dataset payloads run to tens of megabytes; serializing them on the event
 * loop is unavoidable, but writing them out need not be, so the server keeps
 * answering requests while a cache entry lands.
 */
export async function writeJsonFileAtomicAsync(
    path: string,
    value: unknown,
): Promise<void> {
    ensureDir(dirname(path));
    const temp = join(
        dirname(path),
        `.${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.tmp`,
    );
    await writeFile(temp, JSON.stringify(value), "utf8");
    await rename(temp, path);
}

/** Async twin of {@link readJsonFile}. */
export async function readJsonFileAsync<T>(path: string): Promise<T> {
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch (error) {
        throw new Error(`Could not read ${path}: ${describe(error)}`, { cause: error });
    }
    return parseJson<T>(raw, path);
}
