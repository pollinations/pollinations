import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

export default defineWorkersConfig(async () => {
    const migrationsPath = path.join(
        __dirname,
        "../enter.pollinations.ai/drizzle",
    );
    const migrations = await readD1Migrations(migrationsPath);

    return {
        resolve: {
            alias: {
                "@shared": sharedSrc,
            },
        },
        test: {
            setupFiles: ["./test/setup/apply-migrations.ts"],
            poolOptions: {
                workers: {
                    singleWorker: true,
                    wrangler: {
                        configPath: "./wrangler.toml",
                    },
                    miniflare: {
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                        },
                        workers: [
                            // Satisfies the ENTER service binding
                            // (entrypoint = "ServiceGateway") declared in
                            // wrangler.toml; see enter-stub.mjs.
                            {
                                name: "pollinations-enter",
                                modules: true,
                                scriptPath: path.join(
                                    __dirname,
                                    "test/setup/enter-stub.mjs",
                                ),
                                compatibilityDate: "2025-11-12",
                            },
                        ],
                    },
                },
            },
        },
    };
});
