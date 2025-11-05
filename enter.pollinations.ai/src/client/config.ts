const environmentConfig = {
    development: {
        baseUrl: "http://localhost:3000",
        authPath: "/api/auth",
        pollenTierMeterId: "00a732fc-75c7-4ec8-975b-af0dfca7ab3c",
        pollenPackMeterId: "ec075bd7-8073-4b30-bbc2-3a9afe6c9de7",
    },
    staging: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenTierMeterId: "00a732fc-75c7-4ec8-975b-af0dfca7ab3c",
        pollenPackMeterId: "ec075bd7-8073-4b30-bbc2-3a9afe6c9de7",
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        // TODO: Update this to real value once created
        pollenTierMeterId: "00a732fc-75c7-4ec8-975b-af0dfca7ab3c",
        pollenPackMeterId: "ec075bd7-8073-4b30-bbc2-3a9afe6c9de7",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];
