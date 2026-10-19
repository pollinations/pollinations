import { ArrowLeftIcon, Button } from "@pollinations/ui";
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
export function referrerAppUrl(referrer: string): string | null {
    const parsed = parseAppUrl(referrer);
    if (!parsed) return null;
    const url = new URL(parsed);
    if (url.origin === window.location.origin) return null;
    url.hash = "";
    return url.href;
}

/**
 * The referrer of the tab's first page that asked, kept for the tab like the
 * analytics source, for links that name no app. Signing in comes back from
 * GitHub, or from the Google page that signed in to GitHub, so a later
 * load's referrer is never the app.
 */
function landingReferrer(): string {
    try {
        const stored = sessionStorage.getItem("landing_referrer");
        if (stored !== null) return stored;
        sessionStorage.setItem("landing_referrer", document.referrer);
    } catch {}
    return document.referrer;
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
    // A link that names its app is newer than anything kept for the tab:
    // only this load's own referrer may narrow it to the exact chat.
    const referrer = referrerAppUrl(
        redirect ? document.referrer : landingReferrer(),
    );
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
        <div className="w-full space-y-3">
            <Button
                as="a"
                href={returnUrl}
                intent="neutral"
                icon={<ArrowLeftIcon />}
                size="lg"
                className="w-full"
            >
                Back to {new URL(returnUrl).hostname}
            </Button>
            <p className="text-center text-xs text-theme-text-muted">
                You can also close this tab if the app is still open.
            </p>
        </div>
    );
};
