import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    defineWorkersConfig,
    readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";
import { kCurrentWorker } from "miniflare";

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
                    main: "./test/setup/worker.ts",
                    singleWorker: true,
                    wrangler: {
                        configPath: "./wrangler.toml",
                    },
                    miniflare: {
                        bindings: {
                            TEST_MIGRATIONS: migrations,
                            TINYBIRD_INGEST_TOKEN: "test-token",
                            TINYBIRD_INGEST_URL:
                                "https://api.europe-west2.gcp.tinybird.co/v0/events?name=generation_event_v2",
                        },
                        serviceBindings: {
                            ENTER_BILLING: {
                                name: kCurrentWorker,
                                entrypoint: "BillingService",
                            },
                        },
                    },
                },
            },
        },
    };
});
