const { spawnSync } = require("node:child_process");
const path = require("node:path");

const COMMUNITY_QUEST_LABEL = "POLLEN-QUEST";
const MAX_QUEST_PAYOUT = 10_000;

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
    const match = body.match(/###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i);
    return match ? Number(match[1]) : null;
}

function validateQuestPayoutAmount(amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
        return "valid reward amount in issue body";
    }
    if (amount > MAX_QUEST_PAYOUT) {
        return `reward amount <= ${MAX_QUEST_PAYOUT}`;
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

const githubQuestDefinitions = [
    {
        id: "github:community_issue_quest",
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
            if (!pr?.merged) return { candidates: [] };

            const issue = await helpers.findLinkedIssueWithLabel(
                COMMUNITY_QUEST_LABEL,
            );
            if (!issue) return { candidates: [] };

            const reward = parseReward(issue.body || "");
            const assignee = firstAssignee(issue);
            const missing = [];
            if (!assignee) missing.push("assignee");
            const amountProblem = validateQuestPayoutAmount(reward);
            if (amountProblem) missing.push(amountProblem);

            if (missing.length) {
                return {
                    candidates: [],
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
                candidates: [
                    {
                        questTypeId: "github:community_issue_quest",
                        issue: issue.number,
                        issueTitle: issue.title,
                        issueUrl: issue.url,
                        prNumber: pr.number,
                        recipient: assignee.login,
                        recipientId: assignee.databaseId,
                        role: "assignee",
                        amount: reward,
                        eventId: `issue:${issue.number}`,
                        sourceRef: `pr:${pr.number}`,
                        metadata: {
                            issueNumber: issue.number,
                            issueTitle: issue.title,
                            issueUrl: issue.url,
                            prNumber: pr.number,
                        },
                    },
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
    const candidates = [];
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

        for (const candidate of result.candidates ?? []) {
            const amount = candidate.amount ?? definition.rewardAmount;
            const amountProblem = validateQuestPayoutAmount(amount);
            if (amountProblem) {
                reviews.push({
                    questTypeId: definition.id,
                    issue: candidate.issue,
                    prNumber: context.payload.pull_request?.number,
                    assignee: candidate.recipient ?? null,
                    amount,
                    missing: [amountProblem],
                });
                continue;
            }

            candidates.push({
                questTypeId: candidate.questTypeId ?? definition.id,
                balanceBucket:
                    candidate.balanceBucket ?? definition.balanceBucket,
                payoutScope: definition.payoutScope,
                ...candidate,
                amount,
            });
        }
    }

    return { event, candidates, reviews };
}

async function evaluateQuestPayouts({ github, context, core }) {
    const { event, candidates, reviews } = await runGitHubQuestEvaluators({
        github,
        context,
    });

    core.info(
        `Quest runner event=${event.event}.${event.action} candidates=${candidates.length} reviews=${reviews.length}`,
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
        "payouts",
        candidates.length ? JSON.stringify(candidates) : "",
    );
}

function buildReceiptBody(result) {
    if (result.status === "granted") {
        return `### 🌸 Quest reward paid out\n\n- **${result.amount}** Pollen → @${result.user}`;
    }
    if (result.status === "duplicate") {
        return `### 🌸 Quest reward already paid out\n\n- **${result.amount}** Pollen → @${result.user}`;
    }
    if (result.status === "not_found") {
        return `### ⚠️ Quest reward needs review\n\n@${process.env.PAYOUT_FALLBACK} — @${result.user} is not registered at enter.pollinations.ai; please back-fill ${result.amount} Pollen manually.`;
    }
    return `### ⚠️ Quest reward needs review\n\n@${process.env.PAYOUT_FALLBACK} — D1 grant failed for @${result.user}: ${result.amount} Pollen`;
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

function runGrant(enterDir, payout, spawn = spawnSync) {
    console.log(
        `→ granting ${payout.amount} Pollen to @${payout.recipient} for #${payout.issue}`,
    );
    const result = spawn(
        "npx",
        [
            "tsx",
            "src/tier-progression/shared/quest-grant-pollen.ts",
            "grant",
            "--githubId",
            String(payout.recipientId),
            "--githubUsername",
            payout.recipient,
            "--amount",
            String(payout.amount),
            "--questIssue",
            String(payout.issue),
            "--prNumber",
            String(payout.prNumber ?? process.env.PR_NUMBER),
            "--role",
            payout.role ?? "assignee",
            "--env",
            "production",
        ],
        {
            cwd: enterDir,
            encoding: "utf8",
        },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    return {
        issue: payout.issue,
        user: payout.recipient,
        amount: payout.amount,
        status:
            result.status === 0
                ? "granted"
                : result.status === 3
                  ? "duplicate"
                  : result.status === 2
                    ? "not_found"
                    : "failed",
    };
}

async function runPollenGrant({
    core,
    cwd = process.cwd(),
    spawn = spawnSync,
}) {
    const grantPayouts = parseJsonEnv("PAYOUTS") ?? [];
    if (!grantPayouts.length) return;

    const enterDir = path.join(cwd, "enter.pollinations.ai");
    const install = spawn("npm", ["ci", "--ignore-scripts"], {
        cwd,
        encoding: "utf8",
        stdio: "inherit",
    });
    if (install.status !== 0) {
        throw new Error("npm ci failed");
    }

    const results = grantPayouts.map((grantPayout) =>
        runGrant(enterDir, grantPayout, spawn),
    );
    core.setOutput("results", JSON.stringify(results));
}

module.exports = {
    MAX_QUEST_PAYOUT,
    evaluateQuestPayouts,
    githubQuestDefinitions,
    parseReward,
    postReceipt,
    runGitHubQuestEvaluators,
    runPollenGrant,
    validateQuestPayoutAmount,
};
