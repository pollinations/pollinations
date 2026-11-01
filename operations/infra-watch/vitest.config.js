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
                    COMMUNITY_WEBHOOK_URL:
                        "https://discord.test/api/webhooks/2/y",
                    POLLINATIONS_API_KEY: "test",
                    TINYBIRD_TOKEN: "test",
                    COMMUNITY_PROBE_KEY: "probe-test",
                    COMMUNITY_AGENT_KEY: "agent-test",
                    OWNER_DISCORD_IDS: JSON.stringify({
                        o: "123456789012345678",
                    }),
                },
            },
        }),
    ],
    test: { include: ["src/index.test.js"] },
});
