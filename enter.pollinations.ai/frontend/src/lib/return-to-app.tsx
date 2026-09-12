import { Button } from "@pollinations/ui";
import type { FC } from "react";

/** An absolute http(s) URL, else null. Used for the `redirect` search param. */
export function parseAppUrl(value: unknown): string | null {
    if (typeof value !== "string" || !value) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return url.href;
    } catch {
        return null;
    }
}

/**
 * The page that linked here, when it is not this dashboard. Browsers send
 * only the origin for cross-site links unless the app relaxes its referrer
 * policy (Open WebUI's worker does, so its chat URL comes through). Pages
 * store it in their own URL on first load, because after a Stripe round
 * trip the referrer is Stripe.
 */
export function referrerAppUrl(): string | null {
    const referrer = parseAppUrl(document.referrer);
    if (!referrer) return null;
    const url = new URL(referrer);
    if (url.origin === window.location.origin) return null;
    url.hash = "";
    return url.href;
}

/**
 * The URL to store as `redirect` on first load, or null to keep what we
 * have. The link usually carries the app's origin from the key's metadata;
 * the referrer wins when it is on that same origin, because it can name the
 * exact chat the user left. A referrer from elsewhere never overrides an
 * explicit redirect.
 */
export function preferredReturnUrl(
    redirect: string | undefined,
): string | null {
    const referrer = referrerAppUrl();
    if (!referrer || referrer === redirect) return null;
    if (!redirect) return referrer;
    return new URL(referrer).origin === new URL(redirect).origin
        ? referrer
        : null;
}

/**
 * A plain link back, never an automatic redirect: `redirect` is caller
 * supplied, so the user should see the host before leaving this origin.
 * Renders nothing when no app is known; done screens say so in their copy.
 */
export const ReturnToApp: FC<{ returnUrl: string | null }> = ({
    returnUrl,
}) => {
    if (!returnUrl) return null;
    return (
        <div className="space-y-3">
            <Button as="a" href={returnUrl} className="w-full">
                Back to {new URL(returnUrl).hostname}
            </Button>
            <p className="text-sm text-theme-text-muted">
                If the app is still open in another tab, you can close this one
                instead.
            </p>
        </div>
    );
};
