import type { Bucket } from "@shared/billing/deduction.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import type { Quest, QuestAward, QuestEvaluationContext } from "../types.ts";

/**
 * github-issues group — community bounties sourced PURELY from the
 * `github_quest_issues` D1 table (no GitHub API). Unlike the static groups,
 * this one builds quests from source state: EACH issue row becomes its OWN
 * normal Quest (id `github:issue:${issueNumber}`), carrying that row's real
 * per-issue title/description/reward/bucket/url. There is no umbrella
 * "community" quest anymore.
 *
 * loadQuests is called by BOTH consumers (catalog + evaluator), so it must
 * surface every issue that matters to either:
 *   - an OPEN/claimed issue is a board card (catalog) whose findRewards returns
 *     [] (nothing to pay out yet);
 *   - a COMPLETED + payable issue is a quest whose findRewards pays the
 *     assignee (evaluator).
 *
 * TRADEOFF (deliberate, documented): questToCard serializes EVERY loaded quest
 * into a board card uniformly — there is no per-quest "hide from board" hook.
 * Because we must load completed-and-payable issues for the evaluator to pay
 * them, those completed issues ALSO show as cards (always "available", since
 * the card layer hardcodes availability). We accept this collapse for now:
 * the old per-card availability/"completed leaves the board" behaviour is gone.
 * The reward ledger / viewer history remains the source of truth for what a
 * user actually earned.
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

/**
 * Build the per-issue Quest. The closure captures the issue row so findRewards
 * never re-queries it — it is a pure function of (issue, assignee lookup): an
 * OPEN issue yields no award; a COMPLETED + payable issue yields one award to
 * the assignee. scope:"once" — toGrant derives the key `quest:github:issue:${N}`
 * (no userId), so an issue pays out exactly once even if it is reassigned to a
 * different user after a first payout. The award's userId is who gets paid; it
 * is deliberately NOT in the key.
 */
function toIssueQuest(
    issue: typeof schema.githubQuestIssues.$inferSelect,
): Quest {
    return {
        id: `github:issue:${issue.issueNumber}`,
        title: issue.title,
        description: issue.description ?? "",
        iconId: QUEST_ICON_ID,
        category: QUEST_CATEGORY,
        scope: "once",
        rewardAmount: issue.rewardAmount ?? 0,
        balanceBucket: issue.balanceBucket as Bucket,
        url: issue.url,
        async findRewards(ctx: QuestEvaluationContext): Promise<QuestAward[]> {
            // Only a completed, funded, PR-closed, assigned issue pays out.
            if (
                issue.state !== "completed" ||
                !issue.rewardAmount ||
                issue.rewardAmount <= 0 ||
                issue.completedByPrNumber === null ||
                issue.assigneeGithubId === null
            ) {
                return [];
            }
            const userId = await loadAssigneeUserId(
                ctx,
                issue.assigneeGithubId,
            );
            if (!userId) return [];
            return [{ userId }];
        },
    };
}

/**
 * One Quest per issue row. We load ALL rows: open issues are board cards,
 * completed-and-payable issues are payout quests, and findRewards decides
 * per-quest which case applies (see the TRADEOFF note above for why completed
 * issues also remain on the board).
 */
export async function loadQuests(
    ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    const rows = await ctx.db.select().from(schema.githubQuestIssues);
    return rows.map(toIssueQuest);
}
