import { getLogger } from "@logtape/logtape";
import { rewardKey } from "@shared/billing/rewards.ts";
import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";
import { graphql } from "@shared/github/client.ts";
import { type SQL, sql } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestDb,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
} from "../types.ts";

/**
 * GitHub contribution rewards are checked lazily against GitHub itself. There
 * is no local GitHub mirror and no materialized quest table.
 *
 * Amounts come only from reward-N labels, which only maintainers can add. A PR
 * merged into main earns its own label, else the bounty of the community quest
 * issue it closes, else 5. Every issue a merged PR closes earns its author 2,
 * also when they fixed it themselves.
 * Both are read from the quest issue: app submissions earn the quest's label,
 * else 5, and quest PRs merged before REWARDS_START earn the quest's label.
 */

const PR_REWARD = 5;
const ISSUE_REPORT_REWARD = 2;
// PRs merged before this earn the old one-time first-PR reward instead. Same
// date as REWARDS_START in operations/infrastructure/project-manager/project_manager.py.
const REWARDS_START = "2026-11-05T00:00:00Z";
const ISSUE_REPORT_EXCLUDED_LABELS = new Set([
    "DRAFT-QUEST",
    "APP-SUBMISSION",
    "AUTOMATED",
]);
// Fixed 90-day lookback from launch; later visits must not move the cutoff.
const ISSUE_REPORT_START = Date.parse("2026-06-25T19:45:46Z");
const ISSUE_REPORT_EXCLUDED_TITLE =
    /\[(?:App|Project) Submission\]|^\[Community(?: Model)? Publisher Access\]/i;
const REPO_OWNER = "pollinations";
const REPO_NAME = "pollinations";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
// The amounts of the reward-N labels; any other reward-N label is ignored.
const REWARD_AMOUNTS = [1, 3, 5, 10, 15, 25, 50];
// An approved app submission can close a quest. The bot opens that catalog PR
// on an auto/app-<issue>- branch and credits the submitter as commit co-author.
// A GitHub user also owns the login "pollinations-ai", so the type must be Bot.
const APP_PUBLISH_BOT = "pollinations-ai";
const APP_PUBLISH_BRANCH = /^auto\/app-\d+-/;

// The GitHub App's GraphQL budget is 5,000 points an hour, and listing the
// quest issues takes several queries. The catalog and every user's quest check
// share one copy, fetched at most once per window. When GitHub fails (e.g. rate
// limited), the last copy keeps serving and the next fetch waits a window.
// ponytail: refreshes are not coordinated, so a burst or another location can
// fetch again before the new copy is visible. Move the list to a Durable Object
// if those refreshes exhaust the budget.
const QUEST_ISSUES_CACHE_KEY = "quests:github-issues:v3";
const QUEST_ISSUES_CACHE_MS = 5 * 60 * 1000;

const log = getLogger(["enter", "quests"]);

const CONTRIBUTION_CATEGORY = "contribute" as const;
// Each survey issue form applies its label; responders can rename the title.
// Issue forms can only mark fields required, so the minimum length of the
// written answers (matched by their "### <label>" headings) is checked here.
type Survey = {
    label: string;
    writtenAnswers: string[];
    minWrittenChars: number;
};
const BEE_CENSUS: Survey = {
    label: "BEE-CENSUS",
    // The wishlist heading is the pre-2026-09-29 form.
    writtenAnswers: [
        "What did you last try to build that Pollinations couldn't do?",
        "What would make you pay this month?",
        "🪄 Wishlist — features or models you'd like on Pollinations",
    ],
    minWrittenChars: 60,
};
const HONEY_CENSUS: Survey = {
    label: "HONEY-CENSUS",
    writtenAnswers: [
        "What would make you use Pollinations more?",
        "Which other AI tools or services do you pay for, and what for?",
    ],
    minWrittenChars: 100,
};
// Buying only the smallest pack (2 Pollen) doesn't qualify for the Honey Census
// or pay a referral.
export const MIN_POLLEN_BOUGHT = 2;

// The catalog id doubles as the old first-PR reward, so accounts that already
// earned it are not paid again.
const mergedPrQuest: QuestDefinition = {
    id: "merged_pr",
    title: "Contribute a pull request",
    description: `Each pull request of yours merged into the Pollinations [repository](https://github.com/${REPO}) earns $${PR_REWARD}. A label on the PR, or on the quest it closes, can set another amount. [Connect GitHub](/account) so we can match your pull requests.`,
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    // Each merged PR is its own reward (github:merged_pr:N), kept on this card.
    repeatable: true,
    rewardAmount: PR_REWARD,
    balanceBucket: "tier",
};

const reportedIssueQuest: QuestDefinition = {
    id: "reported_merged_issue",
    title: "Report an issue that gets fixed",
    description: `[Report a bug or suggest an improvement](https://github.com/${REPO}/issues/new/choose) in the Pollinations repository. Each issue of yours closed by a merged PR earns $${ISSUE_REPORT_REWARD}, even if you fix it yourself. App submissions do not count.`,
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    // Each fixed issue is its own reward (github:reported_issue:N).
    repeatable: true,
    rewardAmount: ISSUE_REPORT_REWARD,
    balanceBucket: "tier",
    url: `https://github.com/${REPO}/issues/new/choose`,
};

const beeCensusQuest: QuestDefinition = {
    id: "bee_census",
    title: "Take the Bee Census",
    description: `Answer a 3-minute [survey](https://github.com/${REPO}/issues/new?template=bee-census.yml) about what you build and what you need. Your two written answers need at least ${BEE_CENSUS.minWrittenChars} characters in total. One response per GitHub account.`,
    category: "community",
    scope: "perUser",
    rewardAmount: 3,
    balanceBucket: "tier",
    url: `https://github.com/${REPO}/issues/new?template=bee-census.yml`,
    // Paused on 2026-09-30 after 55 responses: the form is removed and the
    // card is off the board; answers already given still pay. To reopen,
    // restore .github/ISSUE_TEMPLATE/bee-census.yml and delete this line.
    state: "completed",
};

const honeyCensusQuest: QuestDefinition = {
    id: "honey_census",
    title: "Take the Honey Census",
    description: `For anyone who has topped up more than $${MIN_POLLEN_BOUGHT} in total: answer a 3-minute [survey](https://github.com/${REPO}/issues/new?template=honey-census.yml). Your two written answers need at least ${HONEY_CENSUS.minWrittenChars} characters in total. One response per GitHub account.`,
    category: "community",
    scope: "perUser",
    rewardAmount: 5,
    balanceBucket: "tier",
    url: `https://github.com/${REPO}/issues/new?template=honey-census.yml`,
    // Paused on 2026-10-21 after 183 respondents: the form is removed and the
    // card is off the board; answers already given still pay. To reopen,
    // restore .github/ISSUE_TEMPLATE/honey-census.yml and delete this line.
    state: "completed",
};

// A quest-shaped projection of one community quest issue, computed from GitHub.
type DerivedQuestIssue = {
    issueNumber: number;
    title: string;
    description: string;
    url: string;
    // 0 without a reward label: the quest is off the board, and its PRs merged
    // from REWARDS_START pay the default.
    rewardAmount: number;
    // "completed" issues stay off the open board once assigned or closed.
    // Multi-winner quests are reopened after each merge and stay available.
    state: "available" | "completed";
    rewardPerPr: boolean;
    // Earlier merges and app-publish bot PRs are outside the author's PR search.
    historicalPrs: (MergedPr & { githubIds: number[] })[];
};

type GitHubUser = {
    databaseId?: number | null;
};

type ClosingPullRequest = {
    number: number;
    title: string;
    url: string;
    mergedAt: string | null;
    headRefName: string;
    baseRefName: string;
    repository: { nameWithOwner: string };
    author: (GitHubUser & { __typename: string; login: string }) | null;
};

type CommitAuthorsData = {
    repository: Record<
        string,
        {
            commits: {
                nodes: {
                    commit: {
                        authors: { nodes: { user: GitHubUser | null }[] };
                    };
                }[];
            };
        }
    >;
};

type GitHubIssueNode = {
    number: number;
    state: "OPEN" | "CLOSED";
    title: string;
    url: string;
    body: string | null;
    authorAssociation: string;
    labels: { nodes: { name: string }[] };
    assignees: { nodes: GitHubUser[] };
    closedByPullRequestsReferences: { nodes: ClosingPullRequest[] };
};

type GitHubPullRequestNode = {
    number: number;
    mergedAt: string | null;
};

type MergedPr = {
    number: number;
    title: string;
    url: string;
    mergedAt: string;
};

type MergedPrNode = MergedPr & {
    author: GitHubUser | null;
    labels: { nodes: { name: string }[] };
    closingIssuesReferences: {
        nodes: { number: number; repository: { nameWithOwner: string } }[];
    };
};

type PrRewardCandidate = {
    pr: MergedPr;
    closes: number[];
    labelAmount: number;
};

type ReportedIssueNode = {
    number: number;
    title: string;
    url: string;
    createdAt: string;
    author: GitHubUser | null;
    labels: { nodes: { name: string }[] };
    closedByPullRequestsReferences: {
        nodes: {
            mergedAt: string | null;
            repository: { nameWithOwner: string };
        }[];
    };
    timelineItems: {
        nodes: ({
            willCloseTarget: boolean;
            source: {
                mergedAt: string | null;
                repository: { nameWithOwner: string };
            } | null;
        } | null)[];
    };
};

type SurveyIssueNode = {
    body: string;
    author: GitHubUser | null;
};

type SearchData<TNode> = {
    search: {
        nodes: TNode[];
    };
};

type Page<T> = {
    nodes: T[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

// Read label membership directly: GitHub search can lag behind a label rename.
// Include closed issues because their merged PRs can still be claimed.
const QUEST_ISSUES_QUERY = `
query QuestIssues($after:String){
  repository(owner:"${REPO_OWNER}",name:"${REPO_NAME}"){
    label(name:"QUEST"){
      issues(first:100,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){
        pageInfo{ hasNextPage endCursor }
        nodes{
          number state title url body authorAssociation
          labels(first:100){ nodes{ name } }
          assignees(first:1){ nodes{ databaseId } }
          closedByPullRequestsReferences(first:100){
            nodes{ number title url mergedAt headRefName baseRefName repository{ nameWithOwner } author{ __typename login ... on User{ databaseId } } }
          }
        }
      }
    }
  }
}`;

// Asked only for app-publish PRs: adding commit authors to the issue query
// multiplies its rate-limit cost about 200 times. One aliased query covers
// every app-publish PR for one point; a query per PR cost a point each.
function commitAuthorsQuery(numbers: number[]): string {
    const pullRequests = numbers.map(
        (number) =>
            `pr${number}:pullRequest(number:${number}){ commits(first:1){ nodes{ commit{ authors(first:5){ nodes{ user{ databaseId } } } } } } }`,
    );
    return `query{ repository(owner:"${REPO_OWNER}",name:"${REPO_NAME}"){ ${pullRequests.join(" ")} } }`;
}

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

// Closing issue numbers and repositories only: their labels would cost about
// ten times more, and the cached quest issues already carry the bounties.
// Asking for 100 labels and closing issues costs the same 2 points as 10.
const MERGED_PRS_QUERY = `
query($query:String!,$after:String){
  search(query:$query,type:ISSUE,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
    nodes{
      ... on PullRequest{
        number title url mergedAt author{ ... on User{ databaseId } }
        labels(first:100){ nodes{ name } }
        closingIssuesReferences(first:100){
          nodes{ number repository{ nameWithOwner } }
        }
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
        number title url createdAt author{ ... on User{ databaseId } }
        labels(first:20){ nodes{ name } }
        closedByPullRequestsReferences(first:10){
          nodes{ mergedAt repository{ nameWithOwner } }
        }
        timelineItems(first:100,itemTypes:[CROSS_REFERENCED_EVENT]){
          nodes{
            ... on CrossReferencedEvent{
              willCloseTarget
              source{ ... on PullRequest{ mergedAt repository{ nameWithOwner } } }
            }
          }
        }
      }
    }
  }
}`;

const SURVEY_QUERY = `
query($query:String!){
  search(query:$query,type:ISSUE,first:10){
    nodes{ ... on Issue{ body author{ ... on User{ databaseId } } } }
  }
}`;

async function githubToken(env: CloudflareBindings): Promise<string> {
    if (env.ENVIRONMENT === "test") return "mock_github_auth_token";
    return await getInstallationToken(
        githubAppCredentialsFromEnv(env),
        REPO_OWNER,
    );
}

// The highest reward-N label, or 0 without one.
function labelReward(labels: { name: string }[]): number {
    const names = new Set(labels.map((label) => label.name));
    return Math.max(
        0,
        ...REWARD_AMOUNTS.filter((amount) => names.has(`reward-${amount}`)),
    );
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

// PRs merged into this repository's main branch; a fork's PR can close an issue too.
function mergedClosers(issue: GitHubIssueNode) {
    return issue.closedByPullRequestsReferences.nodes.filter(
        (pr): pr is ClosingPullRequest & { mergedAt: string } =>
            pr.mergedAt !== null &&
            pr.repository.nameWithOwner === REPO &&
            pr.baseRefName === "main",
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
    numbers: number[],
): Promise<Map<number, number[]>> {
    if (numbers.length === 0) return new Map();
    const data = await graphql<CommitAuthorsData>(
        token,
        commitAuthorsQuery(numbers),
        {},
    );
    return new Map(
        numbers.map((number) => [
            number,
            githubIds(
                data.repository[`pr${number}`].commits.nodes.flatMap((node) =>
                    node.commit.authors.nodes.map((author) => author.user),
                ),
            ),
        ]),
    );
}

function toDerivedQuestIssue(
    issue: GitHubIssueNode,
    appPublishPayees: Map<number, number[]>,
): DerivedQuestIssue {
    const body = issue.body ?? "";
    const rewardAmount = labelReward(issue.labels.nodes);
    // Only the published per-merge wording on maintainer-owned quests opts in.
    const rewardPerPr =
        ["OWNER", "MEMBER", "COLLABORATOR"].includes(issue.authorAssociation) &&
        (body.includes(
            "**This quest can have several winners:** every merged PR",
        ) ||
            body.includes(": every merged agent earns the full reward."));
    const historicalPrs = mergedClosers(issue).flatMap((pr) => {
        const early = pr.mergedAt < REWARDS_START;
        if (early && rewardAmount === 0) return [];
        const payees = isAppPublishPr(pr)
            ? (appPublishPayees.get(pr.number) ?? [])
            : early
              ? githubIds([pr.author])
              : [];
        return payees.length
            ? [
                  {
                      number: pr.number,
                      title: pr.title,
                      url: pr.url,
                      mergedAt: pr.mergedAt,
                      githubIds: payees,
                  },
              ]
            : [];
    });
    const state: DerivedQuestIssue["state"] =
        issue.state === "CLOSED" || issue.assignees.nodes.length > 0
            ? "completed"
            : "available";
    return {
        issueNumber: issue.number,
        title: issue.title,
        description: extractDescription(body),
        url: issue.url,
        rewardAmount,
        state,
        rewardPerPr,
        historicalPrs,
    };
}

async function allPages<T>(
    fetchPage: (after: string | null) => Promise<Page<T>>,
): Promise<T[]> {
    const nodes: T[] = [];
    let after: string | null = null;
    do {
        const page = await fetchPage(after);
        nodes.push(...page.nodes);
        after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    return nodes;
}

function searchAll<T>(
    token: string,
    query: string,
    search: string,
): Promise<T[]> {
    return allPages<T>(async (after) => {
        const data = await graphql<{ search: Page<T> }>(token, query, {
            query: search,
            after,
        });
        return data.search;
    });
}

async function loadQuestIssues(token: string): Promise<DerivedQuestIssue[]> {
    const issues = await allPages<GitHubIssueNode>(async (after) => {
        const data = await graphql<{
            repository: {
                label: { issues: Page<GitHubIssueNode> } | null;
            } | null;
        }>(token, QUEST_ISSUES_QUERY, { after });
        if (!data.repository?.label)
            throw new Error("GitHub QUEST label unavailable");
        return data.repository.label.issues;
    });

    // Quests without a reward label stay too: their PRs then keep the quest's
    // reward id, so a label added after a payout can't pay a second time.
    const filteredIssues = issues.filter(
        (issue) => issue.state === "OPEN" || mergedClosers(issue).length > 0,
    );
    const appPublishPrs = new Set(
        filteredIssues
            .flatMap(mergedClosers)
            .filter(isAppPublishPr)
            .map((pr) => pr.number),
    );
    const appPublishPayees = await commitAuthorIds(token, [...appPublishPrs]);
    return filteredIssues.map((issue) =>
        toDerivedQuestIssue(issue, appPublishPayees),
    );
}

async function cachedQuestIssues(
    env: CloudflareBindings,
): Promise<DerivedQuestIssue[]> {
    const cached = await env.KV.get<{
        issues: DerivedQuestIssue[];
        checkedAt: number;
    }>(QUEST_ISSUES_CACHE_KEY, "json");
    if (cached && Date.now() - cached.checkedAt < QUEST_ISSUES_CACHE_MS) {
        return cached.issues;
    }

    let issues: DerivedQuestIssue[];
    try {
        issues = await loadQuestIssues(await githubToken(env));
    } catch (error) {
        if (!cached) throw error;
        log.warn("Serving cached quest issues; GitHub failed: {error}", {
            error,
        });
        issues = cached.issues;
    }
    await env.KV.put(
        QUEST_ISSUES_CACHE_KEY,
        JSON.stringify({ issues, checkedAt: Date.now() }),
    ).catch((error) =>
        log.warn("Quest issue cache write failed: {error}", { error }),
    );
    return issues;
}

// The "[QUEST]" tag GitHub issue titles carry; the card doesn't repeat it.
const QUEST_TAG = /\[(?:POLLEN-)?QUEST\]:?\s*/i;

function toIssueQuestDefinition(issue: DerivedQuestIssue): QuestDefinition {
    return {
        // Keep the issue-derived id stable; per-user reward keys add the
        // immutable GitHub id so each merged PR author can earn it once.
        id: `github:issue:${issue.issueNumber}`,
        title: issue.title.replace(QUEST_TAG, "").trim(),
        description: `Help close this community quest. ${issue.description}`,
        category: CONTRIBUTION_CATEGORY,
        scope: "perUser",
        rewardAmount: issue.rewardAmount || PR_REWARD,
        balanceBucket: "tier",
        url: issue.url,
        state: issue.state,
    };
}

export async function listQuestCards(
    ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    const issues = await cachedQuestIssues(ctx.env);
    return [
        questToCard(mergedPrQuest),
        questToCard(reportedIssueQuest),
        questToCard(beeCensusQuest),
        questToCard(honeyCensusQuest),
        // A quest shows on the board once it has a reward label.
        ...issues
            .filter((issue) => issue.rewardAmount > 0)
            .map((issue) => questToCard(toIssueQuestDefinition(issue))),
    ];
}

async function reportedIssueProposals(token: string, user: QuestUser) {
    if (!user.githubUsername || user.githubId === null) return [];

    const issues = await searchAll<ReportedIssueNode>(
        token,
        REPORTED_ISSUES_QUERY,
        `repo:${REPO} is:issue is:closed author:${user.githubUsername} updated:>=2026-06-25`,
    );
    const proposals: QuestEvaluation["proposals"] = [];
    for (const issue of issues) {
        if (
            issue.author?.databaseId !== user.githubId ||
            ISSUE_REPORT_EXCLUDED_TITLE.test(issue.title) ||
            issue.labels.nodes.some((label) =>
                ISSUE_REPORT_EXCLUDED_LABELS.has(label.name),
            )
        ) {
            continue;
        }
        // A manual close can win the merge race and leave the direct closer
        // list empty; keep GitHub's closing-keyword intent.
        const closingPullRequests = [
            ...issue.closedByPullRequestsReferences.nodes,
            ...issue.timelineItems.nodes.flatMap((event) =>
                event?.willCloseTarget && event.source ? [event.source] : [],
            ),
        ];
        // Only a merge into this repository after the issue opened fixed it.
        const fixed = closingPullRequests.some(
            (pr) =>
                pr.mergedAt !== null &&
                pr.repository.nameWithOwner === REPO &&
                Date.parse(pr.mergedAt) >= Date.parse(issue.createdAt) &&
                Date.parse(pr.mergedAt) >= ISSUE_REPORT_START,
        );
        if (!fixed) continue;
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
    return proposals;
}

// ponytail: search returns at most 1,000 PRs. They come newest first, so only
// PRs nobody checked for a long time can fall off; page by date if that bites.
async function mergedPrsSinceStart(
    token: string,
    user: QuestUser,
): Promise<MergedPrNode[]> {
    if (!user.githubUsername) return [];
    const prs = await searchAll<MergedPrNode>(
        token,
        MERGED_PRS_QUERY,
        `repo:${REPO} is:pr is:merged base:main author:${user.githubUsername} merged:>=${REWARDS_START} sort:created-desc`,
    );
    return prs.filter((pr) => pr.author?.databaseId === user.githubId);
}

// The old one-time reward for a first merged PR.
async function hasMergedPr(token: string, user: QuestUser): Promise<boolean> {
    if (!user.githubUsername) return false;
    const data = await graphql<SearchData<GitHubPullRequestNode>>(
        token,
        FIRST_MERGED_PR_QUERY,
        {
            query: `repo:${REPO} is:pr is:merged author:${user.githubUsername} merged:<${REWARDS_START}`,
        },
    );
    return data.search.nodes.some((pr) => pr.mergedAt !== null);
}

async function answeredSurvey(
    token: string,
    user: QuestUser,
    survey: Survey,
): Promise<boolean> {
    if (!user.githubUsername) return false;
    const data = await graphql<SearchData<SurveyIssueNode>>(
        token,
        SURVEY_QUERY,
        {
            query: `repo:${REPO} is:issue author:${user.githubUsername} label:${survey.label}`,
        },
    );
    return data.search.nodes.some(
        (issue) =>
            issue.author?.databaseId === user.githubId &&
            writtenAnswerLength(issue.body, survey) >= survey.minWrittenChars,
    );
}

// Visible characters written under the survey's free-text headings. Invisible
// format characters (e.g. U+200E) and repeated whitespace don't count.
function writtenAnswerLength(body: string, survey: Survey): number {
    let length = 0;
    for (const section of body.split(/^### /m).slice(1)) {
        const [heading, ...answer] = section.split("\n");
        if (survey.writtenAnswers.includes(heading.trim())) {
            length += answer
                .join("\n")
                .replace(/\p{Cf}/gu, "")
                .replace(/\s+/g, " ")
                .trim().length;
        }
    }
    return length;
}

// Pollen bought in total: Stripe checkouts, paid auto top-ups, and Polar
// orders from before Stripe. `userId` is a value or an outer query's column.
export function pollenBoughtSql(userId: string | SQL): SQL {
    return sql`(
            (SELECT COALESCE(SUM(pollen_credited), 0) FROM stripe_checkout_credits
             WHERE user_id = ${userId})
          + (SELECT COALESCE(SUM(amount_usd), 0) FROM stripe_auto_top_up_attempt
             WHERE user_id = ${userId} AND status = 'paid')
          + (SELECT COALESCE(SUM(pollen_credited), 0) FROM polar_checkout_credits
             WHERE user_id = ${userId}))`;
}

// Old issue rewards keep their GitHub-scoped key after an account is deleted.
function earnedPrRewards(db: QuestDb, userId: string, legacyKeys: string[]) {
    return db.all<{
        quest_id: string | null;
        earned_at: number;
        url: string | null;
    }>(sql`
        SELECT quest_id, earned_at, url FROM rewards
        WHERE user_id = ${userId}
           OR idempotency_key IN (SELECT value FROM json_each(${JSON.stringify(legacyKeys)}))
        ORDER BY earned_at
    `);
}

async function pollenBought(db: QuestDb, userId: string): Promise<number> {
    const [row] = await db.all<{ total: number }>(
        sql`SELECT ${pollenBoughtSql(userId)} AS total`,
    );
    return row?.total ?? 0;
}

export async function evaluateUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const githubId = user.githubId;
    if (githubId === null) return { proposals: [] };

    const token = await githubToken(ctx.env);
    const [
        issues,
        mergedPrs,
        mergedPr,
        reportedIssues,
        beeCensus,
        honeyCensus,
    ] = await Promise.all([
        cachedQuestIssues(ctx.env),
        mergedPrsSinceStart(token, user),
        hasMergedPr(token, user),
        reportedIssueProposals(token, user),
        answeredSurvey(token, user, BEE_CENSUS),
        pollenBought(ctx.db, user.id).then(
            (bought) =>
                bought > MIN_POLLEN_BOUGHT &&
                answeredSurvey(token, user, HONEY_CENSUS),
        ),
    ]);

    // A PR's own label wins, then the highest quest bounty, then the default.
    const quests = new Map(issues.map((issue) => [issue.issueNumber, issue]));
    const historical = new Map<number, PrRewardCandidate>();
    for (const issue of issues) {
        for (const winner of issue.historicalPrs) {
            if (!winner.githubIds.includes(githubId)) continue;
            const candidate = historical.get(winner.number);
            if (candidate) {
                candidate.closes.push(issue.issueNumber);
            } else {
                historical.set(winner.number, {
                    pr: winner,
                    closes: [issue.issueNumber],
                    labelAmount: 0,
                });
            }
        }
    }
    const historicalCandidates = [...historical.values()].filter(({ closes }) =>
        closes.some((number) => quests.get(number)?.rewardPerPr),
    );
    const historicalPrNumbers = new Set(
        historicalCandidates.map(({ pr }) => pr.number),
    );
    const issueProposals = issues
        .filter(
            (issue) =>
                !issue.rewardPerPr &&
                issue.historicalPrs.some(
                    (pr) =>
                        pr.githubIds.includes(githubId) &&
                        !historicalPrNumbers.has(pr.number),
                ),
        )
        .map((issue) => ({
            quest: toIssueQuestDefinition(issue),
            userId: user.id,
        }));
    const candidates: PrRewardCandidate[] = [
        ...mergedPrs.map((pr) => ({
            pr,
            closes: pr.closingIssuesReferences.nodes
                .filter((issue) => issue.repository.nameWithOwner === REPO)
                .map((issue) => issue.number),
            labelAmount: labelReward(pr.labels.nodes),
        })),
        ...historicalCandidates,
    ];
    const legacyIds = new Set<string>();
    for (const { closes } of candidates) {
        if (!closes.some((number) => quests.get(number)?.rewardPerPr)) continue;
        legacyIds.add(mergedPrQuest.id);
        for (const number of closes) legacyIds.add(`github:issue:${number}`);
    }
    const rewardRows = await earnedPrRewards(
        ctx.db,
        user.id,
        [...legacyIds].map((id) => rewardKey(id, { githubId })),
    );
    const earned = new Map(
        rewardRows.map((row) => [row.quest_id, row.earned_at]),
    );
    const earnedUrls = new Set(
        rewardRows.map((row) => row.url?.split(/[?#]/, 1)[0]),
    );

    // The old one-time reward covers the earliest post-cutoff merge when the
    // author had no pre-cutoff merge. Preserve that credit across the change.
    const firstPr = mergedPr
        ? undefined
        : mergedPrs.reduce<MergedPrNode | undefined>(
              (first, pr) =>
                  first && first.mergedAt <= pr.mergedAt ? first : pr,
              undefined,
          );
    const prProposals = candidates.flatMap(({ pr, closes, labelAmount }) => {
        const prId = `github:merged_pr:${pr.number}`;
        if (
            earned.has(prId) ||
            earnedUrls.has(pr.url) ||
            (pr.number === firstPr?.number && earned.has(mergedPrQuest.id))
        )
            return [];

        const quest = closes
            .flatMap((number) => quests.get(number) ?? [])
            .sort((a, b) => b.rewardAmount - a.rewardAmount)[0];
        const mergedAt = Date.parse(pr.mergedAt) / 1000;
        if (
            closes.some((number) => {
                const earnedAt = earned.get(`github:issue:${number}`);
                // A legacy issue reward has no PR number. It may cover any PR
                // merged when it was recorded, including a still-pending claim.
                return (
                    earnedAt !== undefined &&
                    (!quest?.rewardPerPr || mergedAt <= earnedAt)
                );
            })
        )
            return [];

        const definition =
            quest && !quest.rewardPerPr
                ? toIssueQuestDefinition(quest)
                : {
                      ...mergedPrQuest,
                      id: prId,
                      title: `Merged PR #${pr.number}: ${pr.title}`,
                      url: pr.url,
                      rewardAmount: quest?.rewardAmount || PR_REWARD,
                  };
        return [
            {
                quest: {
                    ...definition,
                    rewardAmount: labelAmount || definition.rewardAmount,
                },
                userId: user.id,
            },
        ];
    });

    return {
        proposals: [
            ...issueProposals,
            ...prProposals,
            ...reportedIssues,
            ...(mergedPr ? [{ quest: mergedPrQuest, userId: user.id }] : []),
            ...(beeCensus ? [{ quest: beeCensusQuest, userId: user.id }] : []),
            ...(honeyCensus
                ? [{ quest: honeyCensusQuest, userId: user.id }]
                : []),
        ],
    };
}
