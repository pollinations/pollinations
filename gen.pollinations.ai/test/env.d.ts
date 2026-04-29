declare module "cloudflare:test" {
    interface ProvidedEnv extends Cloudflare.Env {
        TEST_MIGRATIONS: D1Migration[];
    }
}
