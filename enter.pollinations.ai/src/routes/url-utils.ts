import { isLoopbackHostname } from "@shared/auth/redirect-uri.ts";

export { redirectUriMatchesAllowlist } from "@shared/auth/redirect-uri.ts";

/**
 * Returns true if the URL's hostname is a loopback/local address.
 * Kept for the consent UI to recognize localhost dev servers and word the
 * "unrecognized app" warning appropriately. Not used for identity inference.
 */
export function isLoopbackUrl(url: string): boolean {
    try {
        return isLoopbackHostname(new URL(url).hostname);
    } catch {
        return false;
    }
}
