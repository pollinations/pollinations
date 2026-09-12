import { isPollenPackKey, type PollenPackKey } from "@shared/pollen-packs.ts";
import { parseAppUrl } from "./return-to-app.tsx";

type TopUpSearch = {
    pack?: PollenPackKey;
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
    };
}
