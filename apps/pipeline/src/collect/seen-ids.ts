import { existsSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ensureDir } from "../util/fs.js";

/**
 * The set of match ids this collector has already dealt with, backed by an
 * append-only text file (one id per line).
 *
 * Append-only is deliberate: a `kill -9` in the middle of a run can lose at
 * most the ids still in the write buffer, and re-collecting a handful of
 * matches is free while re-collecting a whole region is not. Reloading the
 * file rebuilds the set exactly, which is what makes `collect` resumable.
 */
export class SeenIdSet {
    readonly path: string;

    private readonly ids = new Set<string>();
    private buffer: string[] = [];
    private readonly flushEvery: number;

    private constructor(path: string, flushEvery: number) {
        this.path = path;
        this.flushEvery = Math.max(1, flushEvery);
    }

    /** Loads the file when it exists; otherwise starts empty. */
    static async open(path: string, flushEvery = 64): Promise<SeenIdSet> {
        const set = new SeenIdSet(path, flushEvery);
        ensureDir(dirname(path));
        if (existsSync(path)) {
            const text = await readFile(path, "utf8");
            for (const line of text.split("\n")) {
                const id = line.trim();
                if (id.length > 0) set.ids.add(id);
            }
        }
        return set;
    }

    get size(): number {
        return this.ids.size;
    }

    has(id: string): boolean {
        return this.ids.has(id);
    }

    /** Records an id. Returns `false` when it was already known. */
    async add(id: string): Promise<boolean> {
        if (this.ids.has(id)) return false;
        this.ids.add(id);
        this.buffer.push(id);
        if (this.buffer.length >= this.flushEvery) await this.flush();
        return true;
    }

    async addMany(ids: Iterable<string>): Promise<number> {
        let added = 0;
        for (const id of ids) {
            if (await this.add(id)) added += 1;
        }
        return added;
    }

    /** Writes buffered ids to disk. */
    async flush(): Promise<void> {
        if (this.buffer.length === 0) return;
        const payload = `${this.buffer.join("\n")}\n`;
        this.buffer = [];
        await appendFile(this.path, payload, "utf8");
    }

    async close(): Promise<void> {
        await this.flush();
    }

    /** Snapshot of the ids, for tests and reports. */
    toArray(): string[] {
        return [...this.ids];
    }
}
