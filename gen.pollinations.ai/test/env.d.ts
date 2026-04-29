declare module "cloudflare:test" {
    interface ProvidedEnv extends Cloudflare.Env {
        TEST_MIGRATIONS: D1Migration[];
        TEST_VCR_MODE: "replay-only" | "record-only" | "replay-or-record";
    }
}
