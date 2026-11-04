// Test-only bindings from vitest.config.ts. `cloudflare:test` types `env` as
// `Cloudflare.Env`.
declare namespace Cloudflare {
    interface Env {
        TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
        TEST_VCR_MODE: "replay-only" | "record-only" | "replay-or-record";
        TEST_MEDIA_BUCKET: R2Bucket;
    }
}
