import type { Bucket } from "@shared/billing/deduction.ts";

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

/**
 * Completion scope — drives the idempotency key shape (see toGrant):
 *   - "perUser" — each user earns it independently. Key includes the userId
 *                 (`quest:${id}:user:${userId}`), so every user can complete it.
 *   - "once"    — one payout total, whoever triggers it. Key omits the userId
 *                 (`quest:${id}`), so it can only ever be granted once. Used by
 *                 issue bounties: one issue, one payout, regardless of assignee.
 */
export type QuestScope = "perUser" | "once";

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
    iconId: QuestIconId;
    category: QuestCategory;
    scope: QuestScope;
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
