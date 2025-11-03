const environmentConfig = {
    development: {
        baseUrl: "http://localhost:3000",
        authPath: "/api/auth",
        pollenMeterId: "e5c7be95-f991-4f7e-8752-d19a5e47faf0", // TierPollen meter (subscription)
    },
    staging: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenMeterId: "e5c7be95-f991-4f7e-8752-d19a5e47faf0", // TierPollen meter (subscription)
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenMeterId: "e5c7be95-f991-4f7e-8752-d19a5e47faf0", // TierPollen meter (subscription)
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];

// TierPollen meter ID - shared constant for server-side code
export const TIER_POLLEN_METER_ID = "e5c7be95-f991-4f7e-8752-d19a5e47faf0";
