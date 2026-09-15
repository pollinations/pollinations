import { defineConfig } from "vitest/config";

// Its own config, not vite.config.js: that one loads the Cloudflare plugin and
// would boot a Worker for tests that only exercise plain modules.
export default defineConfig({
    test: { include: ["test/**/*.test.js"], environment: "node" },
});
