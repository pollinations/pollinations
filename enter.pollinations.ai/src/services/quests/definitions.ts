import type { Bucket } from "@shared/billing/deduction.ts";

export const QUEST_CATEGORIES = [
    "setup",
    "grow",
    "build",
    "contribute",
    "community",
    "easteregg",
] as const;

/**
 * Lane a quest renders in:
 *   - "setup"      -> account setup and onboarding tasks
 *   - "grow"       -> product usage, billing, and app-growth tasks
 *   - "build"      -> developer standing and GitHub profile milestones
 *   - "contribute" -> open-source issue bounties and contribution tasks
 *   - "community"  -> low-friction community actions around the project
 *   - "easteregg"  -> hidden special rewards shown only after earning
 */
export type QuestCategory = (typeof QUEST_CATEGORIES)[number];

/**
 * Completion scope — drives the idempotency key shape (see toGrant):
 *   - "perUser" — each user earns it independently. Key includes the userId
 *                 (`quest:${id}:user:${userId}`), so every user can complete it.
 *   - "once"    — one payout total, whoever triggers it. Key omits the userId
 *                 (`quest:${id}`), so it can only ever be granted once. Used by
 *                 issue bounties: one issue, one payout, regardless of assignee.
 */
export type QuestScope = "perUser" | "once";

/**
 * Whether a quest sits on the open board. A two-state BOARD flag, not a
 * per-user status: "available" = open to everyone; "completed" = off the board
 * (shown only to a user who earned it, via their grant).
 */
export type QuestAvailability = "available" | "completed";

export type QuestDefinition = {
    id: string;
    title: string;
    description: string;
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
     * Whether this quest is on the open board:
     *   - "available" (default) — an open quest everyone sees and can complete.
     *   - "completed"           — off the open board; the frontend shows it ONLY
     *                             to a user who has earned it (joined via their
     *                             grant). Use for per-person/targeted quests
     *                             (e.g. the intern easter egg), and set
     *                             per-instance by dynamic groups (an assigned or
     *                             finished issue bounty leaves the board).
     * The catalog always emits the card so a grant can join to it; the frontend
     * applies the show/hide rule.
     */
    availability?: QuestAvailability;
};
