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
 * What a quest produces per recipient: ONLY the things that vary per award.
 * Everything else on a grant (questId, amount, bucket) is the quest's own
 * definition and is filled in generically by toGrant.
 *
 * `idempotencyKey` lives here, not derived, because the key encodes the quest's
 * completion SCOPE — per-user (`quest:${id}:user:${userId}`) or per-event
 * (`…:event:app:${url}`) — which only the quest knows.
 */
export type QuestAward = {
    idempotencyKey: string;
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
 * fields (questId, title, amount, bucket); the award supplies the per-recipient
 * bits (key, user). This is the one place a GrantRewardInput is assembled.
 *
 * `title` is snapshotted onto the grant so the history UI renders it directly
 * (grant.title) without re-deriving from the catalog.
 */
export function toGrant(
    quest: QuestDefinition,
    award: QuestAward,
): GrantRewardInput {
    return {
        idempotencyKey: award.idempotencyKey,
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
