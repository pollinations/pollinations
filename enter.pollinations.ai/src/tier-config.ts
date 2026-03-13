export const TIERS = {
    microbe: {
        pollen: 0,
        pollenPerHour: 0,
        emoji: "🦠",
        color: "gray",
        cadence: "hourly",
    },
    spore: {
        pollen: 0.01,
        pollenPerHour: 0.01,
        emoji: "🍄",
        color: "blue",
        cadence: "hourly",
    },
    seed: {
        pollen: 0.15,
        pollenPerHour: 0.15,
        emoji: "🌱",
        color: "green",
        cadence: "hourly",
    },
    flower: {
        pollen: 10,
        pollenPerHour: 10 / 24,
        emoji: "🌸",
        color: "pink",
        cadence: "daily",
    },
    nectar: {
        pollen: 20,
        pollenPerHour: 20 / 24,
        emoji: "🍯",
        color: "amber",
        cadence: "daily",
    },
    router: {
        pollen: 500,
        pollenPerHour: 500 / 24,
        emoji: "🐝",
        color: "red",
        cadence: "daily",
    },
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

export function getTierCadence(tier: TierName): "daily" | "hourly";
export function getTierCadence(tier: string): "daily" | "hourly";
export function getTierCadence(tier: string): "daily" | "hourly" {
    return isValidTier(tier)
        ? TIERS[tier].cadence
        : TIERS[DEFAULT_TIER].cadence;
}

export const TIER_POLLEN_PER_HOUR = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.pollenPerHour]),
) as Record<TierName, number>;

export function getTierPollenPerHour(tier: TierName): number;
export function getTierPollenPerHour(tier: string): number;
export function getTierPollenPerHour(tier: string): number {
    return isValidTier(tier)
        ? TIERS[tier].pollenPerHour
        : TIERS[DEFAULT_TIER].pollenPerHour;
}
