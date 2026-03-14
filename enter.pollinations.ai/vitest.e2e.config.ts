import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for e2e tests that run in Node.js (not Cloudflare Workers pool).
 * These tests use the official OpenAI SDK and hit a real server over HTTP.
 */
export default defineConfig({
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
            "@shared": resolve(__dirname, "../shared"),
        },
    },
    test: {
        include: ["test/e2e/**/*.test.ts"],
        testTimeout: 30_000,
    },
});
