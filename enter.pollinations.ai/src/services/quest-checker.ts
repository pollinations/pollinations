import { getLogger } from "@logtape/logtape";
import { claimReward, recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { ACCOUNT_SETUP_QUEST_GROUP, QUEST_GROUPS } from "./quests/index.ts";
import {
    type QuestDb,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestGroup,
    type QuestProgress,
    type QuestUser,
    toReward,
} from "./quests/types.ts";

const log = getLogger(["enter", "quest-checker"]);
const AUTO_CLAIM_QUEST_ID = "first_api_key";
/** Purchase rewards: the Stripe webhook credits them with the pack. */
const TOP_UP_QUEST_IDS = ["top_up_since_launch", "top_up_100_since_launch"];

type QuestEvaluationSourceResult = QuestEvaluation & {
    error?: string;
};

export type QuestCheckResult = {
    success: boolean;
    recorded: number;
    rewardIds: string[];
    progress: QuestProgress[];
};

export async function checkQuestsForUser(
    env: CloudflareBindings,
    userId: string,
    groups: QuestGroup[] = QUEST_GROUPS,
): Promise<QuestCheckResult> {
    const db = drizzle(env.DB, { schema });
    log.info("QUEST_CHECK_START: userId={userId} groups={groups}", {
        userId,
        groups: groups.map((group) => group.id),
    });

    const user = await loadQuestUser(db, userId);
    if (!user) {
        log.warn("QUEST_CHECK_USER_NOT_FOUND: userId={userId}", { userId });
        throw new Error(`Quest user not found: ${userId}`);
    }
    log.info(
        "QUEST_CHECK_USER_LOADED: userId={userId} githubId={githubId} githubUsername={githubUsername}",
        {
            userId: user.id,
            githubId: user.githubId,
            githubUsername: user.githubUsername,
        },
    );

    const ctx: QuestEvaluationContext = { db, env };
    const sourceResults = await Promise.all(
        groups.map((group) => evaluateGroup(ctx, group, user)),
    );
    const proposals = sourceResults.flatMap((entry) => entry.proposals);
    const rewardInputs = proposals.map((proposal) =>
        toReward(proposal, user.githubId),
    );
    log.info(
        "QUEST_CHECK_PROPOSALS: userId={userId} count={count} proposals={proposals}",
        {
            userId: user.id,
            count: rewardInputs.length,
            proposals: rewardInputs.map((r) => ({
                questId: r.questId,
                amount: r.amount,
                bucket: r.bucket,
                idempotencyKey: r.idempotencyKey,
            })),
        },
    );

    const recorded = await recordRewards(ctx.db, rewardInputs);
    if (proposals.some(({ quest }) => quest.id === AUTO_CLAIM_QUEST_ID)) {
        await claimPendingRewards(ctx.db, user.id, [AUTO_CLAIM_QUEST_ID]);
    }

    const result = {
        success: sourceResults.every((entry) => !entry.error),
        recorded: recorded.recorded,
        rewardIds: recorded.rewardIds,
        progress: sourceResults.flatMap((entry) => entry.progress ?? []),
    };

    log.info("QUEST_CHECK_COMPLETE: userId={userId} result={result}", {
        userId,
        result,
    });
    return result;
}

/**
 * Record and claim the top-up quest rewards right after a Stripe checkout
 * credit, so buyers get the bonus without opening Quests.
 */
export async function creditTopUpQuestRewards(
    env: CloudflareBindings,
    userId: string,
): Promise<void> {
    await checkQuestsForUser(env, userId, [ACCOUNT_SETUP_QUEST_GROUP]);
    await claimPendingRewards(
        drizzle(env.DB, { schema }),
        userId,
        TOP_UP_QUEST_IDS,
    );
}

async function claimPendingRewards(
    db: QuestDb,
    userId: string,
    questIds: string[],
): Promise<void> {
    const pending = await db
        .select({ id: schema.rewards.id })
        .from(schema.rewards)
        .where(
            and(
                eq(schema.rewards.userId, userId),
                isNull(schema.rewards.claimedAt),
                inArray(schema.rewards.questId, questIds),
            ),
        );
    for (const reward of pending) {
        await claimReward(db, { rewardId: reward.id, userId });
    }
}

async function loadQuestUser(
    db: ReturnType<typeof drizzle<typeof schema>>,
    userId: string,
): Promise<QuestUser | null> {
    const rows = await db
        .select({
            id: schema.user.id,
            githubId: schema.user.githubId,
            githubUsername: schema.user.githubUsername,
        })
        .from(schema.user)
        .where(eq(schema.user.id, userId))
        .limit(1);

    return rows[0] ?? null;
}

async function evaluateGroup(
    ctx: QuestEvaluationContext,
    group: (typeof QUEST_GROUPS)[number],
    user: QuestUser,
): Promise<QuestEvaluationSourceResult> {
    try {
        log.info("QUEST_GROUP_START: groupId={groupId} userId={userId}", {
            groupId: group.id,
            userId: user.id,
        });
        const evaluation = await group.evaluateUser(ctx, user);
        log.info("QUEST_GROUP_PROPOSALS: groupId={groupId} count={count}", {
            groupId: group.id,
            count: evaluation.proposals.length,
        });

        return evaluation;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(
            "QUEST_CHECK_GROUP_FAILED: groupId={groupId} error={error} stack={stack}",
            {
                groupId: group.id,
                error: message,
                stack: error instanceof Error ? error.stack : undefined,
            },
        );
        return {
            proposals: [],
            error: message,
        };
    }
}
