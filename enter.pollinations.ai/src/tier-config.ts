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

// ── Scoring ─────────────────────────────────────────────────────────────
// One flat list of criteria. Each criterion unlocks at a specific tier.
// Score for a target tier = sum of min(value * multiplier, max)
//   for all criteria where unlocksAt <= target tier.
//
// Data sources:
//   "github"   - GitHub GraphQL API (age, commits, repos, stars, listed apps)
//   "tinybird" - Tinybird /v0/sql (avg daily pollen spend)
//   "llm"      - LLM scorer (trust_score = 100 - abuse_score)

export interface ScoringCriterion {
    field: string;
    label: string;
    source: "github" | "tinybird" | "llm";
    multiplier: number;
    max: number;
    /** The tier at which this criterion starts contributing to the score */
    unlocksAt: TierName;
    /** Display group label (criteria with the same group are summed in the UI) */
    group: string;
}

export function tierIndex(tier: TierName): number {
    return tierNames.indexOf(tier);
}

export const SCORING_CRITERIA: ScoringCriterion[] = [
    // Base signals (unlock at spore)
    {
        field: "github_age_days",
        label: "GitHub age",
        source: "github",
        multiplier: 0.5 / 30,
        max: 3,
        unlocksAt: "spore",
        group: "GitHub Profile",
    },
    {
        field: "pollinations_age_days",
        label: "Pollinations age",
        source: "tinybird",
        multiplier: 0.5 / 30,
        max: 3,
        unlocksAt: "spore",
        group: "Account",
    },
    {
        field: "spend_7d",
        label: "Weekly paid spend",
        source: "tinybird",
        multiplier: 5,
        max: 1000,
        unlocksAt: "spore",
        group: "Pollen Purchase",
    },
    {
        field: "trust_score",
        label: "Trust score",
        source: "llm",
        multiplier: 0.05,
        max: 3,
        unlocksAt: "spore",
        group: "Human",
    },
    // Developer signals (unlock at seed)
    {
        field: "commits",
        label: "Commits",
        source: "github",
        multiplier: 0.1,
        max: 3,
        unlocksAt: "seed",
        group: "GitHub Profile",
    },
    {
        field: "repos",
        label: "Public repos",
        source: "github",
        multiplier: 0.5,
        max: 1,
        unlocksAt: "seed",
        group: "GitHub Profile",
    },
    {
        field: "stars",
        label: "GitHub stars",
        source: "github",
        multiplier: 0.1,
        max: 5,
        unlocksAt: "seed",
        group: "GitHub Profile",
    },
    // Contributor signals (unlock at flower)
    {
        field: "apps_listed",
        label: "Listed apps",
        source: "github",
        multiplier: 3,
        max: 5,
        unlocksAt: "flower",
        group: "Contributions",
    },
];

export const TIER_THRESHOLDS: Record<string, number> = {
    spore: 4,
    seed: 8,
    flower: 15,
    nectar: 25,
};

/** Get criteria active for a given tier */
export function criteriaForTier(tier: TierName): ScoringCriterion[] {
    const idx = tierIndex(tier);
    return SCORING_CRITERIA.filter((c) => tierIndex(c.unlocksAt) <= idx);
}

/** Group criteria for a tier, summing max points per group (for display) */
export function groupedCriteriaForTier(
    tier: TierName,
): Array<{ group: string; max: number }> {
    const groups = new Map<string, number>();
    for (const c of criteriaForTier(tier)) {
        groups.set(c.group, (groups.get(c.group) ?? 0) + c.max);
    }
    return [...groups.entries()].map(([group, max]) => ({ group, max }));
}

/** Compute score for a single criterion */
export function scoreCriterion(c: ScoringCriterion, rawValue: number): number {
    return Math.min(rawValue * c.multiplier, c.max);
}

/** Compute total score for a target tier from raw metric values */
export function computeScore(
    metrics: Record<string, number>,
    tier: TierName,
): number {
    return criteriaForTier(tier).reduce(
        (sum, c) => sum + scoreCriterion(c, metrics[c.field] ?? 0),
        0,
    );
}

/** Tiers with thresholds, sorted highest-first for greedy matching */
const SCORED_TIERS = (Object.keys(TIER_THRESHOLDS) as TierName[]).sort(
    (a, b) => tierIndex(b) - tierIndex(a),
);

/** Determine the highest tier a user qualifies for */
export function bestTierForMetrics(metrics: Record<string, number>): TierName {
    for (const tier of SCORED_TIERS) {
        if (computeScore(metrics, tier) >= TIER_THRESHOLDS[tier]) return tier;
    }
    return DEFAULT_TIER;
}

// ── Frontend display helpers ────────────────────────────────────────────

export const TIER_COLORS: Record<string, string> = {
    microbe: "bg-gray-100/60",
    spore: "bg-teal-100/60",
    seed: "bg-amber-100/60",
    flower: "bg-pink-100/60",
    nectar: "bg-purple-100/60",
};

/** Display tiers - excludes router (internal only) */
export const DISPLAY_TIERS = ["spore", "seed", "flower", "nectar"] as const;
