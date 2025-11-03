const environmentConfig = {
    development: {
        baseUrl: "http://localhost:3000",
        authPath: "/api/auth",
        pollenMeterId: "e5c7be95-f991-4f7e-8752-d19a5e47faf0", // DEPRECATED: Not used in frontend anymore
    },
    staging: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenMeterId: "e5c7be95-f991-4f7e-8752-d19a5e47faf0", // DEPRECATED: Not used in frontend anymore
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenMeterId: "e5c7be95-f991-4f7e-8752-d19a5e47faf0", // DEPRECATED: Not used in frontend anymore
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];

// TierPollen meter ID - shared constant for server-side code
// Using the original "Pollen" meter that receives generate.image/text events (no prefix)
// This preserves all existing balance and history
export const TIER_POLLEN_METER_ID = "d78e4114-8423-4006-9dda-a4f86d70c663";
