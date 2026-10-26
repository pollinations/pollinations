import { isPollenPackKey, type PollenPackKey } from "@shared/pollen-packs.ts";
import { parseAppUrl } from "./return-to-app.tsx";

const isTrue = (value: unknown) => value === true || value === "true";

/**
 * Stripe's return after hosted Checkout or a redirect-based method:
 * stripe_success=true&session_id=cs_…, read so the page can confirm the
 * credit instead of trusting the flag. A buyer who left without paying
 * comes back canceled, or failed when hosted Checkout never opened.
 */
export function checkoutReturnSearch(search: Record<string, unknown>): {
    session_id?: string;
    stripe_canceled?: boolean;
    checkout_error?: "failed";
} {
    return {
        ...(isTrue(search.stripe_success) &&
        typeof search.session_id === "string" &&
        /^cs_\w+$/.test(search.session_id)
            ? { session_id: search.session_id }
            : {}),
        stripe_canceled: isTrue(search.stripe_canceled) || undefined,
        checkout_error:
            search.checkout_error === "failed" ? "failed" : undefined,
    };
}

/** The line a page shows when the buyer is back without a purchase. */
export function checkoutNotice(search: {
    stripe_canceled?: boolean;
    checkout_error?: "failed";
}): string | undefined {
    if (search.checkout_error === "failed")
        return "Couldn’t load checkout. Choose an amount to try again.";
    if (search.stripe_canceled)
        return "Checkout was cancelled. Choose an amount to try again.";
    return undefined;
}

type TopUpSearch = ReturnType<typeof checkoutReturnSearch> & {
    pack?: PollenPackKey;
    redirect?: string;
    stripe_success?: boolean;
    stripe_billing_return?: boolean;
};

export function validateTopUpSearch(
    search: Record<string, unknown>,
): TopUpSearch {
    return {
        stripe_billing_return:
            isTrue(search.stripe_billing_return) || undefined,
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        redirect: parseAppUrl(search.redirect) ?? undefined,
        stripe_success: isTrue(search.stripe_success) || undefined,
        ...checkoutReturnSearch(search),
    };
}
