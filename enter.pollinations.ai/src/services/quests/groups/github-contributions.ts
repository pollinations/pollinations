import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";
import { graphql } from "@shared/github/client.ts";
import type { QuestDefinition } from "../definitions.ts";
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
const ISSUE_REPORT_EXCLUDED_LABELS = new Set([
    QUEST_LABEL,
    "DRAFT-QUEST",
    "APP-SUBMISSION",
    "AUTOMATED",
]);
// Fixed 90-day lookback from launch; later visits must not move the cutoff.
const ISSUE_REPORT_START = Date.parse("2026-06-25T19:45:46Z");
const ISSUE_REPORT_EXCLUDED_TITLE =
    /\[(?:App|Project) Submission\]|^\[(?:Community(?: Model)? Publisher Access|QUEST)\]/i;
const REPO_OWNER = "pollinations";
const REPO_NAME = "pollinations";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
// Matches `### Reward\n<number>` in an issue body. Kept identical to the legacy
// GitHub Actions parser so already-parsed bounties keep their reward amount.
const QUEST_REWARD_REGEX = /###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i;
// An approved app submission can close a quest. The bot opens that catalog PR
// on an auto/app-<issue>- branch and credits the submitter as commit co-author.
// A GitHub user also owns the login "pollinations-ai", so the type must be Bot.
const APP_PUBLISH_BOT = "pollinations-ai";
const APP_PUBLISH_BRANCH = /^auto\/app-\d+-/;

const CONTRIBUTION_CATEGORY = "contribute" as const;
const SURVEY_TITLE_PREFIX = "[Bee Census]";

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

const reportedIssueQuest: QuestDefinition = {
    id: "reported_merged_issue",
    title: "Report an issue that gets fixed",
    description: `[Report a bug or suggest an improvement](https://github.com/${REPO}/issues/new/choose) in the Pollinations repository. Earn 3 Quest Pollen for each issue closed by a merged PR. App submissions and quest issues do not count.`,
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 3,
    balanceBucket: "tier",
    url: `https://github.com/${REPO}/issues/new/choose`,
};

const solveGithubIssueQuest: QuestDefinition = {
    id: "solve_github_issue",
    title: "Solve a quest issue in GitHub",
    description:
        "Pick an open POLLEN-QUEST issue and submit a focused PR. Each author of a merged PR that closes the issue earns the reward.",
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 0,
    balanceBucket: "tier",
    state: "coming_soon",
};

const beeCensusQuest: QuestDefinition = {
    id: "bee_census",
    title: "Take the Bee Census",
    description: `Answer a 3-minute [survey](https://github.com/${REPO}/issues/new?template=bee-census.yml) about what you build and what you need. One response per GitHub account.`,
    category: "community",
    scope: "perUser",
    rewardAmount: 3,
    balanceBucket: "tier",
    url: `https://github.com/${REPO}/issues/new?template=bee-census.yml`,
};

// A quest-shaped projection of one POLLEN-QUEST issue, computed from GitHub.
type DerivedQuestIssue = {
    issueNumber: number;
    title: string;
    description: string;
    url: string;
    rewardAmount: number | null;
    // "completed" issues stay off the open board once assigned or merged.
    state: "available" | "completed";
    completedByGithubIds: number[];
};

type GitHubUser = {
    databaseId?: number | null;
};

type ClosingPullRequest = {
    number: number;
    mergedAt: string | null;
    headRefName: string;
    author: (GitHubUser & { __typename: string; login: string }) | null;
};

type CommitAuthorsData = {
    repository: {
        pullRequest: {
            commits: {
                nodes: {
                    commit: {
                        authors: { nodes: { user: GitHubUser | null }[] };
                    };
                }[];
            };
        };
    };
};

type GitHubIssueNode = {
    number: number;
    state: "OPEN" | "CLOSED";
    title: string;
    url: string;
    body: string | null;
    labels: { nodes: { name: string }[] };
    assignees: { nodes: GitHubUser[] };
    closedByPullRequestsReferences: { nodes: ClosingPullRequest[] };
};

type GitHubPullRequestNode = {
    number: number;
    mergedAt: string | null;
};

type ReportedIssueNode = {
    number: number;
    title: string;
    url: string;
    author: GitHubUser | null;
    labels: { nodes: { name: string }[] };
    closedByPullRequestsReferences: { nodes: { mergedAt: string | null }[] };
};

type SearchData<TNode> = {
    search: {
        nodes: TNode[];
    };
};

type PaginatedSearchData<TNode> = {
    search: SearchData<TNode>["search"] & {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
};

// Multi-winner quests can keep pending submissions open alongside merged ones.
const QUEST_ISSUES_QUERY = `
query($query:String!){
  search(query:$query,type:ISSUE,first:100){
    nodes{
      ... on Issue{
        number state title url body
        labels(first:100){ nodes{ name } }
        assignees(first:1){ nodes{ databaseId } }
        closedByPullRequestsReferences(first:100){
          nodes{ number mergedAt headRefName author{ __typename login ... on User{ databaseId } } }
        }
      }
    }
  }
}`;

// Asked only for app-publish PRs: adding commit authors to the issue search
// multiplies its rate-limit cost about 200 times.
const COMMIT_AUTHORS_QUERY = `
query($number:Int!){
  repository(owner:"${REPO_OWNER}",name:"${REPO_NAME}"){
    pullRequest(number:$number){
      commits(first:1){ nodes{ commit{ authors(first:5){ nodes{ user{ databaseId } } } } } }
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

const REPORTED_ISSUES_QUERY = `
query($query:String!,$after:String){
  search(query:$query,type:ISSUE,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
    nodes{
      ... on Issue{
        number title url author{ ... on User{ databaseId } }
        labels(first:20){ nodes{ name } }
        closedByPullRequestsReferences(first:10){
          nodes{ mergedAt }
        }
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

function mergedClosers(issue: GitHubIssueNode) {
    return issue.closedByPullRequestsReferences.nodes.filter(
        (pr) => pr.mergedAt !== null,
    );
}

function isAppPublishPr(pr: ClosingPullRequest): boolean {
    return (
        pr.author?.__typename === "Bot" &&
        pr.author.login === APP_PUBLISH_BOT &&
        APP_PUBLISH_BRANCH.test(pr.headRefName)
    );
}

function githubIds(users: (GitHubUser | null)[]): number[] {
    return users.flatMap((user) =>
        typeof user?.databaseId === "number" ? [user.databaseId] : [],
    );
}

// The commit authors of an app-publish PR are the bot and the submitter; the
// bot has no Pollinations account, so only the submitter can be paid.
async function commitAuthorIds(
    token: string,
    number: number,
): Promise<number[]> {
    const data = await graphql<CommitAuthorsData>(token, COMMIT_AUTHORS_QUERY, {
        number,
    });
    return githubIds(
        data.repository.pullRequest.commits.nodes.flatMap((node) =>
            node.commit.authors.nodes.map((author) => author.user),
        ),
    );
}

function toDerivedQuestIssue(
    issue: GitHubIssueNode,
    appPublishPayees: Map<number, number[]>,
): DerivedQuestIssue {
    const body = issue.body ?? "";
    const closers = mergedClosers(issue);
    const state: DerivedQuestIssue["state"] =
        closers.length > 0 || issue.assignees.nodes.length > 0
            ? "completed"
            : "available";
    return {
        issueNumber: issue.number,
        title: issue.title,
        description: extractDescription(body),
        url: issue.url,
        rewardAmount: parseReward(body),
        state,
        completedByGithubIds: closers.flatMap((pr) =>
            isAppPublishPr(pr)
                ? (appPublishPayees.get(pr.number) ?? [])
                : githubIds([pr.author]),
        ),
    };
}

async function loadQuestIssues(token: string): Promise<DerivedQuestIssue[]> {
    const data = await graphql<SearchData<GitHubIssueNode>>(
        token,
        QUEST_ISSUES_QUERY,
        { query: `repo:${REPO} label:${QUEST_LABEL} is:issue` },
    );

    const issues = data.search.nodes
        .filter((issue) => hasQuestLabel(issue.labels.nodes))
        .filter(
            (issue) =>
                issue.state === "OPEN" || mergedClosers(issue).length > 0,
        );
    const appPublishPrs = issues
        .flatMap(mergedClosers)
        .filter(isAppPublishPr)
        .map((pr) => pr.number);
    const appPublishPayees = new Map(
        await Promise.all(
            appPublishPrs.map(
                async (number) =>
                    [number, await commitAuthorIds(token, number)] as const,
            ),
        ),
    );
    return issues
        .map((issue) => toDerivedQuestIssue(issue, appPublishPayees))
        .filter((issue) => issue.rewardAmount !== null);
}

function toIssueQuestDefinition(issue: DerivedQuestIssue): QuestDefinition {
    return {
        // Keep the issue-derived id stable; per-user reward keys add the
        // immutable GitHub id so each merged PR author can earn it once.
        id: `github:issue:${issue.issueNumber}`,
        title: `Ship bounty #${issue.issueNumber}: ${issue.title}`,
        description: `Help close this POLLEN-QUEST issue. ${issue.description}`,
        category: CONTRIBUTION_CATEGORY,
        scope: "perUser",
        rewardAmount: issue.rewardAmount ?? 0,
        balanceBucket: "tier",
        url: issue.url,
        state: issue.state,
    };
}

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const issues = await loadQuestIssues(await githubToken(ctx.env));
    return [
        questToCard(firstMergedPrQuest),
        questToCard(reportedIssueQuest),
        questToCard(solveGithubIssueQuest),
        questToCard(beeCensusQuest),
        ...issues.map((issue) => questToCard(toIssueQuestDefinition(issue))),
    ];
}

async function reportedIssueProposals(token: string, user: QuestUser) {
    if (!user.githubUsername || user.githubId === null) return [];

    const proposals: QuestEvaluation["proposals"] = [];
    let after: string | null = null;
    do {
        const data: PaginatedSearchData<ReportedIssueNode> = await graphql<
            PaginatedSearchData<ReportedIssueNode>
        >(token, REPORTED_ISSUES_QUERY, {
            query: `repo:${REPO} is:issue is:closed author:${user.githubUsername} updated:>=2026-06-25`,
            after,
        });
        for (const issue of data.search.nodes) {
            if (
                issue.author?.databaseId !== user.githubId ||
                ISSUE_REPORT_EXCLUDED_TITLE.test(issue.title) ||
                issue.labels.nodes.some((label) =>
                    ISSUE_REPORT_EXCLUDED_LABELS.has(label.name),
                ) ||
                !issue.closedByPullRequestsReferences.nodes.some(
                    (pr) =>
                        pr.mergedAt !== null &&
                        Date.parse(pr.mergedAt) >= ISSUE_REPORT_START,
                )
            ) {
                continue;
            }
            proposals.push({
                quest: {
                    ...reportedIssueQuest,
                    id: `github:reported_issue:${issue.number}`,
                    title: `Reported issue #${issue.number}: ${issue.title}`,
                    url: issue.url,
                },
                userId: user.id,
            });
        }
        after = data.search.pageInfo.hasNextPage
            ? data.search.pageInfo.endCursor
            : null;
    } while (after);
    return proposals;
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

async function answeredSurvey(
    token: string,
    user: QuestUser,
): Promise<boolean> {
    if (!user.githubUsername) return false;
    const data = await graphql<PaginatedSearchData<ReportedIssueNode>>(
        token,
        REPORTED_ISSUES_QUERY,
        {
            query: `repo:${REPO} is:issue author:${user.githubUsername} in:title "${SURVEY_TITLE_PREFIX}"`,
            after: null,
        },
    );
    return data.search.nodes.some(
        (issue) =>
            issue.author?.databaseId === user.githubId &&
            issue.title.startsWith(SURVEY_TITLE_PREFIX),
    );
}

export async function evaluateUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const githubId = user.githubId;
    if (githubId === null) return { proposals: [] };

    const token = await githubToken(ctx.env);
    const [issues, mergedPr, reportedIssues, surveyed] = await Promise.all([
        loadQuestIssues(token),
        hasMergedPr(token, user),
        reportedIssueProposals(token, user),
        answeredSurvey(token, user),
    ]);

    // Payable issue bounties: completed by a merged PR authored by the current
    // user's linked GitHub account, with a positive reward.
    const issueProposals = issues
        .filter(
            (issue) =>
                issue.completedByGithubIds.includes(githubId) &&
                (issue.rewardAmount ?? 0) > 0,
        )
        .map((issue) => ({
            quest: toIssueQuestDefinition(issue),
            userId: user.id,
        }));

    return {
        proposals: [
            ...issueProposals,
            ...reportedIssues,
            ...(mergedPr
                ? [{ quest: firstMergedPrQuest, userId: user.id }]
                : []),
            ...(surveyed ? [{ quest: beeCensusQuest, userId: user.id }] : []),
        ],
    };
}
