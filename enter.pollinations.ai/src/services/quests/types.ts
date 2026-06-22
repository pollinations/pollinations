import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import type * as schema from "@shared/db/better-auth.ts";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { QuestDefinition } from "./definitions.ts";

export type QuestDb = DrizzleD1Database<typeof schema>;

export type QuestEvaluationContext = {
    db: QuestDb;
    env: CloudflareBindings;
};

/**
 * What a quest produces per recipient: just the user who earned it. Everything
 * else on a grant (the idempotency key, questId, title, amount, bucket) is
 * derived from the quest's definition by toGrant — a quest never builds a key.
 *
 * Every quest is per-user: one award per user, deduped on the per-(quest, user)
 * idempotency key. There is no other scope.
 */
export type QuestAward = {
    userId: string;
};

/**
 * A quest in the migrated (per-quest) shape: it IS its definition plus its own
 * findRewards, which returns AWARDS (candidates — no dedup). The scaffolding
 * turns awards into grants (toGrant), dedups, and grants. No board-state fields:
 * the catalog adds those when it serializes (see questToCard).
 */
export type Quest = QuestDefinition & {
    findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]>;
};

/**
 * A group exposes exactly one thing: an async loader that returns its quests.
 * Static groups resolve a constant list; dynamic groups (e.g. issue bounties)
 * build quests from source state. index.ts awaits every group's loadQuests and
 * flattens the results.
 */
export type QuestGroup = {
    loadQuests: (ctx: QuestEvaluationContext) => Promise<Quest[]>;
};

/**
 * Turn a quest + one award into a full grant. The quest supplies the definition
 * fields (questId, title, amount, bucket); the award supplies only the user. The
 * idempotency key is derived here — the one place it is built — from the quest's
 * scope, so a quest can never mistype or collide a key:
 *   - "perUser" -> `quest:${id}:user:${userId}` (each user earns it once)
 *   - "once"    -> `quest:${id}` (one payout total; the userId is who gets paid
 *                  but is deliberately NOT in the key). If a "once" quest ever
 *                  proposes awards for two users, they collapse to the same key
 *                  and only the first is granted — which is exactly "once".
 *
 * `title` is snapshotted onto the grant so the history UI renders it directly
 * (grant.title) without re-deriving from the catalog.
 */
export function toGrant(
    quest: QuestDefinition,
    award: QuestAward,
): GrantRewardInput {
    const idempotencyKey =
        quest.scope === "once"
            ? `quest:${quest.id}`
            : `quest:${quest.id}:user:${award.userId}`;
    return {
        idempotencyKey,
        userId: award.userId,
        questId: quest.id,
        title: quest.title,
        url: quest.url ?? null,
        amount: quest.rewardAmount,
        bucket: quest.balanceBucket,
    };
}

/**
 * Serialize a migrated quest into a catalog card: its definition plus the
 * board-state constants a static quest always has (available). The card's url
 * is the quest's own optional url (null when absent). `findRewards` (behavior)
 * and `balanceBucket` (internal) are dropped.
 */
export function questToCard(quest: Quest): QuestCard {
    const {
        findRewards: _findRewards,
        balanceBucket: _bucket,
        url,
        ...definition
    } = quest;
    return {
        ...definition,
        availability: "available",
        url: url ?? null,
    };
}

/**
 * A uniform quest card = a quest definition serialized for the board, plus the
 * board-state fields the catalog layer adds. A card IS its definition, widened
 * with runtime state. The serializer drops `balanceBucket` (internal) and may
 * null rewardAmount (e.g. a bounty whose reward isn't fixed yet).
 */
export type QuestCard = Omit<
    QuestDefinition,
    "rewardAmount" | "balanceBucket" | "url"
> & {
    availability: "available" | "claimed" | "completed";
    rewardAmount: number | null;
    url: string | null;
};
