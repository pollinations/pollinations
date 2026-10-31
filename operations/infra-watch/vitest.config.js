import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The Worker's own tests run in the local Workers runtime, with the real
// Durable Object and its storage. Each test stubs the outbound calls.
export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
                bindings: {
                    DISCORD_WEBHOOK_URL:
                        "https://discord.test/api/webhooks/1/x",
                    POLLINATIONS_API_KEY: "test",
                    TINYBIRD_TOKEN: "test",
                },
            },
        }),
    ],
    test: { include: ["src/index.test.js"] },
});
