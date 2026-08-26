import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Finds `apps/web/dist`, so a single process can serve the API and the UI.
 *
 * The path is derived from this module's own URL rather than `process.cwd()`,
 * because the server is started from the repo root in development, from
 * `apps/server` by npm scripts, and from an Electron resources directory in
 * the packaged desktop app.
 */
export function findWebRoot(explicit?: string | null): string | null {
    if (explicit === null) return null;
    if (explicit) return existsSync(join(explicit, "index.html")) ? explicit : null;

    const fromEnv = process.env.DRAFTPREDICT_WEB_ROOT;
    if (fromEnv) {
        return existsSync(join(fromEnv, "index.html")) ? resolve(fromEnv) : null;
    }

    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
        const candidate = join(dir, "apps", "web", "dist");
        if (existsSync(join(candidate, "index.html"))) return candidate;

        const sibling = join(dir, "..", "web", "dist");
        if (existsSync(join(sibling, "index.html"))) return resolve(sibling);

        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}
