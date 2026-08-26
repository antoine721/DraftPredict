import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IPC } from "../bridge.js";

/**
 * `preload.ts` cannot import `bridge.ts` at runtime: the compiled file is
 * copied to `preload.mjs` (Electron's requirement for ES-module preloads) and
 * a relative specifier would not resolve from there. The channel names are
 * therefore literals in both files, and this test is what keeps them honest.
 */
const preload = readFileSync(
    fileURLToPath(new URL("../preload.ts", import.meta.url)),
    "utf8",
);

describe("preload", () => {
    it("uses exactly the channels declared in bridge.ts", () => {
        const used = new Set(
            [...preload.matchAll(/"(draftpredict:[a-z-]+)"/g)].map((match) => match[1]),
        );
        const declared = new Set(Object.values(IPC));

        // Events the main process only sends are not necessarily consumed here,
        // but nothing may reference a channel that does not exist.
        for (const channel of used) expect(declared).toContain(channel);
        // ...and every channel the renderer needs must be wired up.
        for (const channel of declared) expect(used).toContain(channel);
    });

    it("exposes no generic IPC escape hatch", () => {
        expect(preload).not.toMatch(/exposeInMainWorld\(\s*"draftpredict",\s*ipcRenderer/);
        expect(preload).not.toMatch(/\bnodeRequire\b|require\(/);
        expect(preload).not.toMatch(/from "node:(fs|child_process)"/);
        // A single, fixed bridge object.
        expect(preload.match(/exposeInMainWorld/g)).toHaveLength(1);
    });

    it("imports nothing but electron at runtime", () => {
        const runtimeImports = [
            ...preload.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gm),
        ].map((match) => match[1]);
        expect(runtimeImports).toEqual(["electron"]);
    });
});
