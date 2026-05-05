/**
 * BYOP markup applied to requests authenticated by a BYOP-issued sk_ token with
 * a trusted byop_client_key_id. The payer is billed baseline + markup; the
 * markup is credited to the app owner's tier_balance.
 */
export const BYOP_MARKUP_PCT = 0.25;
export const BYOP_MARKUP_PERCENT = BYOP_MARKUP_PCT * 100;

export function computeDevCredit(baselinePrice: number): number {
    if (baselinePrice <= 0 || BYOP_MARKUP_PCT <= 0) return 0;
    return baselinePrice * BYOP_MARKUP_PCT;
}
