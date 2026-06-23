import type { Bucket } from "@shared/billing/deduction.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq, isNotNull } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * GitHub contribution rewards, all sourced from the materialized
 * github_quest_issues table:
 *   - DYNAMIC per-issue bounties: each issue row is its own scope:"once" quest;
 *     completed payable rows pay the assignee.
 *   - STATIC "first merged PR": one perUser quest that pays anyone who has had
 *     at least one PR merge a quest issue (a completed row with a PR number).
 */

const QUEST_ICON_ID = "github" as const;
const QUEST_CATEGORY = "build" as const;

/**
 * Static "first merged PR" quest. perUser — each contributor earns it once
 * (key `quest:github:first_merged_pr:user:${userId}`). "Merged PR" here means a
 * PR that closed a quest issue (the only merged-PR signal the table records).
 */
const firstMergedPrQuest: QuestDefinition = {
    id: "github:first_merged_pr",
    title: "Land your first merged PR",
    description: "Get a pull request merged into Pollinations.",
    iconId: QUEST_ICON_ID,
    category: QUEST_CATEGORY,
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "pack",
};

/** Resolve the local user id for an assignee's GitHub id (null if unlinked). */
async function loadAssigneeUserId(
    ctx: QuestEvaluationContext,
    assigneeGithubId: number,
): Promise<string | null> {
    const rows = await ctx.db
        .select({ userId: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.githubId, assigneeGithubId))
        .limit(1);
    return rows[0]?.userId ?? null;
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
        category: QUEST_CATEGORY,
        scope: "once",
        rewardAmount: issue.rewardAmount ?? 0,
        balanceBucket: issue.balanceBucket as Bucket,
        url: issue.url,
    };
}

function issueAvailability(state: string): QuestCard["availability"] {
    if (state === "completed") return "completed";
    if (state === "claimed") return "claimed";
    return "available";
}

function isPayableIssue(
    issue: typeof schema.githubQuestIssues.$inferSelect,
): boolean {
    return (
        issue.state === "completed" &&
        (issue.rewardAmount ?? 0) > 0 &&
        issue.completedByPrNumber !== null &&
        issue.assigneeGithubId !== null
    );
}

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const rows = await ctx.db.select().from(schema.githubQuestIssues);
    const issueCards = rows.map((issue) =>
        questToCard(
            toIssueQuestDefinition(issue),
            issueAvailability(issue.state),
        ),
    );
    return [questToCard(firstMergedPrQuest), ...issueCards];
}

/**
 * Distinct local user ids who have had at least one PR merge a quest issue: a
 * completed row with a PR number, joined to the user by github_id. Drives the
 * "first merged PR" quest in one query (no per-row GitHub API calls).
 */
async function loadMergedPrUserIds(
    ctx: QuestEvaluationContext,
): Promise<string[]> {
    const rows = await ctx.db
        .selectDistinct({ userId: schema.user.id })
        .from(schema.githubQuestIssues)
        .innerJoin(
            schema.user,
            eq(schema.user.githubId, schema.githubQuestIssues.assigneeGithubId),
        )
        .where(
            and(
                eq(schema.githubQuestIssues.state, "completed"),
                isNotNull(schema.githubQuestIssues.completedByPrNumber),
            ),
        );
    return rows.map((row) => row.userId);
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const rows = await ctx.db.select().from(schema.githubQuestIssues);
    const proposals: RewardProposal[] = [];

    for (const issue of rows) {
        if (!isPayableIssue(issue) || issue.assigneeGithubId === null) {
            continue;
        }
        const userId = await loadAssigneeUserId(ctx, issue.assigneeGithubId);
        if (!userId) continue;
        proposals.push({
            quest: toIssueQuestDefinition(issue),
            userId,
        });
    }

    const mergedPrUserIds = await loadMergedPrUserIds(ctx);
    for (const userId of mergedPrUserIds) {
        proposals.push({ quest: firstMergedPrQuest, userId });
    }

    return proposals;
}
