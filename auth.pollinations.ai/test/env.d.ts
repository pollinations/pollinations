declare module "cloudflare:test" {
    // ProvidedEnv controls the type of `import("cloudflare:test").env`
    interface ProvidedEnv extends Cloudflare.Env {
        TEST_MIGRATIONS: D1Migration[];
    }
}
