import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { loadEnv } from "vite";
import { configDefaults } from "vitest/config";
import viteConfig from "./vite.config";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

export default defineWorkersConfig(async ({ mode }) => {
    const migrationsPath = path.join(__dirname, "drizzle");
    const migrations = await readD1Migrations(migrationsPath);
    const env = loadEnv(mode, process.cwd(), "");

    return {
        ...viteConfig,
        resolve: {
            ...viteConfig.resolve,
            alias: [
                ...(Array.isArray(viteConfig.resolve?.alias)
                    ? viteConfig.resolve.alias
                    : []),
                {
                    find: /^@shared\/(.*)$/,
                    replacement: `${sharedSrc}$1`,
                },
            ],
        },
        test: {
            setupFiles: [
                "./test/setup/apply-migrations.ts",
                "./test/setup/rejection-handler.ts",
            ],
            exclude: [...configDefaults.exclude, "test/e2e/**"],
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
