export const TIERS = {
    microbe: {
        pollen: 0,
        pollenPerHour: 0,
        maxBalance: 0,
        emoji: "🦠",
        color: "gray",
        cadence: "hourly",
    },
    spore: {
        pollen: 1.5,
        pollenPerHour: 0.009,
        maxBalance: 1.5,
        emoji: "🍄",
        color: "blue",
        cadence: "hourly",
    },
    seed: {
        pollen: 3,
        pollenPerHour: 0.125,
        maxBalance: 3,
        emoji: "🌱",
        color: "green",
        cadence: "hourly",
    },
    flower: {
        pollen: 10,
        pollenPerHour: 0.417,
        maxBalance: 10,
        emoji: "🌸",
        color: "pink",
        cadence: "hourly",
    },
    nectar: {
        pollen: 20,
        pollenPerHour: 0.833,
        maxBalance: 20,
        emoji: "🍯",
        color: "amber",
        cadence: "hourly",
    },
    router: {
        pollen: 500,
        pollenPerHour: 20.833,
        maxBalance: 500,
        emoji: "🐝",
        color: "red",
        cadence: "hourly",
    },
} as const;

export type TierName = keyof typeof TIERS;
export type TierStatus = TierName | "none";

export const tierNames = Object.keys(TIERS) as TierName[];

export const DEFAULT_TIER: TierName = "spore";

export const TIER_POLLEN = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.pollen]),
) as Record<TierName, number>;

export const TIER_POLLEN_PER_HOUR = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.pollenPerHour]),
) as Record<TierName, number>;

export const TIER_MAX_BALANCE = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.maxBalance]),
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

export function getTierCadence(tier: TierName): "hourly";
export function getTierCadence(tier: string): "hourly";
export function getTierCadence(tier: string): "hourly" {
    return isValidTier(tier)
        ? TIERS[tier].cadence
        : TIERS[DEFAULT_TIER].cadence;
}

export function getTierPollenPerHour(tier: TierName): number;
export function getTierPollenPerHour(tier: string): number;
export function getTierPollenPerHour(tier: string): number {
    return isValidTier(tier)
        ? TIERS[tier].pollenPerHour
        : TIERS[DEFAULT_TIER].pollenPerHour;
}

export function getTierMaxBalance(tier: TierName): number;
export function getTierMaxBalance(tier: string): number;
export function getTierMaxBalance(tier: string): number {
    return isValidTier(tier)
        ? TIERS[tier].maxBalance
        : TIERS[DEFAULT_TIER].maxBalance;
}
