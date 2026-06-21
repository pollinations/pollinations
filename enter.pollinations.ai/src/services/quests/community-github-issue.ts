import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    buildGitHubQuestRewardKey,
    COMMUNITY_GITHUB_QUEST_ID,
    GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
    GITHUB_QUEST_REWARD_SOURCE,
} from "@shared/quests/definitions.ts";
import { desc, sql } from "drizzle-orm";
import type { QuestDb, QuestInstance, QuestModule } from "./types.ts";

const MAX_GRANTS_PER_RUN = 500;

type CompletedGitHubQuestIssueRow = {
    userId: string;
    githubUsername: string | null;
    issueNumber: number;
    title: string;
    url: string;
    rewardAmount: number;
    balanceBucket: "pack" | "tier";
    assigneeGithubId: number;
    assigneeLogin: string | null;
    completedByPrNumber: number;
};

export const communityGitHubIssueQuest = {
    definition: {
        id: COMMUNITY_GITHUB_QUEST_ID,
        title: "Complete a GitHub quest issue",
        description: "Complete an open POLLEN-QUEST issue on GitHub.",
        iconId: "github",
        rewardAmount: 0,
        balanceBucket: GITHUB_QUEST_DEFAULT_BALANCE_BUCKET,
    },
    async evaluate({ db }) {
        return findGrants(db);
    },
    async instances({ db }) {
        return loadQuestInstances(db);
    },
} satisfies QuestModule;

async function loadQuestInstances(db: QuestDb): Promise<QuestInstance[]> {
    const rows = await db
        .select()
        .from(schema.githubQuestIssues)
        .orderBy(desc(schema.githubQuestIssues.githubUpdatedAt));

    return rows.map((issue) => ({
        id: `github:issue:${issue.issueNumber}`,
        kind: "github_issue",
        title: issue.title,
        description: issue.description ?? "",
        iconId: communityGitHubIssueQuest.definition.iconId,
        availability: githubIssueAvailability(issue.state),
        rewardAmount: issue.rewardAmount,
        url: issue.url,
        assignees: parseAssignees(issue.assigneesJson),
        sortKey:
            issue.githubUpdatedAt?.toISOString() ??
            issue.githubCreatedAt?.toISOString() ??
            "",
    }));
}

function githubIssueAvailability(state: string): QuestInstance["availability"] {
    if (state === "completed") return "completed";
    if (state === "claimed") return "claimed";
    return "available";
}

function parseAssignees(assigneesJson: string | null): string[] {
    if (!assigneesJson) return [];
    const parsed = JSON.parse(assigneesJson) as unknown;
    return Array.isArray(parsed)
        ? parsed.filter(
              (assignee): assignee is string => typeof assignee === "string",
          )
        : [];
}

async function findGrants(db: QuestDb): Promise<GrantRewardInput[]> {
    const rows = await db.all<CompletedGitHubQuestIssueRow>(
        sql`
        SELECT
            user.id AS userId,
            user.github_username AS githubUsername,
            github_quest_issues.issue_number AS issueNumber,
            github_quest_issues.title AS title,
            github_quest_issues.url AS url,
            github_quest_issues.reward_amount AS rewardAmount,
            github_quest_issues.balance_bucket AS balanceBucket,
            github_quest_issues.assignee_github_id AS assigneeGithubId,
            github_quest_issues.assignee_login AS assigneeLogin,
            github_quest_issues.completed_by_pr_number AS completedByPrNumber
        FROM github_quest_issues
        INNER JOIN user
            ON user.github_id = github_quest_issues.assignee_github_id
        LEFT JOIN reward_grants
            ON reward_grants.idempotency_key =
                ${"quest:"} ||
                github_quest_issues.issue_number
        WHERE github_quest_issues.quest_id = ${COMMUNITY_GITHUB_QUEST_ID}
            AND github_quest_issues.state = 'completed'
            AND github_quest_issues.reward_amount > 0
            AND github_quest_issues.completed_by_pr_number IS NOT NULL
            AND github_quest_issues.assignee_github_id IS NOT NULL
            AND reward_grants.id IS NULL
        LIMIT ${MAX_GRANTS_PER_RUN}`,
    );

    return rows.map((row) => ({
        userId: row.userId,
        idempotencyKey: buildGitHubQuestRewardKey({
            issueNumber: row.issueNumber,
        }),
        source: GITHUB_QUEST_REWARD_SOURCE,
        questId: COMMUNITY_GITHUB_QUEST_ID,
        amount: row.rewardAmount,
        bucket: row.balanceBucket,
        sourceRef: `pr:${row.completedByPrNumber}`,
        metadata: {
            title: communityGitHubIssueQuest.definition.title,
            issueNumber: row.issueNumber,
            issueTitle: row.title,
            issueUrl: row.url,
            prNumber: row.completedByPrNumber,
            role: "assignee",
            githubUsername: row.githubUsername ?? row.assigneeLogin,
        },
    }));
}
