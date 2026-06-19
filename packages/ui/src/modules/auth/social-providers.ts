export type SocialProvider = "github" | "google";

export type SocialProviderConfig = {
    id: SocialProvider;
    label: string;
};

const SOCIAL_PROVIDER_IDS = ["github", "google"] as const;

/** Fallback labels only; the server decides which providers are enabled. */
export const SOCIAL_PROVIDER_LABELS: Record<SocialProvider, string> = {
    github: "GitHub",
    google: "Google",
};

export function isSocialProvider(value: unknown): value is SocialProvider {
    return (
        typeof value === "string" &&
        (SOCIAL_PROVIDER_IDS as readonly string[]).includes(value)
    );
}
