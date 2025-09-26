const environmentConfig = {
    development: {
        baseUrl: "http://localhost:3000",
        authPath: "/api/auth",
        pollenMeterId: "d78e4114-8423-4006-9dda-a4f86d70c663",
    },
    staging: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenMeterId: "d78e4114-8423-4006-9dda-a4f86d70c663",
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        // TODO: Update this to real value once created
        pollenMeterId: "d78e4114-8423-4006-9dda-a4f86d70c663",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];
