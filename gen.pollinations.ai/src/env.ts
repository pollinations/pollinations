export type Env = {
    Bindings: {
        DB: D1Database;
        TEXT_SERVICE_URL: string;
        IMAGE_SERVICE_URL: string;
        ENVIRONMENT: string;
    };
    Variables: {
        requestId: string;
        user?: User;
        userTier?: string;
    };
};

export type User = {
    id: string;
    githubId: number;
    tier: string;
};
