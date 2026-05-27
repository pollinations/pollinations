import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
    test: {
        poolOptions: {
            workers: {
                singleWorker: true,
                miniflare: {
                    d1Databases: ["MEDIA_DB"],
                },
                wrangler: {
                    configPath: "./wrangler.toml",
                },
            },
        },
    },
});
