export const TIERS = {
    microbe: { pollen: 0, emoji: "🦠", color: "gray" },
    spore: { pollen: 1.5, emoji: "🍄", color: "blue" },
    seed: { pollen: 3, emoji: "🌱", color: "green" },
    flower: { pollen: 10, emoji: "🌸", color: "pink" },
    nectar: { pollen: 20, emoji: "🍯", color: "amber" },
    router: { pollen: 500, emoji: "🐝", color: "red" },
} as const;

export type TierName = keyof typeof TIERS;
export type TierStatus = TierName | "none";

export const tierNames = Object.keys(TIERS) as TierName[];

export const DEFAULT_TIER: TierName = "spore";

export const TIER_POLLEN = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.pollen]),
) as Record<TierName, number>;

export const TIER_EMOJIS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.emoji]),
) as Record<TierName, string>;

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

// Tier colors derived from TIERS.color (matches feat/hide-tiers-microbe)
export const TIER_COLORS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, c]) => [tier, c.color]),
) as Record<TierName, string>;

export function getTierColor(tier: TierName): string;
export function getTierColor(tier: string): string;
export function getTierColor(tier: string): string {
    return isValidTier(tier) ? TIERS[tier].color : TIERS[DEFAULT_TIER].color;
}
