import { getLogger } from "@logtape/logtape";
import { recordRewards } from "@shared/billing/rewards.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { QUEST_GROUPS } from "./quests/index.ts";
import {
    type QuestEvaluationContext,
    type QuestUser,
    type RewardProposal,
    toReward,
} from "./quests/types.ts";

const log = getLogger(["enter", "quest-checker"]);

type QuestProposalSourceResult = {
    proposals: RewardProposal[];
    error?: string;
};

export type QuestCheckResult = {
    success: boolean;
    checked: number;
    recorded: number;
    rewardIds: string[];
};

export async function checkQuestsForUser(
    env: CloudflareBindings,
    userId: string,
): Promise<QuestCheckResult> {
    const db = drizzle(env.DB, { schema });
    log.info("QUEST_CHECK_START: userId={userId} groups={groups}", {
        userId,
        groups: QUEST_GROUPS.map((g) => g.id),
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
        QUEST_GROUPS.map((group) => findGroupRewardProposals(ctx, group, user)),
    );
    // "coming_soon" quests are inert: shown on the board with a marker but never
    // grantable, so drop their proposals before recording any reward.
    const proposals = sourceResults
        .flatMap((entry) => entry.proposals)
        .filter((proposal) => proposal.quest.availability !== "coming_soon");
    const rewardInputs = proposals.map(toReward);
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

    const result = {
        success: sourceResults.every((entry) => !entry.error),
        checked: proposals.length,
        recorded: recorded.recorded,
        rewardIds: recorded.rewardIds,
    };

    log.info("QUEST_CHECK_COMPLETE: userId={userId} result={result}", {
        userId,
        result,
    });
    return result;
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

async function findGroupRewardProposals(
    ctx: QuestEvaluationContext,
    group: (typeof QUEST_GROUPS)[number],
    user: QuestUser,
): Promise<QuestProposalSourceResult> {
    try {
        log.info("QUEST_GROUP_START: groupId={groupId} userId={userId}", {
            groupId: group.id,
            userId: user.id,
        });
        const proposals = await group.findRewardProposalsForUser(ctx, user);
        log.info("QUEST_GROUP_PROPOSALS: groupId={groupId} count={count}", {
            groupId: group.id,
            count: proposals.length,
        });

        return {
            proposals,
        };
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
