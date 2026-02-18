export const TIERS = {
    microbe: { pollen: 0.1, emoji: "🦠" },
    spore: { pollen: 1, emoji: "🍄" },
    seed: { pollen: 3, emoji: "🌱" },
    flower: { pollen: 10, emoji: "🌸" },
    nectar: { pollen: 20, emoji: "🍯" },
    router: { pollen: 500, emoji: "🐝" },
} as const;

export type TierName = keyof typeof TIERS;
export type TierStatus = TierName | "none";

export const tierNames = Object.keys(TIERS) as TierName[];

export const DEFAULT_TIER: TierName = "microbe";

export const TIER_POLLEN = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.pollen]),
) as Record<TierName, number>;

export const TIER_EMOJIS = Object.fromEntries(
    Object.entries(TIERS).map(([tier, config]) => [tier, config.emoji]),
) as Record<TierName, string>;

export function isValidTier(tier: string): tier is TierName {
    return tier in TIERS;
}

export function getTierPollen(tier: string): number {
    return isValidTier(tier) ? TIERS[tier].pollen : TIERS[DEFAULT_TIER].pollen;
}

export function getTierEmoji(tier: string): string {
    return isValidTier(tier) ? TIERS[tier].emoji : TIERS[DEFAULT_TIER].emoji;
}

// ── Scoring criteria ────────────────────────────────────────────────────
// Each criterion has a data source so the upgrade script knows where to
// fetch the raw value from:
//   "github"   – GitHub GraphQL API (age, commits, repos, stars)
//   "tinybird" – Tinybird /v0/sql (avg daily pollen spend)
//   "llm"      – LLM legitimacy scorer (trust_score = 100 - abuse_score)

export interface ScoringCriterion {
    field: string;
    label: string;
    source: "github" | "tinybird" | "llm";
    multiplier: number;
    max: number;
    unit: string;
}

// ── Per-tier upgrade rules ──────────────────────────────────────────────
// Describes how to reach each tier from the one below it.
// The upgrade script iterates these in order.

export interface TierUpgradeRule {
    from: TierName[];
    to: TierName;
    label: string;
    auto: boolean;
    criteria: ScoringCriterion[];
    threshold: number;
}

export const TIER_UPGRADES: TierUpgradeRule[] = [
    {
        from: ["microbe"],
        to: "spore",
        label: "Verified account",
        auto: true,
        criteria: [
            {
                field: "age_days",
                label: "Account age",
                source: "github",
                multiplier: 0.5 / 30,
                max: 3.0,
                unit: "month",
            },
            {
                field: "avg_daily_spend_7d",
                label: "Avg daily spend (7d)",
                source: "tinybird",
                multiplier: 1.0,
                max: 2.0,
                unit: "pollen/day",
            },
            {
                field: "trust_score",
                label: "Legitimacy (AI)",
                source: "llm",
                multiplier: 0.05,
                max: 3.0,
                unit: "score",
            },
        ],
        threshold: 2.0,
    },
    {
        from: ["microbe", "spore"],
        to: "seed",
        label: "Active developer",
        auto: true,
        criteria: [
            {
                field: "age_days",
                label: "Account age",
                source: "github",
                multiplier: 0.5 / 30,
                max: 6.0,
                unit: "month",
            },
            {
                field: "commits",
                label: "Commits",
                source: "github",
                multiplier: 0.1,
                max: 2.0,
                unit: "each",
            },
            {
                field: "repos",
                label: "Public repos",
                source: "github",
                multiplier: 0.5,
                max: 1.0,
                unit: "each",
            },
            {
                field: "stars",
                label: "GitHub stars",
                source: "github",
                multiplier: 0.1,
                max: 5.0,
                unit: "each",
            },
            {
                field: "avg_daily_spend_7d",
                label: "Avg daily spend (7d)",
                source: "tinybird",
                multiplier: 0.5,
                max: 3.0,
                unit: "pollen/day",
            },
        ],
        threshold: 8.0,
    },
    {
        from: ["seed"],
        to: "flower",
        label: "Power user",
        auto: true,
        criteria: [
            {
                field: "age_days",
                label: "Account age",
                source: "github",
                multiplier: 0.5 / 30,
                max: 6.0,
                unit: "month",
            },
            {
                field: "commits",
                label: "Commits",
                source: "github",
                multiplier: 0.1,
                max: 2.0,
                unit: "each",
            },
            {
                field: "repos",
                label: "Public repos",
                source: "github",
                multiplier: 0.5,
                max: 1.0,
                unit: "each",
            },
            {
                field: "stars",
                label: "GitHub stars",
                source: "github",
                multiplier: 0.1,
                max: 5.0,
                unit: "each",
            },
            {
                field: "avg_daily_spend_7d",
                label: "Avg daily spend (7d)",
                source: "tinybird",
                multiplier: 1.0,
                max: 5.0,
                unit: "pollen/day",
            },
        ],
        threshold: 14.0,
    },
];

// ── Frontend display helpers ────────────────────────────────────────────

export const TIER_COLORS: Record<string, string> = {
    microbe: "bg-gray-100/60",
    spore: "bg-teal-100/60",
    seed: "bg-amber-100/60",
    flower: "bg-pink-100/60",
    nectar: "bg-purple-100/60",
};

/** Display tiers — excludes router (internal only) */
export const DISPLAY_TIERS = [
    "microbe",
    "spore",
    "seed",
    "flower",
    "nectar",
] as const;
