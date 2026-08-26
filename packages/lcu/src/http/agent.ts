import { Agent } from "node:https";
import { LcuError } from "../errors.js";

/**
 * TLS for the League Client's local API.
 *
 * The LCU serves its REST API over HTTPS using a **self-signed certificate**
 * that no trust store knows about, so a normal Node request fails with
 * `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `SELF_SIGNED_CERT_IN_CHAIN`. The only way
 * to talk to it is to stop verifying that certificate.
 *
 * Doing that safely is a matter of scope, so this package is strict about it:
 *
 * - `rejectUnauthorized: false` lives on **one dedicated `https.Agent`**,
 *   created per {@link LcuClient} and attached to that client's requests only.
 *   `https.globalAgent` is never touched and `NODE_TLS_REJECT_UNAUTHORIZED` is
 *   never set — no other host in the process loses verification.
 * - Every request is pinned to a loopback address ({@link assertLoopbackHost}),
 *   so the agent cannot be pointed at a remote host even by accident. The bytes
 *   never leave the machine, which removes the network attacker the
 *   certificate check is there to stop.
 * - Requests still carry the `riot:<token>` basic-auth header. The token is
 *   regenerated on every client launch and is known only to processes that can
 *   already read the lockfile (or the process list) of this user — so an
 *   impostor listening on the port learns nothing it did not already have.
 *
 * Any future need for a verified connection would use Riot's published
 * `riotgames.pem` root as the agent's `ca`; that is the only knob that should
 * change here.
 */

/** Hosts this package is willing to talk to. */
export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set([
    "127.0.0.1",
    "localhost",
    "::1",
    "[::1]",
    "0:0:0:0:0:0:0:1",
]);

/** True for the loopback addresses the League Client binds to. */
export function isLoopbackHost(host: string): boolean {
    const normalized = host.trim().toLowerCase();
    if (LOOPBACK_HOSTS.has(normalized)) return true;
    // The whole 127.0.0.0/8 block is loopback.
    return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

/** Guard used before any request; the caller cannot opt out of it. */
export function assertLoopbackHost(host: string): void {
    if (isLoopbackHost(host)) return;
    throw new LcuError(
        `refusing to talk to "${host}": the LCU client only connects to ` +
            `loopback addresses, because that is what makes accepting its ` +
            `self-signed certificate safe`,
    );
}

export type LcuAgentOptions = {
    keepAlive?: boolean;
    maxSockets?: number;
    /** Milliseconds an idle keep-alive socket is kept. */
    keepAliveMsecs?: number;
};

/**
 * Creates the one agent that accepts the LCU's self-signed certificate.
 *
 * Keep-alive is on: champ select polls the same few endpoints several times a
 * second and a fresh TLS handshake per call is pure latency.
 */
export function createLcuAgent(options: LcuAgentOptions = {}): Agent {
    return new Agent({
        // Safe here, and only here — see the module comment above.
        rejectUnauthorized: false,
        keepAlive: options.keepAlive ?? true,
        keepAliveMsecs: options.keepAliveMsecs ?? 10_000,
        maxSockets: options.maxSockets ?? 8,
    });
}
