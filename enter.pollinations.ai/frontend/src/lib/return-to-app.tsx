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
 * Where to send the user when they are done. The `redirect` param wins; else
 * the referring site, unless that is this dashboard. Both are only the app's
 * front door, not the chat the user left, so the "close this tab" hint is
 * always shown as well.
 */
export function resolveReturnUrl(redirect: string | null): string | null {
    if (redirect) return redirect;
    const referrer = parseAppUrl(document.referrer);
    if (!referrer || new URL(referrer).origin === window.location.origin) {
        return null;
    }
    return referrer;
}

export const ReturnToApp: FC<{ returnUrl: string | null }> = ({
    returnUrl,
}) => (
    <div className="space-y-3">
        <p className="text-sm text-theme-text-base">
            You can close this tab and return to the app.
        </p>
        {returnUrl && (
            <Button as="a" href={returnUrl} className="w-full">
                Open {new URL(returnUrl).hostname}
            </Button>
        )}
    </div>
);
