import type { RequestIdVariables } from "hono/request-id";

/** Auth context returned by enter's /api/internal/verify */
export type AuthContext = {
    valid: boolean;
    userId?: string;
    tier?: string;
    apiKeyId?: string;
    keyType?: string;
    keyName?: string | null;
    permissions?: { models?: string[]; account?: string[] } | null;
    pollenBudget?: number | null;
    hasPositiveBalance: boolean;
    hasPaidBalance: boolean;
    balances?: {
        tier: number;
        crypto: number;
        pack: number;
    } | null;
};

export type AuthVariables = {
    auth: AuthContext;
};

export type ErrorVariables = {
    error?: Error;
};

export type Bindings = {
    // Service binding to enter (auth/billing)
    ENTER: Fetcher;
    // R2 buckets for caching
    IMAGE_BUCKET: R2Bucket;
    TEXT_BUCKET: R2Bucket;
    // KV namespace
    KV: KVNamespace;
    // Edge rate limiter (production/staging only)
    EDGE_RATE_LIMITER?: RateLimit;
    // Backend service URLs
    IMAGE_SERVICE_URL: string;
    TEXT_SERVICE_URL: string;
    // API keys for audio services
    ELEVENLABS_API_KEY?: string;
    OVHCLOUD_API_KEY?: string;
    AIRFORCE_API_KEY?: string;
    // Tinybird event ingestion
    TINYBIRD_INGEST_URL: string;
    TINYBIRD_INGEST_TOKEN?: string;
    // Internal token for enter service binding
    PLN_ENTER_TOKEN?: string;
};

export type Env = {
    Bindings: Bindings;
    Variables: RequestIdVariables & ErrorVariables & Partial<AuthVariables>;
};
