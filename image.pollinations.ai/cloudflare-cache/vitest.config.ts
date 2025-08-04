import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
    test: {
        include: ["test/**/*.test.(js|ts)"],
        poolOptions: {
            workers: {
                wrangler: { configPath: "./wrangler.toml" },
            },
        },
    },
});
