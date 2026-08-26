import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Pre-serialized, content-addressed JSON.
 *
 * The static catalogue only changes when the snapshot changes, so it is
 * serialized once and served as a string with a strong ETag; the champion
 * picker then revalidates with `If-None-Match` and gets a 304.
 */

export type CachedJson = {
    body: string;
    etag: string;
    bytes: number;
};

export function cacheJson(value: unknown): CachedJson {
    const body = JSON.stringify(value);
    const hash = createHash("sha1").update(body).digest("base64url").slice(0, 27);
    return { body, etag: `"${hash}"`, bytes: Buffer.byteLength(body) };
}

/** Lazily builds and memoizes a {@link CachedJson}. */
export function lazyJson(build: () => unknown): () => CachedJson {
    let cached: CachedJson | undefined;
    return () => (cached ??= cacheJson(build()));
}

export type SendCachedOptions = {
    /** `Cache-Control` max-age in seconds. Default one hour. */
    maxAgeSeconds?: number;
};

/** Sends a {@link CachedJson}, answering 304 when the client is up to date. */
export function sendCachedJson(
    request: FastifyRequest,
    reply: FastifyReply,
    cached: CachedJson,
    options: SendCachedOptions = {},
): FastifyReply {
    const maxAge = options.maxAgeSeconds ?? 3600;
    void reply.header("etag", cached.etag);
    void reply.header("cache-control", `public, max-age=${maxAge}, must-revalidate`);

    const ifNoneMatch = request.headers["if-none-match"];
    if (typeof ifNoneMatch === "string" && matchesEtag(ifNoneMatch, cached.etag)) {
        return reply.status(304).send();
    }

    void reply.header("content-type", "application/json; charset=utf-8");
    return reply.send(cached.body);
}

function matchesEtag(header: string, etag: string): boolean {
    return header
        .split(",")
        .map((part) => part.trim())
        .some((part) => part === etag || part === `W/${etag}` || part === "*");
}
