import type { TierName } from "../tier-config.ts";

/**
 * BYOP markup applied to requests authenticated by a BYOP-issued sk_ token with
 * a trusted byop_client_key_id. The payer is billed baseline + markup; the
 * markup is credited to the app owner's dev_balance.
 */
export const BYOP_MARKUP_PCT = 0.25;

export const MARKUP_ELIGIBLE_PAYER_TIERS: ReadonlyArray<TierName> = [
    "microbe",
    "spore",
];

export const REWARD_ELIGIBLE_CREATOR_TIERS: ReadonlyArray<TierName> = [
    "seed",
    "flower",
    "nectar",
    "router",
];

export function isMarkupEligiblePayerTier(tier: string): boolean {
    return (MARKUP_ELIGIBLE_PAYER_TIERS as ReadonlyArray<string>).includes(
        tier,
    );
}

export function isRewardEligibleCreatorTier(tier: string | null | undefined) {
    return (REWARD_ELIGIBLE_CREATOR_TIERS as ReadonlyArray<string>).includes(
        tier ?? "",
    );
}

export function computeDevCredit(baselinePrice: number): number {
    if (baselinePrice <= 0 || BYOP_MARKUP_PCT <= 0) return 0;
    return baselinePrice * BYOP_MARKUP_PCT;
}
