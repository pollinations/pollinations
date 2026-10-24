import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
    plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
    test: { include: ["src/**/*.test.ts"] },
});
