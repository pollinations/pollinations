// ─── Single source of truth for all tier properties ───
// Change values here → everything updates everywhere.

export const TIERS = {
    microbe: {
        pollen: 0,
        emoji: "🦠",
        displayName: "Microbe",
        threshold: 0,
        color: "gray",
    },
    spore: {
        pollen: 1.5,
        emoji: "🍄",
        displayName: "Spore",
        threshold: 3,
        color: "blue",
    },
    seed: {
        pollen: 3,
        emoji: "🌱",
        displayName: "Seed",
        threshold: 8,
        color: "green",
    },
    flower: {
        pollen: 10,
        emoji: "🌸",
        displayName: "Flower",
        threshold: 20,
        color: "pink",
    },
    nectar: {
        pollen: 20,
        emoji: "🍯",
        displayName: "Nectar",
        threshold: 50,
        color: "amber",
    },
    router: {
        pollen: 500,
        emoji: "🐝",
        displayName: "Router",
        threshold: Infinity,
        color: "red",
    },
} as const;

// Tailwind color name → hex (300-level shade) for CSS gradients
const COLOR_HEX: Record<string, string> = {
    gray: "#d1d5db",
    blue: "#93c5fd",
    green: "#86efac",
    pink: "#f9a8d4",
    amber: "#fcd34d",
    red: "#fca5a5",
};

export type TierName = keyof typeof TIERS;
export type TierStatus = TierName | "none";

export const tierNames = Object.keys(TIERS) as TierName[];

export const DEFAULT_TIER: TierName = "spore";

// ─── Derived lookup maps ───

export const TIER_POLLEN = Object.fromEntries(
    Object.entries(TIERS).map(([tier, c]) => [tier, c.pollen]),
) as Record<TierName, number>;

export const TIER_EMOJIS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, c]) => [tier, c.emoji]),
) as Record<TierName, string>;

export const TIER_THRESHOLDS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, c]) => [tier, c.threshold]),
) as Record<TierName, number>;

export const TIER_COLORS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, c]) => [tier, c.color]),
) as Record<TierName, string>;

export const TIER_GAUGE_COLORS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, c]) => [
        tier,
        COLOR_HEX[c.color] ?? "#d1d5db",
    ]),
) as Record<TierName, string>;

// ─── Helpers ───

export function isValidTier(tier: string): tier is TierName {
    return tier in TIERS;
}

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

// Ordered progression (excludes router, which is admin-only)
export const TIER_PROGRESSION: TierName[] = [
    "microbe",
    "spore",
    "seed",
    "flower",
    "nectar",
];

/** Returns the next tier's name and point threshold, or null if already at max (nectar). */
export function getNextTier(
    currentTier: TierStatus,
): { name: TierName; threshold: number } | null {
    const idx = TIER_PROGRESSION.indexOf(currentTier as TierName);
    if (idx === -1 || idx >= TIER_PROGRESSION.length - 1) return null;
    const next = TIER_PROGRESSION[idx + 1];
    return {
        name: next,
        threshold: TIERS[next].threshold as number,
    };
}
