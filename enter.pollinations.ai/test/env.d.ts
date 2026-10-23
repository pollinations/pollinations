// Test-only bindings from vitest.config.ts. `cloudflare:test` types `env` as
// `Cloudflare.Env`.
declare namespace Cloudflare {
    interface Env {
        TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
}

declare module "*?raw" {
    const content: string;
    export default content;
}
