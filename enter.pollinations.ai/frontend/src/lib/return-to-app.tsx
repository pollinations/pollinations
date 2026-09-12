import { Button } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";

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

const AUTO_RETURN_SECONDS = 8;

type ReturnToAppProps = {
    returnUrl: string | null;
    /** Count down and open `returnUrl` on its own; for the "done" screens. */
    autoReturn?: boolean;
};

export const ReturnToApp: FC<ReturnToAppProps> = ({
    returnUrl,
    autoReturn = false,
}) => {
    const counting = autoReturn && returnUrl !== null;
    const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_SECONDS);

    useEffect(() => {
        if (!counting) return;
        if (secondsLeft <= 0) {
            window.location.assign(returnUrl);
            return;
        }
        const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(timer);
    }, [counting, secondsLeft, returnUrl]);

    if (!returnUrl) {
        return (
            <p className="text-sm text-theme-text-base">
                You can close this tab and return to the app.
            </p>
        );
    }

    const host = new URL(returnUrl).hostname;
    return (
        <div className="space-y-3">
            <Button as="a" href={returnUrl} className="w-full">
                Back to {host}
            </Button>
            <p className="text-sm text-theme-text-muted">
                {counting
                    ? `Taking you back to ${host} in ${secondsLeft}s. `
                    : ""}
                If the app is still open in another tab, you can close this one
                instead.
            </p>
        </div>
    );
};
