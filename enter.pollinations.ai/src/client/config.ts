const environmentConfig = {
    development: {
        baseUrl: "http://localhost:3000",
        authPath: "/api/auth",
    },
    staging: {
        baseUrl: "https://staging.enter.pollinations.ai",
        authPath: "/api/auth",
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];
