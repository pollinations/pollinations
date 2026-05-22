// Minimal Worker binding globals for frontend type-checking of backend route
// types. Do not include the generated worker-bindings.d.ts here: it declares
// mainModule: typeof import("./src/index"), which pulls the full Worker entry
// point into the frontend type graph.
declare namespace Cloudflare {
    interface Env {
        KV: KVNamespace;
        IMAGE_BUCKET: R2Bucket;
        TEXT_BUCKET: R2Bucket;
        DB: D1Database;
        EDGE_RATE_LIMITER?: RateLimit;
        ENVIRONMENT: string;
        USAGE_DEBUG_USER_ID?: string;
        CLOUDFLARE_ACCOUNT_ID: string;
        LOG_LEVEL: "trace" | "debug" | "info" | "warning" | "error" | "fatal";
        LOG_FORMAT: "text" | "json";
        ALLOW_ANONYMOUS_USAGE: boolean;
        TINYBIRD_INGEST_URL: string;
        TINYBIRD_TIER_INGEST_URL: string;
        TINYBIRD_STRIPE_INGEST_URL: string;
        STRIPE_MODE: "sandbox" | "live";
        STRIPE_SUCCESS_URL: string;
        BETTER_AUTH_URL: string;
        STRIPE_AUTO_TOP_UP_PMC_ID: string;
        STRIPE_BUY_POLLEN_PMC_ID: string;
        POLLEN_REFILL_PER_HOUR?: number;
        BETTER_AUTH_SECRET: string;
        GITHUB_CLIENT_ID: string;
        GITHUB_CLIENT_SECRET: string;
        PLN_ENTER_TOKEN: string;
        TINYBIRD_READ_TOKEN: string;
        STRIPE_SECRET_KEY: string;
        STRIPE_WEBHOOK_SECRET: string;
        ELEVENLABS_API_KEY: string;
        OVHCLOUD_API_KEY: string;
        PLN_GPU_TOKEN: string;
        MUSIC_SERVICE_URL: string;
        SSH_RUNPOD_KLEIN: string;
        SSH_RUNPOD_FLUX_ZIMAGE: string;
        SSH_LAMBDA_SANA_LTX2_ACESTEP: string;
        TINYBIRD_INGEST_TOKEN: string;
        TINYBIRD_SYNC_TOKEN: string;
        DASHSCOPE_API_KEY: string;
    }
}

interface CloudflareBindings extends Cloudflare.Env {}
