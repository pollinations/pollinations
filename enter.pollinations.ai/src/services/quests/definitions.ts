import type { Bucket } from "@shared/billing/deduction.ts";

export const PRODUCT_QUEST_REWARD_SOURCE = "product_quest";
export const GITHUB_QUEST_REWARD_SOURCE = "code_quest";

export const QUEST_ICON_IDS = [
    "app",
    "card",
    "chat",
    "github",
    "image",
    "key",
    "sprout",
    "tokens",
] as const;

export type QuestIconId = (typeof QUEST_ICON_IDS)[number];

/**
 * Lane a quest renders in. Replaces the frontend id-prefix matching
 * (categoryForQuest). Preserves today's buckets:
 *   - "plant"     -> "Set up"   (onboarding:* quests)
 *   - "community" -> "Community" (github:* / github_issue quests)
 *   - "grow"      -> "Grow"     (everything else: spend:*, grow:*, engage:*)
 */
export type QuestCategory = "plant" | "grow" | "community";

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
    iconId: QuestIconId;
    category: QuestCategory;
    rewardAmount: number;
    balanceBucket: Bucket;
    /**
     * Optional static link for the quest (e.g. the GitHub quest board, the app
     * directory). Snapshotted onto each grant by toGrant and shown on the
     * catalog card, so the history UI renders it directly. Per-quest, not
     * per-recipient — there are no quest instances.
     */
    url?: string;
};
