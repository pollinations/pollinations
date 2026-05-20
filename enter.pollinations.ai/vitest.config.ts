import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults } from "vitest/config";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));
const frontendSrc = fileURLToPath(new URL("./frontend/src/", import.meta.url));
const enterSharedSrc = fileURLToPath(new URL("./shared/", import.meta.url));
const enterSrc = fileURLToPath(new URL("./src/", import.meta.url));

export default defineWorkersConfig(async ({ mode }) => {
    const migrationsPath = path.join(__dirname, "drizzle");
    const migrations = await readD1Migrations(migrationsPath);
    const env = loadEnv(mode, process.cwd(), "");

    return {
        plugins: [tsconfigPaths()],
        resolve: {
            dedupe: ["zod"],
            alias: [
                { find: /^@\/(.*)$/, replacement: `${enterSrc}$1` },
                { find: /^@shared\/(.*)$/, replacement: `${sharedSrc}$1` },
                { find: /^@frontend\/(.*)$/, replacement: `${frontendSrc}$1` },
                {
                    find: /^@enter-shared\/(.*)$/,
                    replacement: `${enterSharedSrc}$1`,
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
