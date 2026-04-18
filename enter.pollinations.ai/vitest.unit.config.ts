import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Node-only vitest config for pure unit tests that don't need the
// Cloudflare Workers runtime (no D1/R2/KV access, no remote bindings).
// The full Workers test suite still runs via vitest.config.ts.
export default defineConfig({
    plugins: [tsconfigPaths()],
    resolve: {
        dedupe: ["zod"],
    },
    test: {
        pool: "forks",
        include: ["test/safety.test.ts"],
    },
});
