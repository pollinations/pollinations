const COMMUNITY_PROVIDER_ICON_URL =
    /^https:\/\/media\.pollinations\.ai\/[A-Za-z0-9][A-Za-z0-9._-]{0,194}$/u;

/** Only canonical object URLs from the public media service are safe as icons. */
export function isCommunityProviderIconUrl(value: unknown): value is string {
    return typeof value === "string" && COMMUNITY_PROVIDER_ICON_URL.test(value);
}
