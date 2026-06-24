import { getLogger } from "@logtape/logtape";
import { sql } from "drizzle-orm";
import { fetchTinybirdRows, requireTinybirdReadToken } from "../../tinybird.ts";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
    type RewardProposal,
} from "../types.ts";

const log = getLogger(["enter", "quests", "app-growth"]);

/**
 * App-growth quests intentionally share one source group even though they render
 * in different frontend categories. The category is part of each quest
 * definition; the source file only describes where completion data comes from.
 */

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

export async function findRewardProposalsForUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<RewardProposal[]> {
    const [paidSpendRows, byopExternalRows] = await Promise.all([
        loadPaidSpendAppOwner(ctx, user),
        loadByopExternalAppOwner(ctx, user),
    ]);

    const proposals = [
        ...byopExternalRows.map((row) => ({
            quest: firstByopExternalUserQuest,
            userId: row.userId,
        })),
        ...paidSpendRows.map((row) => ({
            quest: firstPaidSpendInAppQuest,
            userId: row.userId,
        })),
    ];
    log.info(
        "APP_GROWTH_PROPOSALS: userId={userId} byopOwnerRows={byop} paidSpendRows={paid} questIds={questIds}",
        {
            userId: user.id,
            byop: byopExternalRows.length,
            paid: paidSpendRows.length,
            questIds: proposals.map((p) => p.quest.id),
        },
    );
    return proposals;
}

async function loadPaidSpendAppOwner(
    { env }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestUserRow[]> {
    const tinybirdOrigin = new URL(env.TINYBIRD_INGEST_URL).origin;
    const tinybirdToken = requireTinybirdReadToken(env);
    const rows = await fetchTinybirdRows<QuestUserRow>(
        tinybirdOrigin,
        "/v0/pipes/quest_paid_app_spend.json",
        tinybirdToken,
        { user_id: user.id },
    );
    const matched = uniqueUsers(rows).filter((row) => row.userId === user.id);
    // Same before/after-filter visibility as model-usage: an un-redeployed/global
    // pipe returns rows for everyone, which the client filter then drops to 0.
    log.info(
        "APP_GROWTH_PAID_SPEND: userId={userId} pipeRows={pipeRows} matchedRows={matchedRows}",
        {
            userId: user.id,
            pipeRows: rows.length,
            matchedRows: matched.length,
        },
    );
    return matched;
}

async function loadByopExternalAppOwner(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestUserRow[]> {
    const rows = await db.all<QuestUserRow>(
        sql`
        SELECT app_key.user_id AS userId
        FROM apikey AS user_key
        INNER JOIN apikey AS app_key
            ON app_key.id = user_key.byop_client_key_id
        WHERE app_key.user_id = ${user.id}
          AND user_key.user_id != app_key.user_id
        LIMIT 1`,
    );

    return uniqueUsers(rows);
}

function uniqueUsers(rows: QuestUserRow[]): QuestUserRow[] {
    return [...new Map(rows.map((row) => [row.userId, row])).values()];
}
