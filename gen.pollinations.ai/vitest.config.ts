import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";

const genSrc = fileURLToPath(new URL("./src/", import.meta.url));
const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

const genAliases = [
    "content-filter.ts",
    "cache",
    "durable-objects/PollenRateLimiter.ts",
    "env.ts",
    "error.ts",
    "events.ts",
    "logger",
    "logger.ts",
    "middleware/auth.ts",
    "middleware/balance.ts",
    "middleware/logger.ts",
    "middleware/media-cache.ts",
    "middleware/model.ts",
    "middleware/rate-limit-durable.ts",
    "middleware/rate-limit-edge.ts",
    "middleware/safety.ts",
    "middleware/text-cache.ts",
    "middleware/track.ts",
    "middleware/validator.ts",
    "schemas/image.ts",
    "schemas/text.ts",
    "util",
    "util.ts",
    "utils/api-docs.ts",
    "utils/bedrock-guardrail.ts",
    "utils/generation-access.ts",
    "utils/media-cache.ts",
    "utils/model-stats.ts",
    "utils/safety-features.ts",
    "utils/text-cache.ts",
];

const baseConfig = defineConfig({
    resolve: {
        alias: [
            ...genAliases.map((path) => ({
                find: `@/${path}`,
                replacement: `${genSrc}${path}`,
            })),
            {
                find: /^@\/text\/(.*)$/,
                replacement: `${genSrc}text/$1`,
            },
            {
                find: /^@\/image\/(.*)$/,
                replacement: `${genSrc}image/$1`,
            },
            {
                find: /^@shared\/(.*)$/,
                replacement: `${sharedSrc}$1`,
            },
            // piexif-ts package.json points "module"/"browser" at non-existent files;
            // pin resolution to the published UMD bundle that actually ships.
            { find: /^piexif-ts$/, replacement: "piexif-ts/dist/piexif.js" },
        ],
    },
});

export default defineWorkersConfig(async ({ mode }) => {
    const migrationsPath = path.join(
        __dirname,
        "../enter.pollinations.ai/drizzle",
    );
    const migrations = await readD1Migrations(migrationsPath);
    const env = loadEnv(mode, process.cwd(), "");

    return {
        ...baseConfig,
        test: {
            globalSetup: ["./test/setup/snapshot-server.ts"],
            setupFiles: ["./test/setup/apply-migrations.ts"],
            exclude: [...configDefaults.exclude],
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
                            BYTEDANCE_API_KEY:
                                env.BYTEDANCE_API_KEY || "test-key",
                        },
                        serviceBindings: {
                            ENTER: async (request: Request) => {
                                const url = new URL(request.url);
                                if (
                                    url.pathname ===
                                    "/api/docs/open-api/generate-schema"
                                ) {
                                    return Response.json({
                                        openapi: "3.1.0",
                                        info: {
                                            title: "Enter",
                                            version: "0.0.0",
                                        },
                                        paths: {},
                                        components: {},
                                    });
                                }
                                return new Response("enter test stub");
                            },
                        },
                    },
                },
            },
        },
    };
});
