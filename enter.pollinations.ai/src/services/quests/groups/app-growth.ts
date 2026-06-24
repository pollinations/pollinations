import { sql } from "drizzle-orm";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * App-growth quests intentionally share one source group even though they render
 * in different frontend categories. The category is part of each quest
 * definition; the source file only describes where completion data comes from.
 */

const MAX_REWARDS_PER_RUN = 500;

type QuestUserRow = {
    userId: string;
};

const firstByopExternalUserQuest: QuestDefinition = {
    id: "grow:first_byop_external_user",
    title: "User logs in to your app",
    description:
        "Have an external user connect to your app with [BYOP](https://gen.pollinations.ai/docs#tag/byop).",
    category: "grow",
    scope: "perUser",
    rewardAmount: 3,
    balanceBucket: "tier",
};

const firstPaidSpendInAppQuest: QuestDefinition = {
    id: "grow:first_paid_spend_in_app",
    title: "User spends in your app",
    description:
        "A user makes a successful request through your [BYOP](https://gen.pollinations.ai/docs#tag/byop) app, paid from their paid Pollen balance.",
    category: "grow",
    scope: "perUser",
    rewardAmount: 2,
    balanceBucket: "tier",
};

const QUESTS = [firstByopExternalUserQuest, firstPaidSpendInAppQuest];

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return QUESTS.map((quest) => questToCard(quest));
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const [paidSpendRows, byopExternalRows] = await Promise.all([
        loadPaidSpendAppOwners(ctx),
        loadByopExternalAppOwners(ctx),
    ]);

    return [
        ...byopExternalRows.map((row) => ({
            quest: firstByopExternalUserQuest,
            userId: row.userId,
        })),
        ...paidSpendRows.map((row) => ({
            quest: firstPaidSpendInAppQuest,
            userId: row.userId,
        })),
    ];
}

async function loadPaidSpendAppOwners({
    env,
}: QuestEvaluationContext): Promise<QuestUserRow[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<QuestUserRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_paid_app_spend.json",
        tinybirdToken,
        {},
    );
    return uniqueUsers(rows).slice(0, MAX_REWARDS_PER_RUN);
}

async function loadByopExternalAppOwners({
    db,
}: QuestEvaluationContext): Promise<QuestUserRow[]> {
    const rows = await db.all<QuestUserRow>(
        sql`
        SELECT app_key.user_id AS userId
        FROM apikey AS user_key
        INNER JOIN apikey AS app_key
            ON app_key.id = user_key.byop_client_key_id
        WHERE user_key.user_id != app_key.user_id
        GROUP BY app_key.user_id
        LIMIT ${MAX_REWARDS_PER_RUN}`,
    );

    return uniqueUsers(rows);
}

function uniqueUsers(rows: QuestUserRow[]): QuestUserRow[] {
    return [...new Map(rows.map((row) => [row.userId, row])).values()];
}
