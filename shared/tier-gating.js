export const TIER_HIERARCHY = {
    anonymous: 0,
    seed: 1,
    flower: 2,
    nectar: 3,
};

export function hasSufficientTier(userTier, requiredTier) {
    const userLevel = TIER_HIERARCHY[userTier] ?? -1;
    const requiredLevel = TIER_HIERARCHY[requiredTier] ?? 99;
    return userLevel >= requiredLevel;
}
