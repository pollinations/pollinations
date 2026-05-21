import { PUBLIC_URLS } from "@shared/public-urls.ts";

const developmentBaseUrl =
    typeof window === "undefined"
        ? "http://localhost:3000"
        : window.location.origin;

const environmentConfig = {
    development: {
        baseUrl: developmentBaseUrl,
        genBaseUrl: "http://localhost:8788",
        authPath: "/api/auth",
        pollenTierMeterId: "1593243f-f646-4df2-9f55-30da37cbc3a0",
        pollenPackMeterId: "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
    },
    staging: {
        baseUrl: PUBLIC_URLS.enter.staging,
        genBaseUrl: PUBLIC_URLS.gen.staging,
        authPath: "/api/auth",
        pollenTierMeterId: "1593243f-f646-4df2-9f55-30da37cbc3a0",
        pollenPackMeterId: "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
    },
    production: {
        baseUrl: PUBLIC_URLS.enter.production,
        genBaseUrl: PUBLIC_URLS.gen.production,
        authPath: "/api/auth",
        pollenTierMeterId: "b7f3e925-d6c8-4bc8-b40a-291f2793512e",
        pollenPackMeterId: "0960354f-1ad5-40ab-93dd-7b1930913a38",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];

export function genDocsUrl(hash = ""): string {
    return `${config.genBaseUrl}/docs${hash}`;
}
