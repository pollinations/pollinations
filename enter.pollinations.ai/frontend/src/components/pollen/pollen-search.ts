import {
    DEFAULT_POLLEN_PACK_KEY,
    isPollenPackKey,
    type PollenPackKey,
} from "@shared/pollen-packs.ts";

export { DEFAULT_POLLEN_PACK_KEY } from "@shared/pollen-packs.ts";

export type PollenSearch = {
    pack?: PollenPackKey;
    stripe_success?: boolean;
    stripe_canceled?: boolean;
    session_id?: string;
    stripe_billing_return?: boolean;
};

function trueOrUndefined(value: unknown): true | undefined {
    return value === true || value === "true" ? true : undefined;
}

export function validatePollenSearch(
    search: Record<string, unknown>,
): PollenSearch {
    return {
        pack:
            typeof search.pack === "string" &&
            isPollenPackKey(search.pack) &&
            search.pack !== DEFAULT_POLLEN_PACK_KEY
                ? search.pack
                : undefined,
        stripe_success: trueOrUndefined(search.stripe_success),
        stripe_canceled: trueOrUndefined(search.stripe_canceled),
        session_id:
            typeof search.session_id === "string"
                ? search.session_id
                : undefined,
        stripe_billing_return: trueOrUndefined(search.stripe_billing_return),
    };
}
