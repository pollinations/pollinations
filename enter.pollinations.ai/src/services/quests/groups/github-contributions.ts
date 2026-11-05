import { getLogger } from "@logtape/logtape";
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
 * merged into main earns its own label, else the bounty of the POLLEN-QUEST
 * issue it closes, else 5. Every issue a merged PR closes earns its author 3,
 * also when they fixed it themselves. Both are read from the quest issue: app
 * submissions earn the quest's label, else 5, and quest PRs merged before
 * REWARDS_START earn the quest's label.
 */

const QUEST_LABEL = "POLLEN-QUEST";
const PR_REWARD = 5;
// PRs merged before this earn the old one-time first-PR reward instead. Same
// date as REWARDS_START in operations/infrastructure/project-manager/project_manager.py.
// Set it to the production deploy day: old Enter pays a first PR merged after
// this date once more, under the old quest id.
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
// Buying only the smallest pack (2 Pollen) doesn't qualify for the Honey Census
// or pay a referral.
export const MIN_POLLEN_BOUGHT = 2;

// The catalog id doubles as the old first-PR reward, so accounts that already
// earned it are not paid again.
const mergedPrQuest: QuestDefinition = {
    id: "merged_pr",
    title: "Contribute a pull request",
    description: `Earn ${PR_REWARD} Quest Pollen for each pull request merged into the main branch of the Pollinations [repository](https://github.com/${REPO}). A PR that closes a POLLEN-QUEST issue earns that quest's bounty instead, and a maintainer can set another amount with a reward label.`,
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: PR_REWARD,
    balanceBucket: "tier",
};

const reportedIssueQuest: QuestDefinition = {
    id: "reported_merged_issue",
    title: "Report an issue that gets fixed",
    description: `[Report a bug or suggest an improvement](https://github.com/${REPO}/issues/new/choose) in the Pollinations repository. Earn 3 Quest Pollen for each issue closed by a merged PR. App submissions do not count.`,
    category: CONTRIBUTION_CATEGORY,
    scope: "perUser",
    rewardAmount: 3,
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
    description: `For anyone who has bought more than ${MIN_POLLEN_BOUGHT} Pollen in total: answer a 3-minute [survey](https://github.com/${REPO}/issues/new?template=honey-census.yml). Your two written answers need at least ${HONEY_CENSUS.minWrittenChars} characters in total. One response per GitHub account.`,
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
    // 0 without a reward label: the quest is off the board, and its PRs merged
    // from REWARDS_START pay the default.
    rewardAmount: number;
    // "completed" issues stay off the open board once assigned or closed.
    // Multi-winner quests are reopened after each merge and stay available.
    state: "available" | "completed";
    // Paid from the quest issue: app submitters, because the bot authors their
    // PRs, and authors of PRs merged before REWARDS_START into a labelled
    // quest, which the PR search doesn't cover.
    winnerGithubIds: number[];
};

type GitHubUser = {
    databaseId?: number | null;
};

type ClosingPullRequest = {
    number: number;
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
    labels: { nodes: { name: string }[] };
    assignees: { nodes: GitHubUser[] };
    closedByPullRequestsReferences: { nodes: ClosingPullRequest[] };
};

type GitHubPullRequestNode = {
    number: number;
    mergedAt: string | null;
};

type MergedPrNode = {
    number: number;
    title: string;
    url: string;
    author: GitHubUser | null;
    labels: { nodes: { name: string }[] };
    closingIssuesReferences: { nodes: { number: number }[] };
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
          nodes{ number mergedAt headRefName baseRefName repository{ nameWithOwner } author{ __typename login ... on User{ databaseId } } }
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

// Closing issue numbers only: their labels would cost about ten times more,
// and the cached quest issues already carry the bounties. Asking for 100
// labels and closing issues costs the same 2 points as asking for 10.
const MERGED_PRS_QUERY = `
query($query:String!,$after:String){
  search(query:$query,type:ISSUE,first:100,after:$after){
    pageInfo{ hasNextPage endCursor }
    nodes{
      ... on PullRequest{
        number title url author{ ... on User{ databaseId } }
        labels(first:100){ nodes{ name } }
        closingIssuesReferences(first:100){ nodes{ number } }
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

function hasQuestLabel(labels: { name: string }[]): boolean {
    return labels.some((label) => label.name === QUEST_LABEL);
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
        winnerGithubIds: mergedClosers(issue).flatMap((pr) => {
            if (isAppPublishPr(pr))
                return appPublishPayees.get(pr.number) ?? [];
            // Old unlabelled quests had no amount, so their early PRs earn nothing.
            return rewardAmount > 0 &&
                Date.parse(pr.mergedAt) < Date.parse(REWARDS_START)
                ? githubIds([pr.author])
                : [];
        }),
    };
}

// Every page of a GitHub search.
async function searchAll<TNode>(
    token: string,
    query: string,
    search: string,
): Promise<TNode[]> {
    const nodes: TNode[] = [];
    let after: string | null = null;
    do {
        const data: PaginatedSearchData<TNode> = await graphql<
            PaginatedSearchData<TNode>
        >(token, query, { query: search, after });
        nodes.push(...data.search.nodes);
        after = data.search.pageInfo.hasNextPage
            ? data.search.pageInfo.endCursor
            : null;
    } while (after);
    return nodes;
}

async function loadQuestIssues(token: string): Promise<DerivedQuestIssue[]> {
    const issues = await searchAll<GitHubIssueNode>(
        token,
        QUEST_ISSUES_QUERY,
        `repo:${REPO} label:${QUEST_LABEL} is:issue`,
    );

    // Quests without a reward label stay too: their PRs then keep the quest's
    // reward id, so a label added after a payout can't pay a second time.
    const filteredIssues = issues.filter(
        (issue) =>
            hasQuestLabel(issue.labels.nodes) &&
            (issue.state === "OPEN" || mergedClosers(issue).length > 0),
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

function toIssueQuestDefinition(issue: DerivedQuestIssue): QuestDefinition {
    return {
        // Keep the issue-derived id stable; per-user reward keys add the
        // immutable GitHub id so each merged PR author can earn it once.
        id: `github:issue:${issue.issueNumber}`,
        title: `Ship bounty #${issue.issueNumber}: ${issue.title}`,
        description: `Help close this POLLEN-QUEST issue. ${issue.description}`,
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
        // Only a merge into this repository after the issue opened fixed it.
        const fixed = issue.closedByPullRequestsReferences.nodes.some(
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

    const issueProposals = issues
        .filter((issue) => issue.winnerGithubIds.includes(githubId))
        .map((issue) => ({
            quest: toIssueQuestDefinition(issue),
            userId: user.id,
        }));

    // A PR's own reward label wins, then the highest bounty among the quests
    // it closes, then 5; never a sum. A quest pays each author once, however
    // many of their PRs close it.
    const quests = new Map(issues.map((issue) => [issue.issueNumber, issue]));
    const prProposals = mergedPrs.map((pr) => {
        const quest = pr.closingIssuesReferences.nodes
            .flatMap((issue) => quests.get(issue.number) ?? [])
            .sort((a, b) => b.rewardAmount - a.rewardAmount)[0];
        const definition = quest
            ? toIssueQuestDefinition(quest)
            : {
                  ...mergedPrQuest,
                  id: `github:merged_pr:${pr.number}`,
                  title: `Merged PR #${pr.number}: ${pr.title}`,
                  url: pr.url,
              };
        return {
            quest: {
                ...definition,
                rewardAmount:
                    labelReward(pr.labels.nodes) || definition.rewardAmount,
            },
            userId: user.id,
        };
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
