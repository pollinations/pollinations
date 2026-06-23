import * as schema from "@shared/db/better-auth.ts";
import { eq, inArray, isNotNull, like } from "drizzle-orm";
import type { QuestAvailability, QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestDb,
    type QuestEvaluationContext,
    questToCard,
    type RewardProposal,
} from "../types.ts";

/**
 * GitHub contribution rewards, derived directly from the gh_* repo mirror
 * (gh_issues + gh_pr_closing_issues + gh_pull_requests). A community bounty is
 * a POLLEN-QUEST-labelled issue with a "### Reward" amount in its body; it is
 * "completed" once a merged PR closes it. Each such issue is its own
 * scope:"once" quest paying the assignee. The static merged-PR quest uses the
 * same mirror but reads merged PR authors directly from gh_pull_requests.
 *
 * There is no materialized quest table — the mirror IS the source of truth.
 */

const QUEST_LABEL = "POLLEN-QUEST";
// Matches `### Reward\n<number>` in an issue body. Kept identical to the legacy
// GitHub Actions parser so already-parsed bounties keep their reward amount.
const QUEST_REWARD_REGEX = /###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i;

const BUILD_CATEGORY = "build" as const;

const firstMergedPrQuest: QuestDefinition = {
    id: "github:first_merged_pr",
    title: "First merged PR",
    description: "A pull request of yours was merged into Pollinations.",
    category: BUILD_CATEGORY,
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

// A quest-shaped projection of one POLLEN-QUEST issue, computed from the mirror.
type DerivedQuestIssue = {
    issueNumber: number;
    title: string;
    description: string;
    url: string;
    rewardAmount: number | null;
    // "available" = open bounty; "completed" = closed by a merged PR.
    state: "available" | "completed";
    assigneeGithubId: number | null;
    completedByPrNumber: number | null;
};

function parseReward(body: string): number | null {
    const match = body.match(QUEST_REWARD_REGEX);
    return match ? Number(match[1]) : null;
}

// Pull a short human description out of the issue body: prefer a Goal/Scope
// section, else compact the whole body. Mirrors the legacy Actions extractor.
function extractDescription(body: string): string {
    const preferred = body.match(
        /(?:^|\n)#{2,4}\s*(?:goal|quest goal|scope|what to build)[^\n]*\n+([\s\S]*?)(?=\n#{2,4}\s|\n---|$)/i,
    );
    if (preferred?.[1]) {
        const section = compactMarkdown(preferred[1]);
        if (section) return truncate(section, 260);
    }
    return truncate(compactMarkdown(body), 260);
}

function compactMarkdown(markdown: string): string {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function hasQuestLabel(labelsJson: string | null): boolean {
    if (!labelsJson) return false;
    try {
        const labels = JSON.parse(labelsJson);
        return Array.isArray(labels) && labels.includes(QUEST_LABEL);
    } catch {
        return false;
    }
}

// issueNumber -> the merged PR that closed it (lowest PR number for
// determinism when several merged PRs reference the same issue).
async function loadMergedCloserByIssue(
    db: QuestDb,
): Promise<Map<number, number>> {
    const edges = await db
        .select({
            prNumber: schema.ghPrClosingIssues.prNumber,
            issueNumber: schema.ghPrClosingIssues.issueNumber,
        })
        .from(schema.ghPrClosingIssues)
        .innerJoin(
            schema.ghPullRequests,
            eq(schema.ghPullRequests.number, schema.ghPrClosingIssues.prNumber),
        )
        .where(isNotNull(schema.ghPullRequests.mergedAt));

    const byIssue = new Map<number, number>();
    for (const { issueNumber, prNumber } of edges) {
        const existing = byIssue.get(issueNumber);
        if (existing === undefined || prNumber < existing) {
            byIssue.set(issueNumber, prNumber);
        }
    }
    return byIssue;
}

// Derive every POLLEN-QUEST bounty from the mirror.
async function loadQuestIssues(db: QuestDb): Promise<DerivedQuestIssue[]> {
    // labels_json is a JSON-array string; SQLite can't index a substring match,
    // so prefilter on the substring then confirm by parsing (kills
    // "POLLEN-QUEST-DRAFT" and similar false positives).
    const rows = await db
        .select()
        .from(schema.ghIssues)
        .where(like(schema.ghIssues.labelsJson, `%"${QUEST_LABEL}"%`));

    const closerByIssue = await loadMergedCloserByIssue(db);

    return rows
        .filter((row) => hasQuestLabel(row.labelsJson))
        .map((row) => {
            const body = row.body ?? "";
            const completedByPrNumber = closerByIssue.get(row.number) ?? null;
            return {
                issueNumber: row.number,
                title: row.title,
                description: extractDescription(body),
                url: row.url,
                rewardAmount: parseReward(body),
                state:
                    completedByPrNumber !== null || row.state === "closed"
                        ? "completed"
                        : "available",
                assigneeGithubId: row.assigneeGithubId,
                completedByPrNumber,
            };
        });
}

// Availability is a two-state BOARD concept: "available" = an open bounty
// anyone can take; "completed" = off the open board. Only a genuinely open
// issue (not completed, nobody assigned) is shown; the moment it's claimed
// (someone's working it) or completed it leaves the board — it reappears only
// for the user who earned it, via their reward (see the frontend). So both
// claimed and completed map to "completed" (off-board).
function issueAvailability(issue: DerivedQuestIssue): QuestAvailability {
    const open = issue.state === "available" && issue.assigneeGithubId === null;
    return open ? "available" : "completed";
}

function toIssueQuestDefinition(issue: DerivedQuestIssue): QuestDefinition {
    return {
        // Per-issue idempotency identity. The reward key for a scope:"once" quest
        // is `quest:${id}` (no userId), so `id` MUST be unique per issue or every
        // community bounty collapses to one key and only the first ever records.
        // Derive the id from issueNumber so the key remains stable across runs.
        id: `github:issue:${issue.issueNumber}`,
        title: issue.title,
        description: issue.description,
        category: BUILD_CATEGORY,
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
    const issues = await loadQuestIssues(ctx.db);
    return [
        questToCard(firstMergedPrQuest),
        ...issues.map((issue) => questToCard(toIssueQuestDefinition(issue))),
    ];
}

export async function findRewardProposals(
    ctx: QuestEvaluationContext,
): Promise<RewardProposal[]> {
    const issues = await loadQuestIssues(ctx.db);

    // Payable issue bounties: completed by a merged PR, with a positive reward
    // and an assignee that maps to a known user.
    const payable = issues.filter(
        (issue) =>
            issue.state === "completed" &&
            issue.completedByPrNumber !== null &&
            issue.assigneeGithubId !== null &&
            (issue.rewardAmount ?? 0) > 0,
    );

    // Resolve assignee github ids -> user ids in one pass.
    const assigneeIds = [
        ...new Set(
            payable
                .map((issue) => issue.assigneeGithubId)
                .filter((id): id is number => id !== null),
        ),
    ];
    const userByGithubId = new Map<number, string>();
    if (assigneeIds.length > 0) {
        const users = await ctx.db
            .select({ id: schema.user.id, githubId: schema.user.githubId })
            .from(schema.user)
            .where(inArray(schema.user.githubId, assigneeIds));
        for (const u of users) {
            if (u.githubId !== null) userByGithubId.set(u.githubId, u.id);
        }
    }

    const issueProposals: RewardProposal[] = [];
    for (const issue of payable) {
        const userId =
            issue.assigneeGithubId !== null
                ? userByGithubId.get(issue.assigneeGithubId)
                : undefined;
        if (!userId) continue;
        issueProposals.push({
            quest: toIssueQuestDefinition(issue),
            userId,
        });
    }

    const mergedPrRows = await ctx.db
        .selectDistinct({
            userId: schema.user.id,
        })
        .from(schema.ghPullRequests)
        .innerJoin(
            schema.user,
            eq(schema.user.githubId, schema.ghPullRequests.authorGithubId),
        )
        .where(isNotNull(schema.ghPullRequests.mergedAt));

    return [
        ...issueProposals,
        ...mergedPrRows.map(({ userId }) => ({
            quest: firstMergedPrQuest,
            userId,
        })),
    ];
}
