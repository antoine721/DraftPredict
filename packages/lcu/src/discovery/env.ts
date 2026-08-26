import type { LcuCredentials } from "../types.js";

/** Port override, e.g. for a fake LCU in tests or a remote-forwarded client. */
export const PORT_ENV = "DRAFTPREDICT_LCU_PORT";
/** Remoting auth token override; pairs with {@link PORT_ENV}. */
export const TOKEN_ENV = "DRAFTPREDICT_LCU_TOKEN";
/** Optional protocol override (`https` by default). */
export const PROTOCOL_ENV = "DRAFTPREDICT_LCU_PROTOCOL";

/**
 * Credentials from the environment.
 *
 * Both the port and the token must be set — half an override is a
 * configuration mistake, not a hint, so it is ignored rather than blended with
 * a discovered lockfile.
 */
export function credentialsFromEnv(
    env: Record<string, string | undefined>,
): LcuCredentials | null {
    const rawPort = env[PORT_ENV]?.trim();
    const token = env[TOKEN_ENV]?.trim();
    if (!rawPort || !token) return null;

    const port = Number.parseInt(rawPort, 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;

    const protocol = env[PROTOCOL_ENV]?.trim().toLowerCase();
    return {
        port,
        password: token,
        protocol: protocol === "http" ? "http" : "https",
        source: "env",
    };
}
