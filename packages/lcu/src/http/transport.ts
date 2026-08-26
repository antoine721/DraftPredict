import { request as httpRequest } from "node:http";
import { request as httpsRequest, type Agent } from "node:https";
import { LcuConnectionError, LcuTimeoutError, errorCodeOf } from "../errors.js";
import { LCU_HOST } from "../types.js";
import { assertLoopbackHost, createLcuAgent } from "./agent.js";

/** One request, already serialized. */
export type LcuHttpRequest = {
    method: string;
    /** Absolute path starting with `/`, e.g. `/lol-summoner/v1/current-summoner`. */
    path: string;
    headers: Record<string, string>;
    /** Serialized JSON body, when there is one. */
    body?: string;
    timeoutMs: number;
    signal?: AbortSignal;
};

export type LcuHttpResponse = {
    status: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
};

/**
 * The seam every LCU call goes through.
 *
 * `LcuClient` only ever sees this function, so tests hand it a plain async
 * function and never open a socket.
 */
export type LcuTransport = (request: LcuHttpRequest) => Promise<LcuHttpResponse>;

export type NodeTransportOptions = {
    port: number;
    protocol: "https" | "http";
    /** Defaults to `127.0.0.1`; must stay a loopback address. */
    host?: string;
    /** Shared agent; one is created when omitted. */
    agent?: Agent;
};

/**
 * The real transport: `node:https` (or `node:http`) against loopback.
 *
 * The agent is created once per transport and reused for every call, which is
 * what keeps `rejectUnauthorized: false` scoped to this one client.
 */
export function createNodeTransport(options: NodeTransportOptions): LcuTransport {
    const host = options.host ?? LCU_HOST;
    assertLoopbackHost(host);

    const secure = options.protocol !== "http";
    const agent = secure ? (options.agent ?? createLcuAgent()) : undefined;
    const send = secure ? httpsRequest : httpRequest;

    return (spec) =>
        new Promise<LcuHttpResponse>((resolve, reject) => {
            if (spec.signal?.aborted) {
                reject(new LcuConnectionError("request aborted before it was sent"));
                return;
            }

            let settled = false;
            const req = send(
                {
                    host,
                    port: options.port,
                    path: spec.path,
                    method: spec.method,
                    headers: spec.headers,
                    ...(agent ? { agent } : {}),
                },
                (res) => {
                    const chunks: Buffer[] = [];
                    res.on("data", (chunk: Buffer) => chunks.push(chunk));
                    res.on("end", () => {
                        if (settled) return;
                        settled = true;
                        cleanup();
                        resolve({
                            status: res.statusCode ?? 0,
                            headers: res.headers,
                            body: Buffer.concat(chunks).toString("utf8"),
                        });
                    });
                    res.on("error", fail);
                },
            );

            const onAbort = () => {
                req.destroy();
                fail(new LcuConnectionError("request aborted"));
            };

            function cleanup() {
                spec.signal?.removeEventListener("abort", onAbort);
            }

            function fail(error: unknown) {
                if (settled) return;
                settled = true;
                cleanup();
                if (error instanceof LcuConnectionError) {
                    reject(error);
                    return;
                }
                const code = errorCodeOf(error);
                reject(
                    new LcuConnectionError(
                        `LCU ${spec.method} ${spec.path} failed` +
                            (code ? ` (${code})` : ""),
                        { cause: error, ...(code ? { code } : {}) },
                    ),
                );
            }

            if (spec.timeoutMs > 0) {
                req.setTimeout(spec.timeoutMs, () => {
                    req.destroy();
                    if (settled) return;
                    settled = true;
                    cleanup();
                    reject(new LcuTimeoutError(spec.timeoutMs, spec.method, spec.path));
                });
            }

            spec.signal?.addEventListener("abort", onAbort, { once: true });
            req.on("error", fail);
            if (spec.body !== undefined) req.write(spec.body);
            req.end();
        });
}
