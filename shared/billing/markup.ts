/**
 * BYOP markup applied to requests authenticated by a BYOP-issued sk_ token with
 * a trusted oauth_client_id. The payer is billed baseline + markup; the
 * markup is credited to the app owner's matching tier or pack balance.
 */
export const MARKUP_PCT = 0.25;
export const MARKUP_PERCENT = MARKUP_PCT * 100;

export function computeDevCredit(baselinePrice: number): number {
    if (baselinePrice <= 0 || MARKUP_PCT <= 0) return 0;
    return baselinePrice * MARKUP_PCT;
}
