import path from "node:path";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { loadEnv } from "vite";
import { configDefaults } from "vitest/config";
import viteConfig from "./vite.config";

const generationRouteTests = [
    "test/deduplication.test.ts",
    "test/rate-limit.test.ts",
    "test/integration/api-keys.test.ts",
    "test/integration/audio.test.ts",
    "test/integration/error-observability.test.ts",
    "test/integration/image.test.ts",
    "test/integration/public-endpoints.test.ts",
    "test/integration/text-cache.test.ts",
    "test/integration/text.test.ts",
    "test/integration/tier-balance.test.ts",
    "test/integration/video.test.ts",
];

export default defineWorkersConfig(async ({ mode }) => {
    const migrationsPath = path.join(__dirname, "drizzle");
    const migrations = await readD1Migrations(migrationsPath);
    const env = loadEnv(mode, process.cwd(), "");

    return {
        ...viteConfig,
        test: {
            globalSetup: ["./test/setup/snapshot-server.ts"],
            setupFiles: [
                "./test/setup/apply-migrations.ts",
                "./test/setup/rejection-handler.ts",
            ],
            exclude: [
                ...configDefaults.exclude,
                "test/e2e/**",
                ...generationRouteTests,
            ],
            reporters: ["default"],
            teardownTimeout: 5000,
            poolOptions: {
                workers: {
                    singleWorker: true,
                    wrangler: {
                        configPath: "./wrangler.toml",
                        environment: env.TEST_ENV || "test",
                    },
                    miniflare: {
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                            TEST_VCR_MODE:
                                env.TEST_VCR_MODE || "replay-or-record",
                        },
                    },
                },
            },
            deps: {
                optimizer: {
                    ssr: {
                        enabled: true,
                        include: [
                            "@polar-sh/sdk",
                            "better-auth",
                            "kysely",
                            "drizzle-orm",
                            "hono-openapi",
                        ],
                    },
                },
            },
        },
    };
});
