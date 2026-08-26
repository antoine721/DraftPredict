/* global console, process */
/**
 * Post-build step: produce `dist/preload.mjs`.
 *
 * Electron only loads an ES-module preload script when the file has the `.mjs`
 * extension, and `tsc` cannot be told to emit one. The compiled preload is
 * therefore copied. It must stay self-contained (its only import is
 * `electron`), otherwise the copy would carry a relative specifier that no
 * longer resolves — this script checks that and fails the build if it does.
 */
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "dist", "preload.js");
const target = join(root, "dist", "preload.mjs");

if (!existsSync(source)) {
    console.error(`[desktop] ${source} is missing — did \`tsc -b\` run?`);
    process.exit(1);
}

const code = readFileSync(source, "utf8");
const relative = [...code.matchAll(/(?:import|export)[^;]*?from\s+["'](\.[^"']+)["']/g)];
if (relative.length > 0) {
    console.error(
        "[desktop] preload.ts must not have runtime relative imports; found: " +
            relative.map((match) => match[1]).join(", "),
    );
    process.exit(1);
}

copyFileSync(source, target);
console.log("[desktop] wrote dist/preload.mjs");
