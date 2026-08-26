import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigService, SERVER_VERSION, createApp } from "@draftpredict/server";
import type { ServerContext } from "@draftpredict/server";

/**
 * The DraftPredict server, running **inside** the Electron main process.
 *
 * The alternative — spawning `node dist/main.js` — would mean a second process
 * to supervise, a port to negotiate and an orphan to clean up after a crash.
 * `@draftpredict/server` exports `createApp` precisely so the shell can own the
 * Fastify instance directly: one process, one lifecycle, and the LCU events are
 * available in-process for the champ-select behaviour (see `main.ts`).
 */

export type EmbeddedServer = {
    /** Origin to load in the BrowserWindow, e.g. `http://127.0.0.1:4700`. */
    url: string;
    host: string;
    port: number;
    version: string;
    /** The server's service container — used for the LCU champ-select hook. */
    ctx: ServerContext;
    /** `true` when the configured port was taken and a free one was used. */
    fallbackPort: boolean;
    close(): Promise<void>;
};

export type StartServerOptions = {
    /** Overrides the configured port (tests / `DRAFTPREDICT_PORT`). */
    port?: number;
    host?: string;
    /** Directory holding the built web UI; `null` disables static serving. */
    webRoot?: string | null;
    /** Log level handed to Fastify's pino instance. */
    logLevel?: string;
};

const HOST = "127.0.0.1";

/** Boots the server and resolves once it is actually accepting connections. */
export async function startEmbeddedServer(
    options: StartServerOptions = {},
): Promise<EmbeddedServer> {
    const config = new ConfigService();
    const host = options.host ?? HOST;
    const webRoot = options.webRoot === undefined ? resolveWebRoot() : options.webRoot;

    const app = await createApp({
        config,
        webRoot,
        logger: { level: options.logLevel ?? process.env.LOG_LEVEL ?? "warn" },
    });

    const preferred =
        options.port ?? numeric(process.env.DRAFTPREDICT_PORT) ?? config.port();

    let port = preferred;
    let fallbackPort = false;
    try {
        await app.listen({ port: preferred, host });
    } catch (error: unknown) {
        if (!isAddressInUse(error)) {
            await app.close().catch(() => undefined);
            throw error;
        }
        // Something already holds the configured port — another DraftPredict
        // instance the single-instance lock did not catch (a stale process, or
        // the CLI server started by `npm run dev:server`). Take an ephemeral
        // port instead of refusing to start.
        fallbackPort = true;
        await app.listen({ port: 0, host });
    }

    const address = app.server.address();
    if (address && typeof address === "object") port = address.port;

    // Warm the provider chain so the first champ select does not wait on it.
    void app.ctx.dataset.getPair().catch(() => undefined);

    return {
        url: `http://${host}:${port}`,
        host,
        port,
        version: app.ctx.version || SERVER_VERSION,
        ctx: app.ctx,
        fallbackPort,
        close: async () => {
            await app.close();
        },
    };
}

/**
 * Finds the built web UI.
 *
 * Packaged, `apps/web/dist` is copied to `<resources>/app/web` by
 * electron-builder (see `electron-builder.yml`). In the repo it sits at
 * `apps/web/dist`. Paths are derived from this module's URL, never from
 * `process.cwd()` — the working directory of a packaged app is wherever the
 * user happened to double-click from.
 */
export function resolveWebRoot(): string | null {
    const fromEnv = process.env.DRAFTPREDICT_WEB_ROOT;
    if (fromEnv) return hasIndex(fromEnv) ? resolve(fromEnv) : null;

    const here = dirname(fileURLToPath(import.meta.url)); // <app>/dist
    // `process.resourcesPath` only exists under Electron; it points at the
    // packaged `resources/` directory, which is where electron-builder drops
    // the UI bundle (outside the asar archive, so Fastify serves plain files).
    const resources = (process as NodeJS.Process & { resourcesPath?: string })
        .resourcesPath;
    const candidates = [
        ...(resources ? [join(resources, "web")] : []),
        join(here, "..", "web"), // asar layout, if it ever moves inside
        join(here, "..", "..", "web", "dist"), // repo: apps/web/dist
    ];
    for (const candidate of candidates) {
        if (hasIndex(candidate)) return resolve(candidate);
    }
    return null;
}

function hasIndex(dir: string): boolean {
    try {
        return existsSync(join(dir, "index.html"));
    } catch {
        return false;
    }
}

function numeric(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535
        ? parsed
        : undefined;
}

function isAddressInUse(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "EADDRINUSE"
    );
}
