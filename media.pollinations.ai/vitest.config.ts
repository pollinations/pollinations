import { fileURLToPath } from "node:url";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

const sharedSrc = fileURLToPath(new URL("../shared/", import.meta.url));

export default defineWorkersConfig({
    resolve: {
        alias: {
            "@shared": sharedSrc,
        },
    },
    test: {
        poolOptions: {
            workers: {
                singleWorker: true,
                wrangler: {
                    configPath: "./wrangler.toml",
                },
            },
        },
    },
});
