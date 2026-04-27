import type { TierName } from "./tier-config.ts";

/**
 * BYOP markup applied to requests authenticated by a BYOP-issued sk_ token
 * (one carrying metadata.clientId). Payer is billed baseline × (1 + MARKUP_PCT);
 * the delta is credited to the app owner's dev_balance.
 *
 * Kill switch: set to 0 to disable entirely.
 */
export const BYOP_MARKUP_PCT = 0.25;

/**
 * Markup is only levied when the payer is on a user-facing tier (microbe/spore).
 * Higher tiers (seed+) are developer/business accounts; routing their spend into
 * dev_balance would let coordinated rings convert tier allowances into spendable
 * earnings. Self-dealing (devUserId === payerUserId) is blocked separately.
 */
export const MARKUP_ELIGIBLE_PAYER_TIERS: ReadonlyArray<TierName> = [
    "microbe",
    "spore",
];

export function isMarkupEligiblePayerTier(tier: string): boolean {
    return (MARKUP_ELIGIBLE_PAYER_TIERS as ReadonlyArray<string>).includes(tier);
}

export function computeDevCredit(baselinePrice: number): number {
    if (baselinePrice <= 0 || BYOP_MARKUP_PCT <= 0) return 0;
    return baselinePrice * BYOP_MARKUP_PCT;
}

export function computeBilledPrice(baselinePrice: number): number {
    if (baselinePrice <= 0 || BYOP_MARKUP_PCT <= 0) return baselinePrice;
    return baselinePrice * (1 + BYOP_MARKUP_PCT);
}
