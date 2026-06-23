import * as schema from "@shared/db/better-auth.ts";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import type { QuestAvailability, QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * GitHub contribution rewards, sourced from the materialized github_quest_issues
 * table. Each issue row is its own scope:"once" quest; completed payable rows
 * pay the assignee. The static merged-PR quest is keyed off the same materialized
 * source: a completed quest issue with a linked PR number.
 */

const QUEST_ICON_ID = "github" as const;
const BUILD_CATEGORY = "build" as const;
const CONTRIBUTE_CATEGORY = "contribute" as const;

const firstMergedPrQuest: QuestDefinition = {
    id: "github:first_merged_pr",
    title: "First merged PR",
    description: "Get a pull request merged into Pollinations.",
    iconId: QUEST_ICON_ID,
    category: BUILD_CATEGORY,
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

// Availability is a two-state BOARD concept: "available" = an open bounty
// anyone can take; "completed" = off the open board. Only a genuinely open
// issue (state "available", nobody assigned) is shown; the moment it's claimed
// (someone's working it) or completed it leaves the board — it reappears only
// for the user who earned it, via their grant (see the frontend). So both
// claimed and completed map to "completed" (off-board).
function issueAvailability(
    issue: typeof schema.githubQuestIssues.$inferSelect,
): QuestAvailability {
    const open = issue.state === "available" && issue.assigneeGithubId === null;
    return open ? "available" : "completed";
}

function toIssueQuestDefinition(
    issue: typeof schema.githubQuestIssues.$inferSelect,
): QuestDefinition {
    return {
        // Per-issue idempotency identity. The grant key for a scope:"once" quest
        // is `quest:${id}` (no userId), so `id` MUST be unique per issue or every
        // community bounty collapses to one key and only the first ever pays. The
        // `questId` COLUMN is a shared discriminator ("github:community_issue_quest"
        // for all rows), NOT a per-issue id — so derive the id from issueNumber
        // (the table PK), restoring the keying fixed in 6d9a0e5d9.
        id: `github:issue:${issue.issueNumber}`,
        title: issue.title,
        description: issue.description ?? "",
        iconId: QUEST_ICON_ID,
        category: CONTRIBUTE_CATEGORY,
        scope: "once",
        rewardAmount: issue.rewardAmount ?? 0,
        balanceBucket: "tier",
        url: issue.url,
        availability: issueAvailability(issue),
    };
}

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const rows = await ctx.db.select().from(schema.githubQuestIssues);
    return [
        questToCard(firstMergedPrQuest),
        ...rows.map((issue) => questToCard(toIssueQuestDefinition(issue))),
    ];
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const rows = await ctx.db
        .select({
            issue: schema.githubQuestIssues,
            userId: schema.user.id,
        })
        .from(schema.githubQuestIssues)
        .innerJoin(
            schema.user,
            eq(schema.user.githubId, schema.githubQuestIssues.assigneeGithubId),
        )
        .where(
            and(
                eq(schema.githubQuestIssues.state, "completed"),
                gt(schema.githubQuestIssues.rewardAmount, 0),
                isNotNull(schema.githubQuestIssues.completedByPrNumber),
                isNotNull(schema.githubQuestIssues.assigneeGithubId),
            ),
        );

    const mergedPrRows = await ctx.db
        .selectDistinct({
            userId: schema.user.id,
        })
        .from(schema.githubQuestIssues)
        .innerJoin(
            schema.user,
            eq(schema.user.githubId, schema.githubQuestIssues.assigneeGithubId),
        )
        .where(
            and(
                eq(schema.githubQuestIssues.state, "completed"),
                isNotNull(schema.githubQuestIssues.completedByPrNumber),
                isNotNull(schema.githubQuestIssues.assigneeGithubId),
            ),
        );

    return [
        ...rows.map(({ issue, userId }) => ({
            quest: toIssueQuestDefinition(issue),
            userId,
        })),
        ...mergedPrRows.map(({ userId }) => ({
            quest: firstMergedPrQuest,
            userId,
        })),
    ];
}
