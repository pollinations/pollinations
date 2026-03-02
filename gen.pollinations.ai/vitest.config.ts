import path from "node:path";
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@shared": path.resolve(__dirname, "../shared"),
        },
    },
    test: {
        poolOptions: {
            workers: {
                singleWorker: true,
                wrangler: {
                    configPath: "./wrangler.toml",
                    environment: "test",
                },
            },
        },
    },
});
