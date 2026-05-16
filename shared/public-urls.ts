export const PUBLIC_URL_PROFILES = {
    pollinations: {
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
    },
    myceli: {
        root: "https://myceli.ai",
        wildcard: "https://*.myceli.ai",
        enter: {
            production: "https://enter.myceli.ai",
            staging: "https://staging.enter.myceli.ai",
            dev: "https://dev.enter.myceli.ai",
        },
        gen: {
            production: "https://gen.myceli.ai",
            staging: "https://staging.gen.myceli.ai",
        },
    },
} as const;

export type PublicUrlProfile = keyof typeof PUBLIC_URL_PROFILES;

export const ACTIVE_PUBLIC_URL_PROFILE = "myceli" satisfies PublicUrlProfile;
export const PUBLIC_URLS = PUBLIC_URL_PROFILES[ACTIVE_PUBLIC_URL_PROFILE];

export const AUTH_TRUSTED_ORIGINS = Object.values(PUBLIC_URL_PROFILES).flatMap(
    ({ root, wildcard }) => [root, wildcard],
);
