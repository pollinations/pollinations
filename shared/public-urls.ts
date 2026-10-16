export const PUBLIC_URLS = {
    root: "https://pollinations.ai",
    wildcard: "https://*.pollinations.ai",
    enter: {
        production: "https://enter.pollinations.ai",
        staging: "https://staging.enter.pollinations.ai",
        dev: "https://dev.enter.pollinations.ai",
    },
    gen: {
        production: "https://gen.pollinations.ai",
        staging: "https://staging.gen.pollinations.ai",
    },
} as const;

export const AUTH_TRUSTED_ORIGINS = [PUBLIC_URLS.root, PUBLIC_URLS.wildcard];
