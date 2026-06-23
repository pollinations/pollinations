import type { Bucket } from "@shared/billing/deduction.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * Community bounties sourced from the materialized github_quest_issues table.
 * Each issue row is its own quest definition; completed payable rows also emit
 * reward proposals for the assignee.
 */

const QUEST_ICON_ID = "github" as const;
const QUEST_CATEGORY = "community" as const;

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
    return rows.map((issue) =>
        questToCard(
            toIssueQuestDefinition(issue),
            issueAvailability(issue.state),
        ),
    );
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

    return proposals;
}
