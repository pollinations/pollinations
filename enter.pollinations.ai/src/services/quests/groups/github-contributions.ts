import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";
import { graphql } from "@shared/github/client.ts";
import type { QuestDefinition, QuestState } from "../definitions.ts";
import {
    type QuestCard,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
} from "../types.ts";

/**
 * GitHub contribution rewards are checked lazily against GitHub itself. A
 * community bounty is a POLLEN-QUEST-labelled issue with a "### Reward" amount
 * in its body; it is payable once a merged PR closes it. There is no local
 * GitHub mirror and no materialized quest table.
 */

const QUEST_LABEL = "POLLEN-QUEST";
const REPO_OWNER = "pollinations";
const REPO_NAME = "pollinations";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
// Matches `### Reward\n<number>` in an issue body. Kept identical to the legacy
// GitHub Actions parser so already-parsed bounties keep their reward amount.
const QUEST_REWARD_REGEX = /###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i;

const CONTRIBUTION_CATEGORY = "contribute" as const;

const firstMergedPrQuest: QuestDefinition = {
    id: "merged_pr",
    title: "Contribute a pull request",
    description:
        "Your pull request got merged to the Pollinations [repository](https://github.com/pollinations/pollinations).",
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
};

const solveGithubIssueQuest: QuestDefinition = {
    id: "solve_github_issue",
    title: "Solve a quest issue in GitHub",
    description:
        "Pick an open POLLEN-QUEST issue and submit a focused PR. Multiple contributors may submit; the author of the selected merged PR earns the reward.",
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 0,
    balanceBucket: "tier",
    state: "coming_soon",
};

// A quest-shaped projection of one POLLEN-QUEST issue, computed from GitHub.
type DerivedQuestIssue = {
    issueNumber: number;
    title: string;
    description: string;
    url: string;
    rewardAmount: number | null;
    // "available" = open bounty; "completed" = closed by a merged PR.
    state: "available" | "completed";
    completedByGithubId: number | null;
};

type GitHubUser = {
    databaseId?: number;
};

type GitHubIssueNode = {
    number: number;
    state: "OPEN" | "CLOSED";
    title: string;
    url: string;
    body: string | null;
    labels: { nodes: { name: string }[] };
    closedByPullRequestsReferences: {
        nodes: {
            number: number;
            mergedAt: string | null;
            author: GitHubUser | null;
        }[];
    };
};

type GitHubPullRequestNode = {
    number: number;
    mergedAt: string | null;
};

type SearchData<TNode> = {
    search: {
        nodes: TNode[];
    };
};

const QUEST_ISSUES_QUERY = `
query($query:String!){
  search(query:$query,type:ISSUE,first:100){
    nodes{
      ... on Issue{
        number state title url body
        labels(first:100){ nodes{ name } }
        closedByPullRequestsReferences(first:10){
          nodes{ number mergedAt author{ ... on User{ databaseId } } }
        }
      }
    }
  }
}`;

const FIRST_MERGED_PR_QUERY = `
query($query:String!){
  search(query:$query,type:ISSUE,first:1){
    nodes{
      ... on PullRequest{
        number
        mergedAt
      }
    }
  }
}`;

async function githubToken(env: CloudflareBindings): Promise<string> {
    if (env.ENVIRONMENT === "test") return "mock_github_auth_token";
    return await getInstallationToken(
        githubAppCredentialsFromEnv(env),
        REPO_OWNER,
    );
}

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

function hasQuestLabel(labels: { name: string }[]): boolean {
    return labels.some((label) => label.name === QUEST_LABEL);
}

function firstMergedCloser(issue: GitHubIssueNode) {
    return (
        issue.closedByPullRequestsReferences.nodes
            .flatMap((pr) =>
                pr.mergedAt === null ? [] : [{ ...pr, mergedAt: pr.mergedAt }],
            )
            .sort((a, b) => a.mergedAt.localeCompare(b.mergedAt))[0] ?? null
    );
}

function toDerivedQuestIssue(issue: GitHubIssueNode): DerivedQuestIssue {
    const body = issue.body ?? "";
    const completedBy = firstMergedCloser(issue);
    const state: DerivedQuestIssue["state"] =
        completedBy !== null ? "completed" : "available";
    return {
        issueNumber: issue.number,
        title: issue.title,
        description: extractDescription(body),
        url: issue.url,
        rewardAmount: parseReward(body),
        state,
        completedByGithubId: completedBy?.author?.databaseId ?? null,
    };
}

async function loadQuestIssues(token: string): Promise<DerivedQuestIssue[]> {
    const data = await graphql<SearchData<GitHubIssueNode>>(
        token,
        QUEST_ISSUES_QUERY,
        { query: `repo:${REPO} label:${QUEST_LABEL} is:issue` },
    );

    return data.search.nodes
        .filter((issue) => hasQuestLabel(issue.labels.nodes))
        .filter(
            (issue) =>
                issue.state === "OPEN" || firstMergedCloser(issue) !== null,
        )
        .map(toDerivedQuestIssue)
        .filter((issue) => issue.rewardAmount !== null);
}

function issueState(issue: DerivedQuestIssue): QuestState {
    return issue.state;
}

function toIssueQuestDefinition(issue: DerivedQuestIssue): QuestDefinition {
    return {
        // Per-issue idempotency identity. The reward key for a scope:"once" quest
        // is `quest:${id}` (no userId), so `id` MUST be unique per issue or every
        // community bounty collapses to one key and only the first ever records.
        // Derive the id from issueNumber so the key remains stable across runs.
        id: `github:issue:${issue.issueNumber}`,
        title: `Ship bounty #${issue.issueNumber}: ${issue.title}`,
        description: `Help close this POLLEN-QUEST issue. ${issue.description}`,
        category: CONTRIBUTION_CATEGORY,
        scope: "once",
        rewardAmount: issue.rewardAmount ?? 0,
        balanceBucket: "tier",
        url: issue.url,
        state: issueState(issue),
    };
}

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const issues = await loadQuestIssues(await githubToken(ctx.env));
    return [
        questToCard(firstMergedPrQuest),
        questToCard(solveGithubIssueQuest),
        ...issues.map((issue) => questToCard(toIssueQuestDefinition(issue))),
    ];
}

async function hasMergedPr(token: string, user: QuestUser): Promise<boolean> {
    if (!user.githubUsername) return false;
    const data = await graphql<SearchData<GitHubPullRequestNode>>(
        token,
        FIRST_MERGED_PR_QUERY,
        {
            query: `repo:${REPO} is:pr is:merged author:${user.githubUsername}`,
        },
    );
    return data.search.nodes.some((pr) => pr.mergedAt !== null);
}

export async function evaluateUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    if (user.githubId === null) return { proposals: [] };

    const token = await githubToken(ctx.env);
    const [issues, mergedPr] = await Promise.all([
        loadQuestIssues(token),
        hasMergedPr(token, user),
    ]);

    // Payable issue bounties: completed by a merged PR authored by the current
    // user's linked GitHub account, with a positive reward.
    const issueProposals = issues
        .filter(
            (issue) =>
                issue.state === "completed" &&
                issue.completedByGithubId === user.githubId &&
                (issue.rewardAmount ?? 0) > 0,
        )
        .map((issue) => ({
            quest: toIssueQuestDefinition(issue),
            userId: user.id,
        }));

    return {
        proposals: [
            ...issueProposals,
            ...(mergedPr
                ? [{ quest: firstMergedPrQuest, userId: user.id }]
                : []),
        ],
    };
}
