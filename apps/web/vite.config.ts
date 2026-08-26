import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The dev server proxies `/api` and `/ws` to the Fastify backend so the app is
 * always same-origin: in development through this proxy, in production because
 * `apps/server` serves `dist/` itself. No `VITE_API_URL`, no CORS surprises.
 */
const BACKEND = process.env.DRAFTPREDICT_SERVER_URL ?? "http://localhost:4700";

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
    server: {
        port: 5173,
        host: "127.0.0.1",
        proxy: {
            "/api": { target: BACKEND, changeOrigin: true },
            "/ws": { target: BACKEND, ws: true, changeOrigin: true },
        },
    },
    preview: { port: 4173 },
    build: {
        outDir: "dist",
        sourcemap: true,
        chunkSizeWarningLimit: 1500,
    },
});
