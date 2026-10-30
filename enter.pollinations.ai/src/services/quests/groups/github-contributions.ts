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
 */

const QUEST_LABEL = "POLLEN-QUEST";
const REWARD_MAINTAINERS = new Set([5099901, 36901823]); // Thomas, Elliot
const REWARD_MARKER = "<!-- pollinations-reward -->";
const CONTRIBUTION_REWARD_LIMIT = 100;
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

// The GitHub App's GraphQL budget is 5,000 points an hour, and listing the
// POLLEN-QUEST issues costs about 10. The catalog and every user's quest check
// share one copy, fetched at most once per window. When GitHub fails (e.g. rate
// limited), the last copy keeps serving and the next fetch waits a window.
// ponytail: refreshes are not coordinated, so a burst or another location can
// fetch again before the new copy is visible. Move the list to a Durable Object
// if those refreshes exhaust the budget.
const QUEST_ISSUES_CACHE_KEY = "quests:github-issues:v2";
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
    completedBy: { prNumber: number; githubId: number }[];
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
    title: string;
    url: string;
    headRefOid: string;
    repository: { nameWithOwner: string };
    author: RewardActor | null;
    comments: RewardComments;
    closingIssuesReferences: GitHubConnection<{
        number: number;
        repository: { nameWithOwner: string };
    }>;
};

type ReportedIssueNode = {
    number: number;
    title: string;
    url: string;
    repository: { nameWithOwner: string };
    author: RewardActor | null;
    comments: RewardComments;
    closedByPullRequestsReferences: { nodes: { mergedAt: string | null }[] };
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

// Most discussions fit on one page; paginate older comments so a long thread
// cannot hide a maintainer override. GitHub returns them in creation order.
const REWARD_COMMENTS = `comments(last:20,before:$before){
  nodes{ body createdAt lastEditedAt
    author{ __typename login ... on User{ databaseId } }
    editor{ __typename login ... on User{ databaseId } }
  }
  pageInfo{ hasPreviousPage startCursor }
}`;

type SurveyIssueNode = {
    body: string;
    author: GitHubUser | null;
};

type SearchData<TNode> = {
    search: {
        nodes: TNode[];
    };
};

type GitHubConnection<TNode> = {
    nodes: TNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type PaginatedSearchData<TNode> = { search: GitHubConnection<TNode> };
type UserContributionsData<TNode> = {
    user: { contributions: GitHubConnection<TNode> };
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

const MERGED_PRS_QUERY = `
query($login:String!,$after:String,$before:String){
  user(login:$login){ contributions:pullRequests(states:MERGED,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
    nodes{
        number title url mergedAt headRefOid
        repository{ nameWithOwner }
        author{ __typename login ... on User{ databaseId } }
        ${REWARD_COMMENTS}
        closingIssuesReferences(first:100){
          nodes{ number repository{ nameWithOwner } }
          pageInfo{ hasNextPage endCursor }
        }
    }
  } }
}`;

const REPORTED_ISSUES_QUERY = `
query($login:String!,$after:String,$before:String){
  user(login:$login){ contributions:issues(states:CLOSED,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
    nodes{
        number title url author{ __typename login ... on User{ databaseId } }
        repository{ nameWithOwner }
        ${REWARD_COMMENTS}
        closedByPullRequestsReferences(first:10){
          nodes{ mergedAt }
        }
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

function isRewardBot(actor: RewardActor | null): boolean {
    return actor?.__typename === "Bot" && actor.login === "pollinations-ai";
}

function parseAssessment(body: string): AssessedReward | undefined {
    const match = body
        .trim()
        .match(/^Reward:[ \t]*(\d+(?:\.\d+)?)(?:[ \t]+(quest|paid))?[ \t]*$/);
    if (!match) return;
    const rewardAmount = Number(match[1]);
    if (
        !Number.isFinite(rewardAmount) ||
        rewardAmount > CONTRIBUTION_REWARD_LIMIT
    )
        return;
    return {
        rewardAmount,
        balanceBucket: match[2] === "paid" ? "pack" : "tier",
    };
}

async function contributionAssessment(
    token: string,
    number: number,
    comments: RewardComments,
    mergedAt: string,
    head?: string,
): Promise<{ assessed: boolean; reward?: AssessedReward }> {
    const all = [...comments.nodes];
    let page = comments;
    while (page.pageInfo.hasPreviousPage) {
        const data = await graphql<{
            repository: { issueOrPullRequest: { comments: RewardComments } };
        }>(
            token,
            `query($number:Int!,$before:String){
          repository(owner:"${REPO_OWNER}",name:"${REPO_NAME}"){
            issueOrPullRequest(number:$number){
              ... on Issue{ ${REWARD_COMMENTS} }
              ... on PullRequest{ ${REWARD_COMMENTS} }
            }
          }
        }`,
            { number, before: page.pageInfo.startCursor },
        );
        page = data.repository.issueOrPullRequest.comments;
        all.unshift(...page.nodes);
    }
    all.sort(
        (a, b) =>
            Date.parse(b.lastEditedAt ?? b.createdAt) -
            Date.parse(a.lastEditedAt ?? a.createdAt),
    );

    const quotes = all.filter(
        (comment) =>
            isRewardBot(comment.author) &&
            comment.body.startsWith(`${REWARD_MARKER}\n`) &&
            Date.parse(comment.createdAt) <= Date.parse(mergedAt) &&
            (!comment.lastEditedAt ||
                isRewardBot(comment.editor) ||
                isRewardMaintainer(comment.editor)),
    );
    // The organizer only assesses open items. Requiring its pre-merge quote
    // makes rollout prospective without back-paying the repository's history.
    if (quotes.length === 0) return { assessed: false };

    for (const comment of all) {
        if (
            !isRewardMaintainer(comment.author) ||
            (comment.lastEditedAt && !isRewardMaintainer(comment.editor))
        )
            continue;
        const reward = parseAssessment(comment.body);
        if (reward) return { assessed: true, reward };
    }
    for (const comment of quotes) {
        if (
            comment.lastEditedAt &&
            Date.parse(comment.lastEditedAt) > Date.parse(mergedAt) &&
            !isRewardMaintainer(comment.editor)
        )
            continue;
        if (head && comment.body.split("\n")[2] !== `<!-- head: ${head} -->`)
            continue;
        const reward = parseAssessment(comment.body.split("\n")[1] ?? "");
        // The model never authorizes Paid Pollen; that requires a human override.
        if (reward?.balanceBucket === "tier") return { assessed: true, reward };
    }
    return { assessed: true };
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
        completedBy: closers.flatMap((pr) =>
            (isAppPublishPr(pr)
                ? (appPublishPayees.get(pr.number) ?? [])
                : githubIds([pr.author])
            ).map((githubId) => ({ prNumber: pr.number, githubId })),
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

async function reportedIssueProposals(token: string, user: QuestUser) {
    if (!user.githubUsername || user.githubId === null) return [];

    const proposals: QuestEvaluation["proposals"] = [];
    let after: string | null = null;
    do {
        const data: UserContributionsData<ReportedIssueNode> = await graphql<
            UserContributionsData<ReportedIssueNode>
        >(token, REPORTED_ISSUES_QUERY, {
            login: user.githubUsername,
            after,
        });
        for (const issue of data.user.contributions.nodes) {
            if (
                issue.repository.nameWithOwner !== REPO ||
                issue.author?.__typename !== "User" ||
                issue.author.databaseId !== user.githubId
            ) {
                continue;
            }
            const mergedAt = issue.closedByPullRequestsReferences.nodes
                .flatMap((pr) => (pr.mergedAt ? [pr.mergedAt] : []))
                .sort()
                .at(-1);
            if (!mergedAt) continue;
            const { reward } = await contributionAssessment(
                token,
                issue.number,
                issue.comments,
                mergedAt,
            );
            if (!reward || reward.rewardAmount === 0) continue;
            proposals.push({
                quest: {
                    ...reportedIssueQuest,
                    ...reward,
                    id: `github:reported_issue:${issue.number}`,
                    title: `Reported issue #${issue.number}: ${issue.title}`,
                    url: issue.url,
                },
                userId: user.id,
            });
        }
        after = data.user.contributions.pageInfo.hasNextPage
            ? data.user.contributions.pageInfo.endCursor
            : null;
    } while (after);
    return proposals;
}

async function mergedPrProposals(token: string, user: QuestUser) {
    const proposals: QuestEvaluation["proposals"] = [];
    const assessedPrs = new Set<number>();
    const closingIssuesByPr = new Map<
        number,
        { numbers: number[]; mergedAt: string }
    >();
    if (!user.githubUsername || user.githubId === null)
        return { proposals, assessedPrs, closingIssuesByPr };
    let after: string | null = null;
    do {
        const data: UserContributionsData<GitHubPullRequestNode> =
            await graphql(token, MERGED_PRS_QUERY, {
                login: user.githubUsername,
                after,
            });
        for (const pr of data.user.contributions.nodes) {
            if (
                !pr.mergedAt ||
                pr.repository.nameWithOwner !== REPO ||
                pr.author?.__typename !== "User" ||
                pr.author.databaseId !== user.githubId
            )
                continue;
            const { assessed, reward } = await contributionAssessment(
                token,
                pr.number,
                pr.comments,
                pr.mergedAt,
                pr.headRefOid,
            );
            if (assessed) assessedPrs.add(pr.number);
            if (!reward || reward.rewardAmount === 0) continue;
            const closingIssues = [...pr.closingIssuesReferences.nodes];
            let page = pr.closingIssuesReferences;
            while (page.pageInfo.hasNextPage) {
                const data = await graphql<{
                    repository: {
                        pullRequest: Pick<
                            GitHubPullRequestNode,
                            "closingIssuesReferences"
                        >;
                    };
                }>(
                    token,
                    `query($number:Int!,$after:String){
                      repository(owner:"${REPO_OWNER}",name:"${REPO_NAME}"){
                        pullRequest(number:$number){
                          closingIssuesReferences(first:100,after:$after){
                            nodes{ number repository{ nameWithOwner } }
                            pageInfo{ hasNextPage endCursor }
                          }
                        }
                      }
                    }`,
                    { number: pr.number, after: page.pageInfo.endCursor },
                );
                page = data.repository.pullRequest.closingIssuesReferences;
                closingIssues.push(...page.nodes);
            }
            closingIssuesByPr.set(pr.number, {
                numbers: closingIssues
                    .filter((issue) => issue.repository.nameWithOwner === REPO)
                    .map((issue) => issue.number),
                mergedAt: pr.mergedAt,
            });
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
        after = data.user.contributions.pageInfo.hasNextPage
            ? data.user.contributions.pageInfo.endCursor
            : null;
    } while (after);
    return { proposals, assessedPrs, closingIssuesByPr };
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

    const token = await githubToken(ctx.env);
    const [
        issues,
        mergedPrs,
        reportedIssues,
        beeCensus,
        honeyCensus,
        recorded,
    ] = await Promise.all([
        cachedQuestIssues(ctx.env),
        mergedPrProposals(token, user),
        reportedIssueProposals(token, user),
        answeredSurvey(token, user, BEE_CENSUS),
        pollenBought(ctx.db, user.id).then(
            (bought) =>
                bought > HONEY_CENSUS_MIN_POLLEN_BOUGHT &&
                answeredSurvey(token, user, HONEY_CENSUS),
        ),
        ctx.db.all<{ questId: string | null; earnedAt: number }>(sql`
                SELECT quest_id AS questId, earned_at AS earnedAt FROM rewards
                WHERE user_id = ${user.id}
                   OR idempotency_key LIKE ${`quest:%:github:${githubId}`}`),
    ]);

    const earned = new Map(
        recorded.map((reward) => [reward.questId, reward.earnedAt]),
    );
    // The same accepted solution can appear under an issue bounty or a PR
    // quote. Keep its first ledger entry, even if the assessment is removed.
    const alreadyRewardedPrs = new Set(
        [...mergedPrs.closingIssuesByPr]
            .filter(([, { numbers, mergedAt }]) =>
                numbers.some(
                    (number) =>
                        // Earlier awards may belong to a different PR on a recurring quest.
                        (earned.get(`github:issue:${number}`) ?? 0) >=
                        Math.floor(Date.parse(mergedAt) / 1000),
                ),
            )
            .map(([prNumber]) => prNumber),
    );
    const assessedOrRewardedPrs = new Set([
        ...mergedPrs.assessedPrs,
        ...recorded.flatMap(({ questId }) => {
            const match = questId?.match(/^github:merged_pr:(\d+)$/);
            return match ? [Number(match[1])] : [];
        }),
    ]);

    // Payable issue bounties: completed by a merged PR authored by the current
    // user's linked GitHub account, with a positive reward.
    const issueProposals = issues
        .filter(
            (issue) =>
                issue.completedBy.some(
                    ({ githubId: authorId }) => authorId === githubId,
                ) &&
                !issue.completedBy.some(
                    ({ prNumber, githubId: authorId }) =>
                        authorId === githubId &&
                        assessedOrRewardedPrs.has(prNumber),
                ) &&
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
            ...mergedPrs.proposals.filter(
                ({ quest }) =>
                    !alreadyRewardedPrs.has(Number(quest.id.split(":").at(-1))),
            ),
            ...(beeCensus ? [{ quest: beeCensusQuest, userId: user.id }] : []),
            ...(honeyCensus
                ? [{ quest: honeyCensusQuest, userId: user.id }]
                : []),
        ],
    };
}
