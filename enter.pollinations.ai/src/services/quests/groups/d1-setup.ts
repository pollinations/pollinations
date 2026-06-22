import { sql } from "drizzle-orm";
import { perUserKey } from "../keys.ts";
import type { Quest, QuestAward, QuestEvaluationContext } from "../types.ts";

/**
 * D1 setup group: account-setup quests sourced from D1 source tables.
 *   - first_api_key  -> apikey                    (one key per user)
 *   - first_top_up   -> stripe_checkout_credits   (one paid checkout per user)
 *
 * Each quest's SQL decides which users qualify and returns one AWARD per user.
 * It does NOT join reward_grants and does NOT dedup — the evaluator runs the
 * generic reward dedup over the merged batch.
 */

const MAX_GRANTS_PER_RUN = 500;

type SetupQuestRow = {
    userId: string;
};

const firstApiKeyQuest: Quest = {
    id: "onboarding:first_api_key",
    title: "Mint your first key",
    description: "Create your first Pollinations API key.",
    iconId: "key",
    category: "plant",
    rewardAmount: 1,
    balanceBucket: "pack",
    async findRewards({ db }: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await db.all<SetupQuestRow>(
            sql`
            SELECT apikey.user_id AS userId
            FROM apikey
            GROUP BY apikey.user_id
            LIMIT ${MAX_GRANTS_PER_RUN}`,
        );
        return rows.map((row) => ({
            idempotencyKey: perUserKey(firstApiKeyQuest.id, row.userId),
            userId: row.userId,
        }));
    },
};

const firstTopUpQuest: Quest = {
    id: "spend:first_top_up",
    title: "Stock your pollen pack",
    description: "Buy your first Pollen pack.",
    iconId: "card",
    category: "grow",
    rewardAmount: 1,
    balanceBucket: "pack",
    async findRewards({ db }: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await db.all<SetupQuestRow>(
            sql`
            SELECT stripe_checkout_credits.user_id AS userId
            FROM stripe_checkout_credits
            GROUP BY stripe_checkout_credits.user_id
            LIMIT ${MAX_GRANTS_PER_RUN}`,
        );
        return rows.map((row) => ({
            idempotencyKey: perUserKey(firstTopUpQuest.id, row.userId),
            userId: row.userId,
        }));
    },
};

export async function loadQuests(
    _ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    return [firstApiKeyQuest, firstTopUpQuest];
}
