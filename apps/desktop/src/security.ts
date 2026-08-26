/**
 * URL policy for the shell.
 *
 * Two questions, both answered here so they can be tested without Electron:
 *
 *  - may this URL be handed to the OS browser? (`https://` only, no
 *    credentials, no `localhost` — an external link is external)
 *  - may this window navigate there? (only the pages we serve ourselves)
 */

/** Parses without throwing. */
export function parseUrl(value: unknown): URL | null {
    if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
        return null;
    }
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

/**
 * `true` when the URL is safe to open in the user's browser.
 *
 * `https:` only. `http:`, `file:`, `javascript:`, `data:` and every custom
 * scheme (`ms-settings:`, `smb:`, …) are refused, and so is anything carrying
 * embedded credentials.
 */
export function isExternalHttpsUrl(value: unknown): boolean {
    const url = parseUrl(value);
    if (!url) return false;
    if (url.protocol !== "https:") return false;
    if (url.username !== "" || url.password !== "") return false;
    if (url.hostname === "") return false;
    return true;
}

/** Origins the shell is allowed to navigate to: its own server and Vite. */
export function internalOrigins(serverUrl: string, dev: boolean): string[] {
    const origins = new Set<string>();
    const server = parseUrl(serverUrl);
    if (server) {
        origins.add(server.origin);
        // 127.0.0.1 and localhost are the same server, different spelling.
        if (server.hostname === "127.0.0.1") {
            origins.add(`${server.protocol}//localhost:${server.port}`);
        }
        if (server.hostname === "localhost") {
            origins.add(`${server.protocol}//127.0.0.1:${server.port}`);
        }
    }
    if (dev) {
        for (const port of [5173, 5174, 4173]) {
            origins.add(`http://localhost:${port}`);
            origins.add(`http://127.0.0.1:${port}`);
        }
    }
    return [...origins];
}

/** `true` when a navigation target stays inside the app. */
export function isInternalUrl(value: unknown, allowed: string[]): boolean {
    const url = parseUrl(value);
    if (!url) return false;
    // The packaged UI and the overlay are loaded from disk.
    if (url.protocol === "file:") return true;
    return allowed.includes(url.origin);
}
