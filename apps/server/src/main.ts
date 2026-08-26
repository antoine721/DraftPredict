import { createApp } from "./app.js";
import { ConfigService } from "./config/service.js";

/**
 * Production entry point.
 *
 * Wires the real services, warms the dataset so the first champion select does
 * not pay for the download, and shuts down cleanly: the League Client watcher
 * is stopped and every WebSocket is closed before the process exits.
 */
async function main(): Promise<void> {
    const config = new ConfigService();
    const app = await createApp({ config });

    const port = config.port();
    const host = process.env.HOST ?? "127.0.0.1";

    // Warm the provider chain in the background: a cold start that has to
    // download a dataset would otherwise block the first analysis request.
    void app.ctx.dataset
        .getPair()
        .then(({ meta }) => {
            app.log.info(
                { provider: meta.provider, date: meta.date, offline: meta.offline },
                meta.offline
                    ? "serving the offline demo dataset"
                    : "dataset ready",
            );
        })
        .catch((error: unknown) => {
            app.log.error({ err: error }, "could not preload a dataset");
        });

    let closing = false;
    const shutdown = (signal: string): void => {
        if (closing) return;
        closing = true;
        app.log.info({ signal }, "shutting down");
        void app
            .close()
            .then(() => process.exit(0))
            .catch((error: unknown) => {
                app.log.error({ err: error }, "shutdown failed");
                process.exit(1);
            });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    await app.listen({ port, host });
    app.log.info(
        {
            port,
            host,
            web: app.ctx.webRoot ?? "not served",
            riotKey: config.hasRiotApiKey() ? "configured" : "missing",
            lcu: app.ctx.lcu.isEnabled() ? "enabled" : "disabled",
        },
        "DraftPredict server listening",
    );
}

main().catch((error: unknown) => {
    console.error("Failed to start the DraftPredict server:", error);
    process.exitCode = 1;
});
