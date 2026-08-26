import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Filesystem locations used by this package.
 *
 * Nothing here touches `process.cwd()`: the bundled Data Dragon snapshot is
 * found by walking up from this module's own URL, so the package works the
 * same whether it is imported from `src/` (vitest), `dist/` (node) or a
 * bundled app.
 */

/** Directory name (under the package root) holding the bundled assets. */
const ASSETS_DIR_NAME = "assets";

/** Marker the package root must contain for the walk-up to accept it. */
const ASSETS_MARKER = join(ASSETS_DIR_NAME, "ddragon");

let cachedPackageRoot: string | undefined;

/**
 * Absolute path of the `@draftpredict/data` package root — the directory that
 * contains `assets/ddragon`.
 */
export function getPackageRoot(): string {
    if (cachedPackageRoot) return cachedPackageRoot;

    let dir = dirname(fileURLToPath(import.meta.url));
    // src/util -> src -> package root, dist/util -> dist -> package root.
    // A couple of extra levels of slack costs nothing and survives re-layouts.
    for (let i = 0; i < 8; i++) {
        if (existsSync(join(dir, ASSETS_MARKER))) {
            cachedPackageRoot = dir;
            return dir;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    throw new Error(
        "@draftpredict/data: could not locate the bundled assets directory " +
            `(looked for "${ASSETS_MARKER}" above ${fileURLToPath(import.meta.url)})`,
    );
}

/** `<package root>/assets`. */
export function getAssetsDir(): string {
    return join(getPackageRoot(), ASSETS_DIR_NAME);
}

/** `<package root>/assets/ddragon`. */
export function getBundledDDragonRoot(): string {
    return join(getAssetsDir(), "ddragon");
}

/** Root of the per-user DraftPredict directory (`~/.draftpredict`). */
export function getUserDataDir(): string {
    const override = process.env.DRAFTPREDICT_HOME;
    if (override && override.trim().length > 0) return resolve(override);
    return join(homedir(), ".draftpredict");
}

/** Where downloaded Data Dragon patches are cached. */
export function getStaticCacheDir(): string {
    return join(getUserDataDir(), "static");
}

/** Where dataset payloads are cached on disk. */
export function getDatasetCacheDir(): string {
    return join(getUserDataDir(), "cache");
}

/** Creates `dir` (recursively) if it does not exist yet. */
export function ensureDir(dir: string): void {
    if (existsSync(dir)) return;
    mkdirSync(dir, { recursive: true });
}
