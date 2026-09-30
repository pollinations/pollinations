import { isPollenPackKey, type PollenPackKey } from "@shared/pollen-packs.ts";
import { parseAppUrl } from "./return-to-app.tsx";

/**
 * Stripe's return after hosted Checkout or a redirect-based method:
 * stripe_success=true&session_id=cs_…, read so the page can confirm the
 * credit instead of trusting the flag.
 */
export function checkoutReturnSearch(search: Record<string, unknown>): {
    session_id?: string;
} {
    const success =
        search.stripe_success === true || search.stripe_success === "true";
    return success &&
        typeof search.session_id === "string" &&
        /^cs_\w+$/.test(search.session_id)
        ? { session_id: search.session_id }
        : {};
}

/** Back from Stripe's setup page that starts automatic top-up. */
export function autoTopUpSetupSearch(search: Record<string, unknown>): {
    auto_top_up_setup?: true;
} {
    return search.auto_top_up_setup === true ||
        search.auto_top_up_setup === "true"
        ? { auto_top_up_setup: true }
        : {};
}

type TopUpSearch = {
    pack?: PollenPackKey;
    auto_top_up_setup?: true;
    session_id?: string;
    redirect?: string;
    stripe_success?: boolean;
    stripe_canceled?: boolean;
    stripe_billing_return?: boolean;
};

export function validateTopUpSearch(
    search: Record<string, unknown>,
): TopUpSearch {
    return {
        stripe_billing_return:
            search.stripe_billing_return === true ||
            search.stripe_billing_return === "true" ||
            undefined,
        pack:
            typeof search.pack === "string" && isPollenPackKey(search.pack)
                ? search.pack
                : undefined,
        redirect: parseAppUrl(search.redirect) ?? undefined,
        stripe_success:
            search.stripe_success === true ||
            search.stripe_success === "true" ||
            undefined,
        stripe_canceled:
            search.stripe_canceled === true ||
            search.stripe_canceled === "true" ||
            undefined,
        ...checkoutReturnSearch(search),
        ...autoTopUpSetupSearch(search),
    };
}
