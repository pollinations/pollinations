const environmentConfig = {
    development: {
        baseUrl: "http://localhost:3000",
        authPath: "/api/auth",
        pollenTierMeterId: "1a51d03b-aea0-4e0a-a61c-b3a8914918b4",
        pollenPackMeterId: "1fcb2fed-e21a-4e1b-9774-cf25db39d11b",
    },
    staging: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenTierMeterId: "1a51d03b-aea0-4e0a-a61c-b3a8914918b4",
        pollenPackMeterId: "1fcb2fed-e21a-4e1b-9774-cf25db39d11b",
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        // TODO: Update this to real value once created
        pollenTierMeterId: "1a51d03b-aea0-4e0a-a61c-b3a8914918b4",
        pollenPackMeterId: "1fcb2fed-e21a-4e1b-9774-cf25db39d11b",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];
