interface CloudflareBindings {
    BETTER_AUTH_SECRET: string;
    POLAR_ACCESS_TOKEN?: string;
    POLAR_WEBHOOK_SECRET?: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    PLN_ENTER_TOKEN: string;
    TINYBIRD_INGEST_TOKEN: string;
    TINYBIRD_READ_TOKEN?: string;
    TINYBIRD_SYNC_TOKEN?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    ELEVENLABS_API_KEY: string;
    OVHCLOUD_API_KEY?: string;
    PLN_GPU_TOKEN: string;
    MUSIC_SERVICE_URL: string;
    DASHSCOPE_API_KEY: string;
    KV: KVNamespace;
    IMAGE_BUCKET: R2Bucket;
    TEXT_BUCKET: R2Bucket;
    DB: D1Database;
    ENVIRONMENT:
        | "local"
        | "production"
        | "staging"
        | "dev"
        | "test"
        | "development";
    LOG_LEVEL?: "trace" | "debug";
    LOG_FORMAT?: "text" | "json";
    ALLOW_ANONYMOUS_USAGE?: boolean;
    TINYBIRD_INGEST_URL: string;
    TINYBIRD_TIER_INGEST_URL?: string;
    IMAGE_SERVICE_URL: string;
    TEXT_SERVICE_URL: string;
    POLLEN_REFILL_PER_HOUR?: number;
    POLLEN_RATE_LIMITER?: DurableObjectNamespace;
    EDGE_RATE_LIMITER?: RateLimit;
}

declare namespace Cloudflare {
    interface Env extends CloudflareBindings {}
}
