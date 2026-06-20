const { spawnSync } = require("node:child_process");
const path = require("node:path");

// Keep these values in sync with shared/quests/definitions.ts. This script runs
// as CommonJS inside actions/github-script, so it intentionally does not import
// the TypeScript shared module.
const COMMUNITY_GITHUB_QUEST_ID = "github:community_issue_quest";
const COMMUNITY_GITHUB_QUEST_LABEL = "POLLEN-QUEST";
const QUEST_REWARD_REGEX = /###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i;

function repo(context) {
    return {
        owner: context.repo.owner,
        repo: context.repo.repo,
    };
}

function parseJsonEnv(name) {
    const value = process.env[name];
    return value ? JSON.parse(value) : null;
}

function parseReward(body) {
    const match = body.match(QUEST_REWARD_REGEX);
    return match ? Number(match[1]) : null;
}

function extractDescription(body) {
    const preferred = body.match(
        /(?:^|\n)#{2,4}\s*(?:goal|quest goal|scope|what to build)[^\n]*\n+([\s\S]*?)(?=\n#{2,4}\s|\n---|$)/i,
    );
    if (preferred?.[1]) {
        const section = compactMarkdown(preferred[1]);
        if (section) return truncate(section, 260);
    }
    return truncate(compactMarkdown(body), 260);
}

function compactMarkdown(markdown) {
    return markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function truncate(text, maxLength) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

function validateQuestPayoutAmount(amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
        return "valid reward amount in issue body";
    }
    return null;
}

function getGitHubEvent(context) {
    return {
        source: "github",
        event: context.eventName || process.env.GITHUB_EVENT_NAME || "",
        action: context.payload?.action || "",
    };
}

function triggerMatches(trigger, event) {
    if (trigger.source !== event.source) return false;
    if (trigger.event !== event.event) return false;
    return !trigger.actions || trigger.actions.includes(event.action);
}

function issueHasLabel(issue, label) {
    return issue.labels?.nodes?.some((node) => node.name === label) ?? false;
}

function firstAssignee(issue) {
    return issue.assignees?.nodes?.[0] ?? null;
}

async function findLinkedIssueWithLabel({ github, context, label }) {
    const pr = context.payload.pull_request;
    if (!pr?.number) return null;

    // Use GitHub's native PR<->issue link: covers "Fixes #N" keywords AND the
    // Development sidebar manual link. Means maintainers can rescue a quest
    // PR pre-merge without contributor cooperation.
    const data = await github.graphql(
        `query($owner:String!,$repo:String!,$num:Int!) {
            repository(owner:$owner,name:$repo) {
                pullRequest(number:$num) {
                    closingIssuesReferences(first:10) {
                        nodes {
                            number
                            title
                            url
                            body
                            createdAt
                            updatedAt
                            closedAt
                            labels(first:20) { nodes { name } }
                            assignees(first:5) { nodes { login databaseId } }
                        }
                    }
                }
            }
        }`,
        { ...repo(context), num: pr.number },
    );

    return (
        data.repository.pullRequest.closingIssuesReferences.nodes.find(
            (issue) => issueHasLabel(issue, label),
        ) ?? null
    );
}

function buildReviewBody(review) {
    return [
        `@${process.env.PAYOUT_FALLBACK} — quest payout could not be auto-processed.`,
        "",
        `**Missing:** ${review.missing.join(", ")}`,
        `- assignee: ${review.assignee ?? "(none)"}`,
        `- parsed reward: ${review.amount ?? "(unparsed)"}`,
        "",
        `Triggered by merge of #${review.prNumber}. Please review and back-fill manually.`,
    ].join("\n");
}

function githubIssueRecordFromLinkedIssue({ issue, pr, amount, assignee }) {
    const assignees = issue.assignees?.nodes ?? [];
    return {
        issueNumber: issue.number,
        questId: COMMUNITY_GITHUB_QUEST_ID,
        title: issue.title,
        description: extractDescription(issue.body || ""),
        url: issue.url,
        rewardAmount: amount,
        balanceBucket: "pack",
        state: "completed",
        assigneeGithubId: assignee.databaseId,
        assigneeLogin: assignee.login,
        assignees: assignees.map((node) => node.login).filter(Boolean),
        completedByPrNumber: pr.number,
        completedAt: pr.merged_at ?? pr.closed_at ?? new Date().toISOString(),
        githubCreatedAt: issue.createdAt,
        githubUpdatedAt: issue.updatedAt,
        metadata: {
            questTypeId: COMMUNITY_GITHUB_QUEST_ID,
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueUrl: issue.url,
            prNumber: pr.number,
            role: "assignee",
        },
    };
}

function githubIssueRecordFromRestIssue(issue) {
    const body = issue.body || "";
    const assignees = issue.assignees ?? [];
    const assignee = assignees[0] ?? null;
    return {
        issueNumber: issue.number,
        questId: COMMUNITY_GITHUB_QUEST_ID,
        title: issue.title,
        description: extractDescription(body),
        url: issue.html_url,
        rewardAmount: parseReward(body),
        balanceBucket: "pack",
        state:
            issue.state === "closed"
                ? "completed"
                : assignees.length
                  ? "claimed"
                  : "available",
        assigneeGithubId: assignee?.id ?? null,
        assigneeLogin: assignee?.login ?? null,
        assignees: assignees.map((node) => node.login).filter(Boolean),
        completedByPrNumber: null,
        completedAt: issue.closed_at ?? null,
        githubCreatedAt: issue.created_at,
        githubUpdatedAt: issue.updated_at,
        metadata: {
            questTypeId: COMMUNITY_GITHUB_QUEST_ID,
            issueNumber: issue.number,
            issueTitle: issue.title,
            issueUrl: issue.html_url,
        },
    };
}

async function syncGitHubQuestIssues({ github, context, core }) {
    const issues = await github.paginate(
        github.rest.search.issuesAndPullRequests,
        {
            q: `repo:${context.repo.owner}/${context.repo.repo} is:issue label:${COMMUNITY_GITHUB_QUEST_LABEL}`,
            per_page: 100,
            sort: "updated",
            order: "desc",
        },
    );
    const questIssues = issues.map(githubIssueRecordFromRestIssue);
    core.info(`Quest issue sync found ${questIssues.length} issues`);
    core.setOutput(
        "questIssues",
        questIssues.length ? JSON.stringify(questIssues) : "",
    );
}

const githubQuestDefinitions = [
    {
        id: COMMUNITY_GITHUB_QUEST_ID,
        title: "Community issue quest",
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
        triggers: [
            {
                source: "github",
                event: "pull_request_target",
                actions: ["closed"],
            },
        ],
        evaluate: async ({ context, helpers }) => {
            const pr = context.payload.pull_request;
            if (!pr?.merged) return { questIssues: [] };

            const issue = await helpers.findLinkedIssueWithLabel(
                COMMUNITY_GITHUB_QUEST_LABEL,
            );
            if (!issue) return { questIssues: [] };

            const reward = parseReward(issue.body || "");
            const assignee = firstAssignee(issue);
            const missing = [];
            if (!assignee) missing.push("assignee");
            const amountProblem = validateQuestPayoutAmount(reward);
            if (amountProblem) missing.push(amountProblem);

            if (missing.length) {
                return {
                    questIssues: [],
                    reviews: [
                        {
                            issue: issue.number,
                            prNumber: pr.number,
                            assignee: assignee?.login ?? null,
                            amount: reward,
                            missing,
                        },
                    ],
                };
            }

            return {
                questIssues: [
                    githubIssueRecordFromLinkedIssue({
                        issue,
                        pr,
                        amount: reward,
                        assignee,
                    }),
                ],
            };
        },
    },
];

async function runGitHubQuestEvaluators({
    github,
    context,
    definitions = githubQuestDefinitions,
}) {
    const event = getGitHubEvent(context);
    const helpers = {
        findLinkedIssueWithLabel: (label) =>
            findLinkedIssueWithLabel({ github, context, label }),
    };
    const questIssues = [];
    const reviews = [];

    for (const definition of definitions) {
        const shouldEvaluate = definition.triggers.some((trigger) =>
            triggerMatches(trigger, event),
        );
        if (!shouldEvaluate) continue;

        const result = await definition.evaluate({
            context,
            event,
            helpers,
            definition,
        });

        for (const review of result.reviews ?? []) {
            reviews.push({ questTypeId: definition.id, ...review });
        }

        for (const issue of result.questIssues ?? []) {
            const amount = issue.rewardAmount;
            const amountProblem = validateQuestPayoutAmount(amount);
            if (amountProblem) {
                reviews.push({
                    questTypeId: definition.id,
                    issue: issue.issueNumber,
                    prNumber: context.payload.pull_request?.number,
                    assignee: issue.assigneeLogin ?? null,
                    amount,
                    missing: [amountProblem],
                });
                continue;
            }

            questIssues.push({
                ...issue,
                questId: definition.id,
                balanceBucket: issue.balanceBucket ?? definition.balanceBucket,
                payoutScope: definition.payoutScope,
            });
        }
    }

    return { event, questIssues, reviews };
}

async function evaluateQuestIssueUpdates({ github, context, core }) {
    const { event, questIssues, reviews } = await runGitHubQuestEvaluators({
        github,
        context,
    });

    core.info(
        `Quest runner event=${event.event}.${event.action} questIssues=${questIssues.length} reviews=${reviews.length}`,
    );

    for (const review of reviews) {
        if (!review.issue) continue;
        await github.rest.issues.createComment({
            ...repo(context),
            issue_number: review.issue,
            body: buildReviewBody(review),
        });
    }

    core.setOutput(
        "questIssues",
        questIssues.length ? JSON.stringify(questIssues) : "",
    );
}

function buildReceiptBody(result) {
    if (result.status === "recorded") {
        return `### 🌸 Quest completion recorded\n\n- #${result.issue} will be processed by the quest evaluator.`;
    }
    return `### ⚠️ Quest completion needs review\n\n@${process.env.PAYOUT_FALLBACK} — D1 update failed for quest issue #${result.issue}.`;
}

async function postReceipt({ github, context }) {
    const receiptResults = parseJsonEnv("RESULTS") ?? [];
    if (!receiptResults.length) return;

    for (const receipt of receiptResults) {
        if (!receipt.issue) continue;
        await github.rest.issues.createComment({
            ...repo(context),
            issue_number: receipt.issue,
            body: buildReceiptBody(receipt),
        });
    }
}

function sqlString(value) {
    if (value === null || value === undefined) return "NULL";
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
    return Number.isFinite(value) ? String(value) : "NULL";
}

function sqlDate(value) {
    if (!value) return "NULL";
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? String(ms) : "NULL";
}

function sqlJson(value) {
    return value == null ? "NULL" : sqlString(JSON.stringify(value));
}

function upsertGithubQuestIssue(enterDir, issue, spawn = spawnSync) {
    console.log(`→ recording quest issue #${issue.issueNumber}`);

    const nowSql = "cast((julianday('now') - 2440587.5)*86400000 as integer)";
    const sql = `
        INSERT INTO github_quest_issues (
            issue_number,
            quest_id,
            title,
            description,
            url,
            reward_amount,
            balance_bucket,
            state,
            assignee_github_id,
            assignee_login,
            assignees_json,
            completed_by_pr_number,
            completed_at,
            github_created_at,
            github_updated_at,
            metadata_json,
            updated_at
        ) VALUES (
            ${sqlNumber(issue.issueNumber)},
            ${sqlString(issue.questId)},
            ${sqlString(issue.title)},
            ${sqlString(issue.description)},
            ${sqlString(issue.url)},
            ${sqlNumber(issue.rewardAmount)},
            ${sqlString(issue.balanceBucket)},
            ${sqlString(issue.state)},
            ${sqlNumber(issue.assigneeGithubId)},
            ${sqlString(issue.assigneeLogin)},
            ${sqlJson(issue.assignees ?? [])},
            ${sqlNumber(issue.completedByPrNumber)},
            ${sqlDate(issue.completedAt)},
            ${sqlDate(issue.githubCreatedAt)},
            ${sqlDate(issue.githubUpdatedAt)},
            ${sqlJson(issue.metadata ?? null)},
            ${nowSql}
        )
        ON CONFLICT(issue_number) DO UPDATE SET
            quest_id = excluded.quest_id,
            title = excluded.title,
            description = excluded.description,
            url = excluded.url,
            reward_amount = excluded.reward_amount,
            balance_bucket = excluded.balance_bucket,
            state = excluded.state,
            assignee_github_id = excluded.assignee_github_id,
            assignee_login = excluded.assignee_login,
            assignees_json = excluded.assignees_json,
            completed_by_pr_number = COALESCE(
                excluded.completed_by_pr_number,
                github_quest_issues.completed_by_pr_number
            ),
            completed_at = COALESCE(
                excluded.completed_at,
                github_quest_issues.completed_at
            ),
            github_created_at = excluded.github_created_at,
            github_updated_at = excluded.github_updated_at,
            metadata_json = COALESCE(
                excluded.metadata_json,
                github_quest_issues.metadata_json
            ),
            updated_at = ${nowSql};
    `;

    const result = spawn(
        "npx",
        [
            "wrangler",
            "d1",
            "execute",
            "DB",
            "--remote",
            "--env",
            "production",
            "--command",
            sql,
            "--json",
        ],
        {
            cwd: enterDir,
            encoding: "utf8",
        },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    return {
        issue: issue.issueNumber,
        status: result.status === 0 ? "recorded" : "failed",
    };
}

async function runQuestIssueSync({
    core,
    cwd = process.cwd(),
    spawn = spawnSync,
}) {
    const questIssues = parseJsonEnv("QUEST_ISSUES") ?? [];
    if (!questIssues.length) return;

    const enterDir = path.join(cwd, "enter.pollinations.ai");
    const install = spawn("npm", ["ci", "--ignore-scripts"], {
        cwd,
        encoding: "utf8",
        stdio: "inherit",
    });
    if (install.status !== 0) {
        throw new Error("npm ci failed");
    }

    const results = questIssues.map((issue) =>
        upsertGithubQuestIssue(enterDir, issue, spawn),
    );
    core.setOutput("results", JSON.stringify(results));
}

module.exports = {
    COMMUNITY_GITHUB_QUEST_ID,
    COMMUNITY_GITHUB_QUEST_LABEL,
    evaluateQuestIssueUpdates,
    githubQuestDefinitions,
    parseReward,
    postReceipt,
    runGitHubQuestEvaluators,
    runQuestIssueSync,
    syncGitHubQuestIssues,
    validateQuestPayoutAmount,
};
