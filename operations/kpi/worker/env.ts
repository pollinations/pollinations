export type Env = {
    Bindings: {
        ASSETS: { fetch: typeof fetch };
        TINYBIRD_INGEST_URL: string;
        TINYBIRD_READ_TOKEN: string;
        GITHUB_APP_ID?: string;
        GITHUB_APP_PRIVATE_KEY?: string;
        POLLINATIONS_AUTH_BASE_URL?: string;
        POLLINATIONS_OAUTH_CLIENT_ID: string;
        POLLINATIONS_AUTH_SESSION_SECRET: string;
    };
};
