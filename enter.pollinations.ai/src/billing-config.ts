/**
 * BYOP markup applied to requests authenticated by a BYOP-issued sk_ token
 * (one carrying metadata.clientId). Payer is billed baseline × (1 + MARKUP_PCT);
 * the delta is credited to the app owner's pack_balance.
 *
 * Kill switch: set to 0 to disable entirely.
 */
export const BYOP_MARKUP_PCT = 0.25;

export function computeCreatorCredit(baselinePrice: number): number {
    if (baselinePrice <= 0 || BYOP_MARKUP_PCT <= 0) return 0;
    return baselinePrice * BYOP_MARKUP_PCT;
}

export function computeBilledPrice(baselinePrice: number): number {
    if (baselinePrice <= 0 || BYOP_MARKUP_PCT <= 0) return baselinePrice;
    return baselinePrice * (1 + BYOP_MARKUP_PCT);
}
