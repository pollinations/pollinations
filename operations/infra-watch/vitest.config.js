import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// The Worker's own tests run in the local Workers runtime, with the real
// Durable Object and its storage. Each test stubs the outbound calls.
export default defineConfig(async () => ({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
                bindings: {
                    TEST_MIGRATIONS: await readD1Migrations(
                        fileURLToPath(
                            new URL(
                                "../../enter.pollinations.ai/drizzle",
                                import.meta.url,
                            ),
                        ),
                    ),
                    DISCORD_WEBHOOK_URL:
                        "https://discord.test/api/webhooks/1/x",
                    COMMUNITY_WEBHOOK_URL:
                        "https://discord.test/api/webhooks/2/y",
                    POLLINATIONS_API_KEY: "test",
                    TINYBIRD_TOKEN: "test",
                },
            },
        }),
    ],
    test: { include: ["src/index.test.js"] },
}));
