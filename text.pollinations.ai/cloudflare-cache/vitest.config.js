import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Tests run in workerd with the [env.test] bindings from wrangler.toml
export default defineWorkersConfig({
    test: {
        restoreMocks: true,
        poolOptions: {
            workers: {
                wrangler: {
                    configPath: "./wrangler.toml",
                    environment: "test",
                },
            },
        },
    },
});
