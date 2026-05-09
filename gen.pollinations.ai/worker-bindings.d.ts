interface CloudflareBindings {
    ENTER: Fetcher;
    BETTER_AUTH_SECRET: string;
    TINYBIRD_INGEST_TOKEN: string;
    ELEVENLABS_API_KEY: string;
    ASSEMBLYAI_API_KEY?: string;
    OVHCLOUD_API_KEY: string;
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
    IMAGES?: ImagesBinding;
    PORTKEY_GATEWAY_URL: string;
    AWS_ACCESS_KEY_ID: string;
    AWS_SECRET_ACCESS_KEY: string;
    AWS_REGION: string;
    AWS_BEDROCK_ACCESS_KEY_ID?: string;
    AWS_BEDROCK_SECRET_ACCESS_KEY?: string;
    AWS_BEDROCK_REGION?: string;
    BEDROCK_GUARDRAIL_ID?: string;
    BEDROCK_GUARDRAIL_VERSION?: string;
    AZURE_MYCELI_PROD_API_KEY: string;
    AZURE_MYCELI_PROD_EASTUS2_API_KEY: string;
    AZURE_MYCELI_PROD_SWEDEN_API_KEY: string;
    AZURE_CONTENT_SAFETY_API_KEY: string;
    AZURE_CONTENT_SAFETY_ENDPOINT: string;
    BYTEDANCE_API_KEY: string;
    DEEPINFRA_API_KEY: string;
    FIREWORKS_API_KEY: string;
    GOOGLE_CLIENT_EMAIL: string;
    GOOGLE_PRIVATE_KEY: string;
    GOOGLE_PRIVATE_KEY_ID: string;
    GOOGLE_PROJECT_ID: string;
    KLEIN_URL: string;
    LTX2_BASE_URL: string;
    NOVA_REEL_S3_BUCKET: string;
    OPENAI_API_KEY: string;
    OPENROUTER_API_KEY: string;
    PERPLEXITY_API_KEY: string;
    PRUNA_API_KEY: string;
    REPLICATE_API_TOKEN: string;
    XAI_API_KEY: string;
    POLLEN_REFILL_PER_HOUR?: number;
    POLLEN_RATE_LIMITER?: DurableObjectNamespace;
    EDGE_RATE_LIMITER?: RateLimit;
}

declare namespace Cloudflare {
    interface Env extends CloudflareBindings {}
}
