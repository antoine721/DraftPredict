/** Where a set of credentials was found. */
export type LcuCredentialSource = "env" | "lockfile" | "process";

/**
 * Everything needed to talk to a running League Client.
 *
 * The client writes these into its lockfile on startup and deletes the file on
 * exit, so a set of credentials is only valid for one run of the client: never
 * cache them across a disconnect, re-discover instead.
 */
export type LcuCredentials = {
    /** Loopback port the LCU's REST API listens on. Changes every launch. */
    port: number;
    /** Remoting auth token, used as the password of the `riot` basic-auth user. */
    password: string;
    /** Always `https` in practice; the lockfile is authoritative. */
    protocol: "https" | "http";
    /** Process id of the client, when the source could tell us. */
    pid?: number;
    /** Which discovery strategy produced this. */
    source: LcuCredentialSource;
    /** Absolute path of the lockfile, when the lockfile strategy produced this. */
    lockfilePath?: string;
};

/** The loopback host every LCU connection is pinned to. */
export const LCU_HOST = "127.0.0.1";

/** The single user name the LCU accepts for basic auth. */
export const LCU_USERNAME = "riot";

/** `riot:<password>`, base64-encoded, ready for an `Authorization` header. */
export function basicAuthHeader(password: string): string {
    return `Basic ${Buffer.from(`${LCU_USERNAME}:${password}`).toString("base64")}`;
}

/** `https://127.0.0.1:<port>` — the base of every LCU REST call. */
export function lcuBaseUrl(
    credentials: Pick<LcuCredentials, "port" | "protocol">,
): string {
    return `${credentials.protocol}://${LCU_HOST}:${credentials.port}`;
}

/** `wss://127.0.0.1:<port>` — the LCU event socket. */
export function lcuWebSocketUrl(
    credentials: Pick<LcuCredentials, "port" | "protocol">,
): string {
    const scheme = credentials.protocol === "http" ? "ws" : "wss";
    return `${scheme}://${LCU_HOST}:${credentials.port}`;
}
