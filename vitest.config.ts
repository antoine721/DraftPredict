import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "tests/**/*.test.ts"],
        exclude: ["**/node_modules/**", "**/dist/**"],
        testTimeout: 30_000,
        environment: "node",
    },
    resolve: {
        alias: {
            "@draftpredict/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
            "@draftpredict/data": new URL("./packages/data/src/index.ts", import.meta.url).pathname,
            "@draftpredict/riot": new URL("./packages/riot/src/index.ts", import.meta.url).pathname,
            "@draftpredict/lcu": new URL("./packages/lcu/src/index.ts", import.meta.url).pathname,
        },
    },
});
