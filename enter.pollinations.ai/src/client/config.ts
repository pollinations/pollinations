const environmentConfig = {
    development: {
        baseUrl: "",
        authPath: "/api/auth",
        pollenTierMeterId: "1593243f-f646-4df2-9f55-30da37cbc3a0",
        pollenPackMeterId: "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
    },
    staging: {
        baseUrl: "https://staging.enter.pollinations.ai",
        authPath: "/api/auth",
        pollenTierMeterId: "1593243f-f646-4df2-9f55-30da37cbc3a0",
        pollenPackMeterId: "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
    },
    production: {
        baseUrl: "https://enter.pollinations.ai",
        authPath: "/api/auth",
        pollenTierMeterId: "b7f3e925-d6c8-4bc8-b40a-291f2793512e",
        pollenPackMeterId: "0960354f-1ad5-40ab-93dd-7b1930913a38",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];
