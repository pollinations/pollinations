export const COMMUNITY_PROVIDER_ICON_PRESETS = [
    "google",
    "openai",
    "anthropic",
    "deepseek",
    "qwen",
    "zai",
    "meta",
    "moonshot",
    "xai",
    "minimax",
    "cohere",
    "nvidia",
    "poolside",
] as const;

export type CommunityProviderIconPreset =
    (typeof COMMUNITY_PROVIDER_ICON_PRESETS)[number];

export const COMMUNITY_PROVIDER_ICON_MAX_BYTES = 64 * 1024;

export function isCommunityProviderIconPreset(
    value: unknown,
): value is CommunityProviderIconPreset {
    return (
        typeof value === "string" &&
        (COMMUNITY_PROVIDER_ICON_PRESETS as readonly string[]).includes(value)
    );
}
