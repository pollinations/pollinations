import { PUBLIC_URLS } from "@shared/public-urls.ts";

function stripTrailingSlash(url: string): string {
    return url.replace(/\/+$/, "");
}

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL
    ? stripTrailingSlash(import.meta.env.VITE_API_BASE_URL)
    : undefined;

const developmentBaseUrl = window.location.origin;

const environmentConfig = {
    development: {
        baseUrl: developmentBaseUrl,
        apiBaseUrl: configuredApiBaseUrl ?? "/api",
        genBaseUrl: "http://localhost:8788",
        authPath: "/api/auth",
    },
    staging: {
        baseUrl: PUBLIC_URLS.enter.staging,
        apiBaseUrl: configuredApiBaseUrl ?? "/api",
        genBaseUrl: PUBLIC_URLS.gen.staging,
        authPath: "/api/auth",
    },
    production: {
        baseUrl: PUBLIC_URLS.enter.production,
        apiBaseUrl: configuredApiBaseUrl ?? "/api",
        genBaseUrl: PUBLIC_URLS.gen.production,
        authPath: "/api/auth",
    },
} as const;

export const config =
    environmentConfig[import.meta.env.MODE as keyof typeof environmentConfig];

export function genDocsUrl(hash = ""): string {
    return `${config.genBaseUrl}/docs${hash}`;
}
