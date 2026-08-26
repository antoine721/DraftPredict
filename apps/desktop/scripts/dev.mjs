/* global process */
/**
 * `npm run dev -w @draftpredict/desktop`.
 *
 * Starts Electron with `DRAFTPREDICT_DEV=1`, which makes the shell load the
 * Vite dev server (http://localhost:5173) instead of the bundle served by the
 * embedded server. Written as a script rather than an inline env assignment so
 * it behaves identically in cmd.exe, PowerShell and a POSIX shell.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const electron = require("electron");
const root = dirname(dirname(fileURLToPath(import.meta.url)));

const child = spawn(electron, [root], {
    stdio: "inherit",
    env: {
        ...process.env,
        DRAFTPREDICT_DEV: "1",
        LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    },
});

child.on("close", (code) => process.exit(code ?? 0));
