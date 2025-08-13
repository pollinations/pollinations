import path from "node:path";
import {
    defineWorkersConfig,
    readD1Migrations,
    // @ts-ignore
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
    const migrationsPath = path.join(__dirname, "drizzle");
    const migrations = await readD1Migrations(migrationsPath);

    return {
        test: {
            setupFiles: ["./test/apply-migrations.ts"],
            poolOptions: {
                workers: {
                    wrangler: {
                        configPath: "./wrangler.toml",
                        environment: "test",
                    },
                    miniflare: {
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                        },
                    },
                },
            },
        },
    };
});

