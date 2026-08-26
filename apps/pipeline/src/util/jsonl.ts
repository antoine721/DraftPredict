import { createWriteStream, existsSync, readdirSync, type WriteStream } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGzip, type Gzip } from "node:zlib";

import { ensureDir, openMaybeGzipped } from "./fs.js";

/**
 * Newline-delimited JSON shards.
 *
 * Raw matches are appended one JSON object per line and rotated into numbered
 * shards, which is what makes the collector restartable (a truncated last line
 * costs one match, never the run) and the aggregator streamable (shards are
 * read line by line and never fully materialised).
 */

export type ShardWriterOptions = {
    dir: string;
    /** File name prefix; files are `<prefix>-000123.jsonl[.gz]`. */
    prefix?: string;
    /** Rotate after this many lines. Default 5000. */
    maxLines?: number;
    /** Compress shards. Default `true`. */
    gzip?: boolean;
    /** First shard index — resumed from the collector state. */
    startIndex?: number;
    /**
     * Lines already written to `startIndex`. When non-zero the writer opens
     * that shard in append mode instead of truncating it.
     */
    startLines?: number;
};

export class JsonlShardWriter {
    readonly dir: string;
    readonly prefix: string;
    readonly maxLines: number;
    readonly gzip: boolean;

    private index: number;
    private linesInShard: number;
    private totalLines = 0;
    private bytes = 0;
    private file: WriteStream | undefined;
    private sink: WriteStream | Gzip | undefined;
    private currentPath: string | undefined;
    private readonly written: string[] = [];

    constructor(options: ShardWriterOptions) {
        this.dir = ensureDir(options.dir);
        this.prefix = options.prefix ?? "matches";
        this.maxLines = Math.max(1, options.maxLines ?? 5000);
        this.gzip = options.gzip ?? true;
        this.index = options.startIndex ?? 0;
        this.linesInShard = options.startLines ?? 0;
    }

    /** Shard index currently being written. */
    get shardIndex(): number {
        return this.index;
    }

    /** Lines written into the current shard, including a resumed count. */
    get shardLines(): number {
        return this.linesInShard;
    }

    /** Lines this writer appended in this process. */
    get lines(): number {
        return this.totalLines;
    }

    get bytesWritten(): number {
        return this.bytes;
    }

    /** Paths this writer has opened, in order. */
    get files(): readonly string[] {
        return this.written;
    }

    path(index = this.index): string {
        const name = `${this.prefix}-${String(index).padStart(6, "0")}.jsonl${
            this.gzip ? ".gz" : ""
        }`;
        return join(this.dir, name);
    }

    async write(value: unknown): Promise<void> {
        if (this.linesInShard >= this.maxLines && this.sink) {
            await this.close();
            this.index += 1;
            this.linesInShard = 0;
        }
        const sink = this.open();
        const line = `${JSON.stringify(value)}\n`;
        this.bytes += Buffer.byteLength(line);
        if (!sink.write(line)) await once(sink, "drain");
        this.linesInShard += 1;
        this.totalLines += 1;
    }

    private open(): WriteStream | Gzip {
        if (this.sink) return this.sink;
        const path = this.path();
        this.currentPath = path;
        this.written.push(path);
        // Appending keeps a resumed run from truncating the shard it stopped
        // in. Gzip members concatenate, and gunzip reads them back as one
        // stream, so appending to a `.gz` shard is safe.
        this.file = createWriteStream(path, { flags: this.linesInShard > 0 ? "a" : "w" });
        if (this.gzip) {
            const gzip = createGzip();
            gzip.pipe(this.file);
            this.sink = gzip;
        } else {
            this.sink = this.file;
        }
        return this.sink;
    }

    /** Flushes and closes the current shard. Safe to call twice. */
    async close(): Promise<void> {
        const sink = this.sink;
        const file = this.file;
        this.sink = undefined;
        this.file = undefined;
        this.currentPath = undefined;
        if (!sink) return;
        await new Promise<void>((resolve, reject) => {
            sink.end((): void => {
                resolve();
            });
            sink.once("error", reject);
        });
        if (file && file !== sink) {
            if (!file.closed) await once(file, "close").catch(() => undefined);
        }
    }

    /** Path of the shard currently open, if any. */
    get openPath(): string | undefined {
        return this.currentPath;
    }
}

/** Shard files in a directory, sorted so replay order matches write order. */
export function listShardFiles(dir: string, prefix = "matches"): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((name) => name.startsWith(`${prefix}-`) && name.includes(".jsonl"))
        .sort()
        .map((name) => join(dir, name));
}

export type JsonlLine<T> = {
    value: T;
    file: string;
    /** 1-based line number within the file. */
    line: number;
};

export type ReadJsonlOptions = {
    /** Called instead of throwing when a line is not valid JSON. */
    onError?: (error: Error, context: { file: string; line: number }) => void;
};

/** Streams one file, yielding parsed values. Never holds more than one line. */
export async function* readJsonlFile<T>(
    file: string,
    options: ReadJsonlOptions = {},
): AsyncGenerator<JsonlLine<T>> {
    const reader = createInterface({
        input: openMaybeGzipped(file),
        crlfDelay: Infinity,
    });
    let lineNumber = 0;
    try {
        for await (const raw of reader) {
            lineNumber += 1;
            const text = raw.trim();
            if (text.length === 0) continue;
            let value: T;
            try {
                value = JSON.parse(text) as T;
            } catch (error) {
                const failure =
                    error instanceof Error ? error : new Error(String(error));
                if (options.onError) {
                    options.onError(failure, { file, line: lineNumber });
                    continue;
                }
                throw new Error(`${file}:${lineNumber}: ${failure.message}`);
            }
            yield { value, file, line: lineNumber };
        }
    } finally {
        reader.close();
    }
}

/** Streams several files in order. */
export async function* readJsonlFiles<T>(
    files: readonly string[],
    options: ReadJsonlOptions = {},
): AsyncGenerator<JsonlLine<T>> {
    for (const file of files) {
        yield* readJsonlFile<T>(file, options);
    }
}
