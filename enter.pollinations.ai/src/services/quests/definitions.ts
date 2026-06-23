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
 * Lane a quest renders in. Maps to a frontend lane:
 *   - "plant"     -> "Set up"    (account onboarding: keys, first purchase)
 *   - "grow"      -> "Grow"      (app/usage growth: app earnings, BYOP)
 *   - "build"     -> "Build"     (dev contributions: GitHub account/stars,
 *                                 issue bounties, merged PRs)
 *   - "community" -> "Community" (legacy bucket; kept for any non-build
 *                                 community quest — currently unused)
 *   - "easteregg" -> "Easter eggs" (per-person targeted quests; only ever
 *                                 shown to the account that earned them, via
 *                                 hideUntilEarned)
 */
export type QuestCategory =
    | "plant"
    | "grow"
    | "build"
    | "community"
    | "easteregg";

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
    /**
     * Hide this quest from the open/available board; surface it ONLY once the
     * viewing user has earned it (then it renders as a normal completed card,
     * flipped via their grant). For per-person easter eggs / targeted quests
     * that shouldn't appear as an actionable card to everyone. The catalog
     * still emits the card (so the grant can join to it) — the FRONTEND skips
     * it while unearned. Defaults to false/omitted (normal always-visible).
     */
    hideUntilEarned?: boolean;
};
