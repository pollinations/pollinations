import path from "node:path";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
    const migrationsPath = path.join(__dirname, "../drizzle");
    const migrations = await readD1Migrations(migrationsPath);

    return {
        test: {
            setupFiles: ["./test/apply-migrations.ts"],
            poolOptions: {
                workers: {
                    singleWorker: true,
                    wrangler: {
                        // Use gen service config
                        configPath: "../wrangler.gen.toml",
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
