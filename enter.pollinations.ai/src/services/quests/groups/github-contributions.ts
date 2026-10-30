import { getLogger } from "@logtape/logtape";
import {
    getInstallationToken,
    githubAppCredentialsFromEnv,
} from "@shared/github/app-auth.ts";
import { graphql } from "@shared/github/client.ts";
import { sql } from "drizzle-orm";
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
 * GitHub contribution rewards are checked lazily against GitHub itself. A
 * community bounty is a POLLEN-QUEST-labelled issue with a "### Reward" amount
 * in its body; it is payable once a merged PR closes it. There is no local
 * GitHub mirror and no materialized quest table.
 *
 * Other merged PRs and fixed issues earn the amount the project manager quoted
 * when the item was opened, in a comment signed with CONTRIBUTION_REWARD_KEY.
 * Elliot or Thomas can replace that amount with a `Reward: N` comment.
 */

const QUEST_LABEL = "POLLEN-QUEST";
const REWARD_MAINTAINERS = new Set([5099901, 36901823]); // Thomas, Elliot
const REWARD_MARKER = "<!-- pollinations-reward -->";
const CONTRIBUTION_REWARD_LIMIT = 100;
// Issues and PRs opened before this keep the old fixed rewards: 3 for each
// reported issue a merged PR fixes, 5 for a first merged PR. Same date as
// REWARDS_START in operations/github/project_manager.py.
const REWARDS_START = "2026-11-02T00:00:00Z";
const LEGACY_REPORTED_ISSUE_REWARD = 3;
const LEGACY_FIRST_PR_REWARD = 5;
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
// Matches `### Reward\n<number>` in an issue body. Kept identical to the legacy
// GitHub Actions parser so already-parsed bounties keep their reward amount.
const QUEST_REWARD_REGEX = /###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i;
// An approved app submission can close a quest. The bot opens that catalog PR
// on an auto/app-<issue>- branch and credits the submitter as commit co-author.
// The same bot posts reward quotes. A GitHub user also owns the login
// "pollinations-ai", so the type must be Bot.
const POLLINATIONS_BOT = "pollinations-ai";
const APP_PUBLISH_BRANCH = /^auto\/app-\d+-/;

// The GitHub App's GraphQL budget is 5,000 points an hour, and listing the
// POLLEN-QUEST issues costs about 10. The catalog and every user's quest check
// share one copy, fetched at most once per window. When GitHub fails (e.g. rate
// limited), the last copy keeps serving and the next fetch waits a window.
// ponytail: refreshes are not coordinated, so a burst or another location can
// fetch again before the new copy is visible. Move the list to a Durable Object
// if those refreshes exhaust the budget.
const QUEST_ISSUES_CACHE_KEY = "quests:github-issues:v1";
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
// Buying only the smallest pack (2 Pollen) doesn't qualify for the Honey Census.
const HONEY_CENSUS_MIN_POLLEN_BOUGHT = 2;

// The catalog id doubles as the legacy first-PR reward, so accounts that
// already earned it are not paid again.
const mergedPrQuest: QuestDefinition = {
    id: "merged_pr",
    title: "Contribute a pull request",
    description:
        "Earn a reward for each merged pull request. The project manager comments with the assessed amount; claim it here after merge.",
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 0,
    balanceBucket: "tier",
};

const reportedIssueQuest: QuestDefinition = {
    id: "reported_merged_issue",
    title: "Report an issue that gets fixed",
    description: `[Report a bug or suggest an improvement](https://github.com/${REPO}/issues/new/choose). The project manager comments with the assessed reward; claim it here when a merged PR closes your issue.`,
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 0,
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
    description: `For anyone who has bought more than ${HONEY_CENSUS_MIN_POLLEN_BOUGHT} Pollen in total: answer a 3-minute [survey](https://github.com/${REPO}/issues/new?template=honey-census.yml). Your two written answers need at least ${HONEY_CENSUS.minWrittenChars} characters in total. One response per GitHub account.`,
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
    closedByPullRequestsReferences: { nodes: ClosingMerge[] };
};

// Only a merge into this repository accepts a report.
type ClosingMerge = {
    mergedAt: string | null;
    repository: { nameWithOwner: string };
};

type RewardActor = GitHubUser & { __typename: string; login: string };
type RewardComment = {
    body: string;
    createdAt: string;
    lastEditedAt: string | null;
    author: RewardActor | null;
    editor: RewardActor | null;
};
type RewardComments = {
    nodes: RewardComment[];
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
};
type AssessedReward = Pick<QuestDefinition, "rewardAmount" | "balanceBucket">;

// An issue or PR the user opened on or after REWARDS_START.
type Contribution = {
    number: number;
    title: string;
    url: string;
    createdAt: string;
    repository: { nameWithOwner: string };
    author: RewardActor | null;
    comments: RewardComments;
};
type MergedPrNode = Contribution & {
    mergedAt: string;
    closingIssuesReferences: {
        nodes: {
            repository: { nameWithOwner: string };
            labels: { nodes: { name: string }[] };
        }[];
        pageInfo: { hasNextPage: boolean };
    };
};
type ClosedIssueNode = Contribution & {
    closedByPullRequestsReferences: { nodes: ClosingMerge[] };
};
type UserContributionsData<TNode> = {
    user: {
        contributions: {
            nodes: TNode[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
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

type PaginatedSearchData<TNode> = {
    search: SearchData<TNode>["search"] & {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
};

// Multi-winner quests can keep pending submissions open alongside merged ones.
const QUEST_ISSUES_QUERY = `
query($query:String!,$after:String){
  search(query:$query,type:ISSUE,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
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

const REPORTED_ISSUES_QUERY = `
query($query:String!,$after:String){
  search(query:$query,type:ISSUE,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
    nodes{
      ... on Issue{
        number title url author{ ... on User{ databaseId } }
        labels(first:20){ nodes{ name } }
        closedByPullRequestsReferences(first:10){
          nodes{ mergedAt repository{ nameWithOwner } }
        }
      }
    }
  }
}`;

// The newest 20 comments; older pages are fetched by COMMENTS_PAGE_QUERY.
const REWARD_COMMENTS = `comments(last:20,before:$before){
  nodes{ body createdAt lastEditedAt
    author{ __typename login ... on User{ databaseId } }
    editor{ __typename login ... on User{ databaseId } }
  }
  pageInfo{ hasPreviousPage startCursor }
}`;

const COMMENTS_PAGE_QUERY = `
query($number:Int!,$before:String){
  repository(owner:"${REPO_OWNER}",name:"${REPO_NAME}"){
    issueOrPullRequest(number:$number){
      ... on Issue{ ${REWARD_COMMENTS} }
      ... on PullRequest{ ${REWARD_COMMENTS} }
    }
  }
}`;

// Newest first, so a check can stop at REWARDS_START.
const MERGED_PRS_QUERY = `
query($login:String!,$after:String,$before:String){
  user(login:$login){ contributions:pullRequests(states:MERGED,first:50,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){
    pageInfo{ hasNextPage endCursor }
    nodes{
      number title url createdAt mergedAt
      repository{ nameWithOwner }
      author{ __typename login ... on User{ databaseId } }
      ${REWARD_COMMENTS}
      closingIssuesReferences(first:20){
        nodes{ repository{ nameWithOwner } labels(first:20){ nodes{ name } } }
        pageInfo{ hasNextPage }
      }
    }
  } }
}`;

const CLOSED_ISSUES_QUERY = `
query($login:String!,$after:String,$before:String){
  user(login:$login){ contributions:issues(states:CLOSED,first:50,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){
    pageInfo{ hasNextPage endCursor }
    nodes{
      number title url createdAt
      repository{ nameWithOwner }
      author{ __typename login ... on User{ databaseId } }
      ${REWARD_COMMENTS}
      closedByPullRequestsReferences(first:10){ nodes{ mergedAt repository{ nameWithOwner } } }
    }
  } }
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

function parseReward(body: string): number | null {
    const match = body.match(QUEST_REWARD_REGEX);
    if (!match) return null;
    const amount = Number(match[1]);
    // Apply the contribution cap to new bounty proposals too. Existing ledger
    // rewards keep their recorded amount and remain claimable.
    if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        amount > CONTRIBUTION_REWARD_LIMIT
    )
        return null;
    return amount;
}

function isRewardMaintainer(actor: RewardActor | null): boolean {
    return (
        actor?.__typename === "User" &&
        REWARD_MAINTAINERS.has(actor.databaseId ?? 0)
    );
}

// `Reward: 3`, `Reward: 3 quest` or `Reward: 3 paid`, alone on its line.
function parseAssessment(text: string): AssessedReward | undefined {
    const match = text
        .trim()
        .match(/^Reward:[ \t]*(\d+(?:\.\d+)?)(?:[ \t]+(quest|paid))?[ \t]*$/);
    if (!match || Number(match[1]) > CONTRIBUTION_REWARD_LIMIT) return;
    return {
        rewardAmount: Number(match[1]),
        balanceBucket: match[2] === "paid" ? "pack" : "tier",
    };
}

// Only the project manager holds CONTRIBUTION_REWARD_KEY, so no other bot
// reply can pass as a quote. Without the key, no quote pays.
async function rewardQuoteKey(
    env: CloudflareBindings,
): Promise<CryptoKey | null> {
    const { CONTRIBUTION_REWARD_KEY: secret } = env as CloudflareBindings & {
        CONTRIBUTION_REWARD_KEY?: string;
    };
    if (!secret) return null;
    return await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
    );
}

function verifyQuote(
    key: CryptoKey,
    number: number,
    line: string,
    signature: string,
): Promise<boolean> {
    const bytes = Uint8Array.from(signature.match(/../g) ?? [], (byte) =>
        Number.parseInt(byte, 16),
    );
    return crypto.subtle.verify(
        "HMAC",
        key,
        bytes,
        new TextEncoder().encode(`${REPO}#${number}\n${line}`),
    );
}

// All comments in creation order; long threads hide the quote on older pages.
async function allComments(
    token: string,
    number: number,
    newest: RewardComments,
): Promise<RewardComment[]> {
    const comments = [...newest.nodes];
    let page = newest;
    while (page.pageInfo.hasPreviousPage) {
        const data = await graphql<{
            repository: { issueOrPullRequest: { comments: RewardComments } };
        }>(token, COMMENTS_PAGE_QUERY, {
            number,
            before: page.pageInfo.startCursor,
        });
        page = data.repository.issueOrPullRequest.comments;
        comments.unshift(...page.nodes);
    }
    return comments;
}

// Elliot's or Thomas's newest `Reward:` comment decides. Otherwise the signed
// quote posted before the merge does, unless a quest bounty replaces it.
async function contributionReward(
    token: string,
    quoteKey: CryptoKey | null,
    item: Contribution,
    mergedAt: string,
    useQuote: boolean,
): Promise<AssessedReward | undefined> {
    const comments = await allComments(token, item.number, item.comments);
    const override = comments
        .filter(
            (comment) =>
                isRewardMaintainer(comment.author) &&
                (!comment.lastEditedAt || isRewardMaintainer(comment.editor)),
        )
        .sort(
            (a, b) =>
                Date.parse(b.lastEditedAt ?? b.createdAt) -
                Date.parse(a.lastEditedAt ?? a.createdAt),
        )
        .map((comment) => parseAssessment(comment.body))
        .find((reward) => reward !== undefined);
    if (override || !useQuote || !quoteKey) return override;

    for (const comment of comments) {
        const [marker, line = "", signature = ""] = comment.body.split("\n");
        const hex = signature.match(
            /^<!-- signature: ([0-9a-f]{64}) -->$/,
        )?.[1];
        if (
            comment.author?.__typename !== "Bot" ||
            comment.author.login !== POLLINATIONS_BOT ||
            marker !== REWARD_MARKER ||
            !hex ||
            Date.parse(comment.createdAt) > Date.parse(mergedAt) ||
            !(await verifyQuote(quoteKey, item.number, line, hex))
        )
            continue;
        const reward = parseAssessment(line);
        // The model never authorizes Paid Pollen; that takes an override.
        return reward?.balanceBucket === "tier" ? reward : undefined;
    }
    return undefined;
}

// The user's issues or PRs from REWARDS_START on, in this repository. Older
// items have no quotes, so a check never walks a contributor's whole history.
async function recentContributions<TNode extends Contribution>(
    token: string,
    query: string,
    user: QuestUser,
): Promise<TNode[]> {
    const items: TNode[] = [];
    let after: string | null = null;
    do {
        const data: UserContributionsData<TNode> = await graphql<
            UserContributionsData<TNode>
        >(token, query, { login: user.githubUsername, after });
        const { nodes, pageInfo } = data.user.contributions;
        const recent = nodes.filter((node) => node.createdAt >= REWARDS_START);
        items.push(
            ...recent.filter(
                (node) =>
                    node.repository.nameWithOwner === REPO &&
                    node.author?.__typename === "User" &&
                    node.author.databaseId === user.githubId,
            ),
        );
        after =
            pageInfo.hasNextPage && recent.length === nodes.length
                ? pageInfo.endCursor
                : null;
    } while (after);
    return items;
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
        pr.author.login === POLLINATIONS_BOT &&
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
    const issues: GitHubIssueNode[] = [];
    let after: string | null = null;
    do {
        const data: PaginatedSearchData<GitHubIssueNode> = await graphql<
            PaginatedSearchData<GitHubIssueNode>
        >(token, QUEST_ISSUES_QUERY, {
            query: `repo:${REPO} label:${QUEST_LABEL} is:issue`,
            after,
        });
        issues.push(...data.search.nodes);
        after = data.search.pageInfo.hasNextPage
            ? data.search.pageInfo.endCursor
            : null;
    } while (after);

    const filteredIssues = issues
        .filter((issue) => hasQuestLabel(issue.labels.nodes))
        .filter(
            (issue) =>
                issue.state === "OPEN" || mergedClosers(issue).length > 0,
        );
    const appPublishPrs = new Set(
        filteredIssues
            .flatMap(mergedClosers)
            .filter(isAppPublishPr)
            .map((pr) => pr.number),
    );
    const appPublishPayees = await commitAuthorIds(token, [...appPublishPrs]);
    return filteredIssues
        .map((issue) => toDerivedQuestIssue(issue, appPublishPayees))
        .filter((issue) => issue.rewardAmount !== null);
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
    const issues = await cachedQuestIssues(ctx.env);
    return [
        questToCard(mergedPrQuest),
        questToCard(reportedIssueQuest),
        questToCard(solveGithubIssueQuest),
        questToCard(beeCensusQuest),
        questToCard(honeyCensusQuest),
        ...issues.map((issue) => questToCard(toIssueQuestDefinition(issue))),
    ];
}

function reportedIssueProposal(
    issue: { number: number; title: string; url: string },
    reward: AssessedReward,
    user: QuestUser,
): QuestEvaluation["proposals"][number] {
    return {
        quest: {
            ...reportedIssueQuest,
            ...reward,
            id: `github:reported_issue:${issue.number}`,
            title: `Reported issue #${issue.number}: ${issue.title}`,
            url: issue.url,
        },
        userId: user.id,
    };
}

async function reportedIssueProposals(
    token: string,
    quoteKey: CryptoKey | null,
    user: QuestUser,
) {
    if (!user.githubUsername) return [];
    const proposals: QuestEvaluation["proposals"] = [];
    for (const issue of await recentContributions<ClosedIssueNode>(
        token,
        CLOSED_ISSUES_QUERY,
        user,
    )) {
        // The first merge accepts the report; a quote must come before it.
        const mergedAt = issue.closedByPullRequestsReferences.nodes
            .flatMap((pr) =>
                pr.mergedAt && pr.repository.nameWithOwner === REPO
                    ? [pr.mergedAt]
                    : [],
            )
            .sort()[0];
        if (!mergedAt) continue;
        const reward = await contributionReward(
            token,
            quoteKey,
            issue,
            mergedAt,
            true,
        );
        if (reward?.rewardAmount) {
            proposals.push(reportedIssueProposal(issue, reward, user));
        }
    }
    return proposals;
}

async function mergedPrProposals(
    token: string,
    quoteKey: CryptoKey | null,
    user: QuestUser,
) {
    if (!user.githubUsername) return [];
    const proposals: QuestEvaluation["proposals"] = [];
    for (const pr of await recentContributions<MergedPrNode>(
        token,
        MERGED_PRS_QUERY,
        user,
    )) {
        // A closed quest pays its bounty through the issue, replacing the
        // quote. Beyond the first page, assume one does rather than pay twice.
        const closesQuest =
            pr.closingIssuesReferences.pageInfo.hasNextPage ||
            pr.closingIssuesReferences.nodes.some(
                (issue) =>
                    issue.repository.nameWithOwner === REPO &&
                    hasQuestLabel(issue.labels.nodes),
            );
        const reward = await contributionReward(
            token,
            quoteKey,
            pr,
            pr.mergedAt,
            !closesQuest,
        );
        if (!reward?.rewardAmount) continue;
        proposals.push({
            quest: {
                ...mergedPrQuest,
                ...reward,
                id: `github:merged_pr:${pr.number}`,
                title: `Merged PR #${pr.number}: ${pr.title}`,
                url: pr.url,
            },
            userId: user.id,
        });
    }
    return proposals;
}

async function legacyReportedIssueProposals(token: string, user: QuestUser) {
    if (!user.githubUsername || user.githubId === null) return [];

    const proposals: QuestEvaluation["proposals"] = [];
    let after: string | null = null;
    do {
        const data: PaginatedSearchData<ReportedIssueNode> = await graphql<
            PaginatedSearchData<ReportedIssueNode>
        >(token, REPORTED_ISSUES_QUERY, {
            query: `repo:${REPO} is:issue is:closed author:${user.githubUsername} updated:>=2026-06-25 created:<${REWARDS_START}`,
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
                        pr.repository.nameWithOwner === REPO &&
                        Date.parse(pr.mergedAt) >= ISSUE_REPORT_START,
                )
            ) {
                continue;
            }
            proposals.push(
                reportedIssueProposal(
                    issue,
                    {
                        rewardAmount: LEGACY_REPORTED_ISSUE_REWARD,
                        balanceBucket: "tier",
                    },
                    user,
                ),
            );
        }
        after = data.search.pageInfo.hasNextPage
            ? data.search.pageInfo.endCursor
            : null;
    } while (after);
    return proposals;
}

async function hasLegacyMergedPr(
    token: string,
    user: QuestUser,
): Promise<boolean> {
    if (!user.githubUsername) return false;
    const data = await graphql<SearchData<GitHubPullRequestNode>>(
        token,
        FIRST_MERGED_PR_QUERY,
        {
            query: `repo:${REPO} is:pr is:merged author:${user.githubUsername} created:<${REWARDS_START}`,
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
// orders from before Stripe.
async function pollenBought(db: QuestDb, userId: string): Promise<number> {
    const [row] = await db.all<{ total: number }>(sql`
        SELECT
            (SELECT COALESCE(SUM(pollen_credited), 0) FROM stripe_checkout_credits
             WHERE user_id = ${userId})
          + (SELECT COALESCE(SUM(amount_usd), 0) FROM stripe_auto_top_up_attempt
             WHERE user_id = ${userId} AND status = 'paid')
          + (SELECT COALESCE(SUM(pollen_credited), 0) FROM polar_checkout_credits
             WHERE user_id = ${userId}) AS total`);
    return row?.total ?? 0;
}

export async function evaluateUser(
    ctx: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const githubId = user.githubId;
    if (githubId === null) return { proposals: [] };

    const [token, quoteKey] = await Promise.all([
        githubToken(ctx.env),
        rewardQuoteKey(ctx.env),
    ]);
    const [
        issues,
        mergedPrs,
        reportedIssues,
        legacyMergedPr,
        legacyReportedIssues,
        beeCensus,
        honeyCensus,
    ] = await Promise.all([
        cachedQuestIssues(ctx.env),
        mergedPrProposals(token, quoteKey, user),
        reportedIssueProposals(token, quoteKey, user),
        hasLegacyMergedPr(token, user),
        legacyReportedIssueProposals(token, user),
        answeredSurvey(token, user, BEE_CENSUS),
        pollenBought(ctx.db, user.id).then(
            (bought) =>
                bought > HONEY_CENSUS_MIN_POLLEN_BOUGHT &&
                answeredSurvey(token, user, HONEY_CENSUS),
        ),
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
            ...mergedPrs,
            ...reportedIssues,
            ...legacyReportedIssues,
            ...(legacyMergedPr
                ? [
                      {
                          quest: {
                              ...mergedPrQuest,
                              rewardAmount: LEGACY_FIRST_PR_REWARD,
                          },
                          userId: user.id,
                      },
                  ]
                : []),
            ...(beeCensus ? [{ quest: beeCensusQuest, userId: user.id }] : []),
            ...(honeyCensus
                ? [{ quest: honeyCensusQuest, userId: user.id }]
                : []),
        ],
    };
}
