export const TIERS = {
    microbe: { pollen: 0, emoji: "🦠", cadence: "none" },
    spore: { pollen: 0.01, emoji: "🍄", cadence: "hourly" },
    seed: { pollen: 0.01, emoji: "🌱", cadence: "hourly" },
    flower: { pollen: 0.01, emoji: "🌸", cadence: "hourly" },
    nectar: { pollen: 0.01, emoji: "🍯", cadence: "hourly" },
    router: { pollen: 0.01, emoji: "🐝", cadence: "hourly" },
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

export function getTierCadence(tier: TierName): "hourly" | "none";
export function getTierCadence(tier: string): "hourly" | "none";
export function getTierCadence(tier: string): "hourly" | "none" {
    return isValidTier(tier)
        ? TIERS[tier].cadence
        : TIERS[DEFAULT_TIER].cadence;
}
