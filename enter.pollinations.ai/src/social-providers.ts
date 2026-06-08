export const SOCIAL_PROVIDER_ORDER = ["github", "google"] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDER_ORDER)[number];

export type PublicSocialProvider = {
    id: SocialProviderId;
    label: string;
};

const SOCIAL_PROVIDER_LABELS = {
    github: "GitHub",
    google: "Google",
} as const satisfies Record<SocialProviderId, string>;

export function getEnabledSocialProviderIds(
    env: Pick<
        Cloudflare.Env,
        | "GITHUB_CLIENT_ID"
        | "GITHUB_CLIENT_SECRET"
        | "GOOGLE_CLIENT_ID"
        | "GOOGLE_CLIENT_SECRET"
    >,
): SocialProviderId[] {
    return SOCIAL_PROVIDER_ORDER.filter((provider) => {
        if (provider === "github") {
            return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
        }
        return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    });
}

export function getPublicSocialProviders(
    env: Parameters<typeof getEnabledSocialProviderIds>[0],
): PublicSocialProvider[] {
    return getEnabledSocialProviderIds(env).map((id) => ({
        id,
        label: SOCIAL_PROVIDER_LABELS[id],
    }));
}
