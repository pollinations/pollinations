export type Env = {
    Bindings: {
        ASSETS: { fetch: typeof fetch };
        POLLINATIONS_AUTH_BASE_URL?: string;
        POLLINATIONS_OAUTH_CLIENT_ID: string;
        POLLINATIONS_AUTH_SESSION_SECRET: string;
        TINYBIRD_INGEST_URL: string;
        TINYBIRD_ECONOMICS_READ_TOKEN: string;
        TINYBIRD_POLLEN_PIPE: string;
    };
};
