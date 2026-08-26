import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: [
            "**/dist/**",
            "**/dist-types/**",
            "**/node_modules/**",
            "tests/reference/**",
            "packages/data/assets/**",
            "**/*.tsbuildinfo",
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        // Plain scripts are run directly by Node (build helpers, the smoke
        // test). typescript-eslint's presets do not declare runtime globals,
        // so declare the ones Node 20+ provides.
        files: ["**/*.mjs", "**/*.cjs", "scripts/**/*.js"],
        languageOptions: {
            globals: {
                AbortController: "readonly",
                Buffer: "readonly",
                URL: "readonly",
                URLSearchParams: "readonly",
                WebSocket: "readonly",
                clearInterval: "readonly",
                clearTimeout: "readonly",
                console: "readonly",
                fetch: "readonly",
                process: "readonly",
                setInterval: "readonly",
                setTimeout: "readonly",
                structuredClone: "readonly",
            },
        },
    },
    {
        rules: {
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
        },
    },
);
