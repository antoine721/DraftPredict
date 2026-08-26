#!/usr/bin/env node
/**
 * Removes every build artefact in the monorepo.
 *
 * TypeScript's incremental marker now lives inside each project's output
 * directory, so deleting those directories is a genuine clean: nothing is left
 * behind that would make `tsc -b` believe a project is still up to date.
 */
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
    "packages/core/dist",
    "packages/data/dist",
    "packages/riot/dist",
    "packages/lcu/dist",
    "apps/server/dist",
    "apps/pipeline/dist",
    "apps/desktop/dist",
    "apps/desktop/release",
    "apps/web/dist",
    "apps/web/dist-types",
    "coverage",
];

for (const target of targets) {
    rmSync(join(root, target), { recursive: true, force: true });
}

console.log(`Cleaned ${targets.length} build directories.`);
