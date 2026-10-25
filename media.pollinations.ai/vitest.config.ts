import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

export default defineConfig(async () => {
    const migrationsPath = path.join(
        __dirname,
        "../enter.pollinations.ai/drizzle",
    );
    const migrations = await readD1Migrations(migrationsPath);

    return {
        plugins: [
            cloudflareTest({
                wrangler: {
                    configPath: "./wrangler.toml",
                },
                miniflare: {
                    bindings: {
                        TEST_MIGRATIONS: migrations,
                    },
                },
            }),
        ],
        resolve: {
            alias: {
                "@shared": sharedSrc,
            },
        },
        test: {
            // Vitest's console interception can deadlock the Workers pool when a
            // handler logs during a file's last RPC (cloudflare/workers-sdk#15719).
            disableConsoleIntercept: true,
            setupFiles: ["./test/setup/apply-migrations.ts"],
        },
    };
});
