export const TIERS = {
    spore: { pollen: 1, emoji: "🍄" },
    seed: { pollen: 3, emoji: "🌱" },
    flower: { pollen: 10, emoji: "🌸" },
    nectar: { pollen: 20, emoji: "🍯" },
    router: { pollen: 500, emoji: "🐝" },
} as const;

export type TierName = keyof typeof TIERS;

export const DEFAULT_TIER: TierName = "spore";

export const TIER_POLLEN = {
    spore: TIERS.spore.pollen,
    seed: TIERS.seed.pollen,
    flower: TIERS.flower.pollen,
    nectar: TIERS.nectar.pollen,
    router: TIERS.router.pollen,
} as const;

export const TIER_EMOJIS = {
    spore: TIERS.spore.emoji,
    seed: TIERS.seed.emoji,
    flower: TIERS.flower.emoji,
    nectar: TIERS.nectar.emoji,
    router: TIERS.router.emoji,
} as const;

export function isValidTier(tier: string): tier is TierName {
    return tier in TIERS;
}

// Type-safe overloads: no fallback needed when TierName is guaranteed
export function getTierPollen(tier: TierName): number;
export function getTierPollen(tier: string): number;
export function getTierPollen(tier: string): number {
    return isValidTier(tier) ? TIERS[tier].pollen : TIERS[DEFAULT_TIER].pollen;
}

export function getTierEmoji(tier: TierName): string;
export function getTierEmoji(tier: string): string;
export function getTierEmoji(tier: string): string {
    return isValidTier(tier) ? TIERS[tier].emoji : TIERS[DEFAULT_TIER].emoji;
}

// Direct access when tier is validated - no fallback, guaranteed type safety
export function getTier(tier: TierName): (typeof TIERS)[TierName] {
    return TIERS[tier];
}
