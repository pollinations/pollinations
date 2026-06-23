import type { Bucket } from "@shared/billing/deduction.ts";
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
 * pay the assignee.
 *
 * NOTE: a "first authored merged PR" quest does NOT belong here — that needs a
 * PR-merge source keyed on PR author (a `gh_pull_requests` table + a GitHub
 * sync), independent of quest issues. github_quest_issues only knows issue
 * assignees and the PR that closed an issue, so it cannot answer "did this user
 * author a merged PR". Tracked as a follow-up; not built on this table.
 */

const QUEST_ICON_ID = "github" as const;
const QUEST_CATEGORY = "build" as const;

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
        category: QUEST_CATEGORY,
        scope: "once",
        rewardAmount: issue.rewardAmount ?? 0,
        balanceBucket: issue.balanceBucket as Bucket,
        url: issue.url,
        availability: issueAvailability(issue),
    };
}

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const rows = await ctx.db.select().from(schema.githubQuestIssues);
    return rows.map((issue) => questToCard(toIssueQuestDefinition(issue)));
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

    return rows.map(({ issue, userId }) => ({
        quest: toIssueQuestDefinition(issue),
        userId,
    }));
}
