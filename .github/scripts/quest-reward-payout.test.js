const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
    COMMUNITY_GITHUB_QUEST_ID,
    COMMUNITY_GITHUB_QUEST_LABEL,
    evaluateQuestIssueUpdates,
    MAX_QUEST_PAYOUT,
    parseReward,
    runGitHubQuestEvaluators,
    runQuestIssueSync,
    syncGitHubQuestIssues,
    validateQuestPayoutAmount,
} = require("./quest-reward-payout.js");

function pullRequestContext(overrides = {}) {
    return {
        eventName: "pull_request_target",
        repo: { owner: "pollinations", repo: "pollinations" },
        payload: {
            action: "closed",
            pull_request: {
                number: 42,
                merged: true,
                merged_at: "2026-06-10T00:00:00Z",
                closed_at: "2026-06-10T00:00:00Z",
                ...overrides.pull_request,
            },
            ...overrides.payload,
        },
    };
}

function linkedIssue({
    number = 123,
    title = "Quest issue",
    body = "### Reward\n20",
    labels = [COMMUNITY_GITHUB_QUEST_LABEL],
    assignee = { login: "octocat", databaseId: 456 },
} = {}) {
    return {
        number,
        title,
        url: `https://github.com/pollinations/pollinations/issues/${number}`,
        body,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-02T00:00:00Z",
        closedAt: null,
        labels: { nodes: labels.map((name) => ({ name })) },
        assignees: { nodes: assignee ? [assignee] : [] },
    };
}

function githubWithLinkedIssues(issues) {
    const calls = [];
    const comments = [];
    return {
        calls,
        comments,
        graphql: async (query, variables) => {
            calls.push({ query, variables });
            return {
                repository: {
                    pullRequest: {
                        closingIssuesReferences: {
                            nodes: issues,
                        },
                    },
                },
            };
        },
        rest: {
            issues: {
                createComment: async (comment) => {
                    comments.push(comment);
                },
            },
        },
    };
}

function outputCore() {
    return {
        infoMessages: [],
        outputs: {},
        info(message) {
            this.infoMessages.push(message);
        },
        setOutput(name, value) {
            this.outputs[name] = value;
        },
    };
}

test("parseReward reads numeric reward sections", () => {
    assert.equal(parseReward("### Reward\n12.5"), 12.5);
    assert.equal(parseReward("## Goal\nShip it\n\n### Reward\n20"), 20);
    assert.equal(parseReward("### Reward\nnope"), null);
});

test("community issue quest returns a materialized issue for merged quest PRs", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            number: 321,
            title: "Fix a model",
            body: "### Goal\nFix the model config.\n\n### Reward\n15",
            assignee: { login: "dev-user", databaseId: 999 },
        }),
    ]);

    const result = await runGitHubQuestEvaluators({
        github,
        context: pullRequestContext(),
    });

    assert.equal(result.questIssues.length, 1);
    assert.equal(result.reviews.length, 0);
    assert.deepEqual(result.questIssues[0], {
        questId: COMMUNITY_GITHUB_QUEST_ID,
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
        issueNumber: 321,
        title: "Fix a model",
        description: "Fix the model config.",
        url: "https://github.com/pollinations/pollinations/issues/321",
        rewardAmount: 15,
        state: "completed",
        assigneeGithubId: 999,
        assigneeLogin: "dev-user",
        assignees: ["dev-user"],
        completedByPrNumber: 42,
        completedAt: "2026-06-10T00:00:00Z",
        githubCreatedAt: "2026-06-01T00:00:00Z",
        githubUpdatedAt: "2026-06-02T00:00:00Z",
        metadata: {
            questTypeId: COMMUNITY_GITHUB_QUEST_ID,
            issueNumber: 321,
            issueTitle: "Fix a model",
            issueUrl: "https://github.com/pollinations/pollinations/issues/321",
            prNumber: 42,
            role: "assignee",
        },
    });
});

test("community issue quest ignores non-quest linked issues", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({ labels: [".BUG"], body: "### Reward\n15" }),
    ]);

    const result = await runGitHubQuestEvaluators({
        github,
        context: pullRequestContext(),
    });

    assert.deepEqual(result.questIssues, []);
    assert.deepEqual(result.reviews, []);
});

test("community issue quest returns review when reward data is incomplete", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            body: "### Reward\nnot-a-number",
            assignee: null,
        }),
    ]);

    const result = await runGitHubQuestEvaluators({
        github,
        context: pullRequestContext(),
    });

    assert.deepEqual(result.questIssues, []);
    assert.equal(result.reviews.length, 1);
    assert.deepEqual(result.reviews[0].missing, [
        "assignee",
        "valid reward amount in issue body",
    ]);
});

test("runner enforces trigger allow-list before calling evaluators", async () => {
    const result = await runGitHubQuestEvaluators({
        github: githubWithLinkedIssues([]),
        context: {
            eventName: "issues",
            repo: { owner: "pollinations", repo: "pollinations" },
            payload: { action: "opened", issue: { number: 1 } },
        },
        definitions: [
            {
                id: "test:pr_only",
                balanceBucket: "pack",
                payoutScope: "once_per_user",
                triggers: [
                    {
                        source: "github",
                        event: "pull_request_target",
                        actions: ["closed"],
                    },
                ],
                evaluate: () => {
                    throw new Error("should not run");
                },
            },
        ],
    });

    assert.deepEqual(result.questIssues, []);
    assert.deepEqual(result.reviews, []);
});

test("runner preserves definition balance bucket on materialized issues", async () => {
    const result = await runGitHubQuestEvaluators({
        github: githubWithLinkedIssues([]),
        context: pullRequestContext(),
        definitions: [
            {
                id: "test:tier_bucket",
                balanceBucket: "tier",
                payoutScope: "once_per_event_per_user",
                triggers: [
                    {
                        source: "github",
                        event: "pull_request_target",
                        actions: ["closed"],
                    },
                ],
                evaluate: () => ({
                    questIssues: [
                        {
                            issueNumber: 123,
                            rewardAmount: 15,
                        },
                    ],
                }),
            },
        ],
    });

    assert.equal(result.questIssues.length, 1);
    assert.equal(result.questIssues[0].balanceBucket, "tier");
});

test("payout amount validator enforces the shared ceiling", () => {
    assert.equal(validateQuestPayoutAmount(1), null);
    assert.equal(validateQuestPayoutAmount(MAX_QUEST_PAYOUT), null);
    assert.equal(
        validateQuestPayoutAmount(MAX_QUEST_PAYOUT + 1),
        `reward amount <= ${MAX_QUEST_PAYOUT}`,
    );
});

test("evaluateQuestIssueUpdates writes materialized issue output", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            number: 321,
            body: "### Reward\n15",
            assignee: { login: "dev-user", databaseId: 999 },
        }),
    ]);
    const core = outputCore();

    await evaluateQuestIssueUpdates({
        github,
        context: pullRequestContext(),
        core,
    });

    const questIssues = JSON.parse(core.outputs.questIssues);
    assert.equal(questIssues.length, 1);
    assert.equal(questIssues[0].assigneeLogin, "dev-user");
    assert.equal(questIssues[0].rewardAmount, 15);
    assert.equal(questIssues[0].state, "completed");
    assert.deepEqual(github.comments, []);
});

test("evaluateQuestIssueUpdates comments when linked quest data is incomplete", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            body: "### Reward\nnot-a-number",
            assignee: null,
        }),
    ]);
    const core = outputCore();

    await evaluateQuestIssueUpdates({
        github,
        context: pullRequestContext(),
        core,
    });

    assert.equal(core.outputs.questIssues, "");
    assert.equal(github.comments.length, 1);
    assert.equal(github.comments[0].issue_number, 123);
    assert.match(github.comments[0].body, /\*\*Missing:\*\* assignee/);
    assert.match(github.comments[0].body, /valid reward amount in issue body/);
});

test("syncGitHubQuestIssues emits materialized records for current issues", async () => {
    const calls = [];
    const github = {
        paginate: async (endpoint, params) => {
            calls.push({ endpoint, params });
            return [
                {
                    number: 456,
                    title: "Claimed quest",
                    html_url:
                        "https://github.com/pollinations/pollinations/issues/456",
                    body: "### Goal\nBuild a thing.\n\n### Reward\n25",
                    state: "open",
                    assignees: [{ login: "dev-user", id: 999 }],
                    closed_at: null,
                    created_at: "2026-06-01T00:00:00Z",
                    updated_at: "2026-06-02T00:00:00Z",
                },
            ];
        },
        rest: {
            search: {
                issuesAndPullRequests: "search/issues",
            },
        },
    };
    const core = outputCore();

    await syncGitHubQuestIssues({
        github,
        context: pullRequestContext(),
        core,
    });

    assert.match(calls[0].params.q, /label:POLLEN-QUEST/);
    const questIssues = JSON.parse(core.outputs.questIssues);
    assert.deepEqual(questIssues, [
        {
            issueNumber: 456,
            questId: COMMUNITY_GITHUB_QUEST_ID,
            title: "Claimed quest",
            description: "Build a thing.",
            url: "https://github.com/pollinations/pollinations/issues/456",
            rewardAmount: 25,
            balanceBucket: "pack",
            state: "claimed",
            assigneeGithubId: 999,
            assigneeLogin: "dev-user",
            assignees: ["dev-user"],
            completedByPrNumber: null,
            completedAt: null,
            githubCreatedAt: "2026-06-01T00:00:00Z",
            githubUpdatedAt: "2026-06-02T00:00:00Z",
            metadata: {
                questTypeId: COMMUNITY_GITHUB_QUEST_ID,
                issueNumber: 456,
                issueTitle: "Claimed quest",
                issueUrl:
                    "https://github.com/pollinations/pollinations/issues/456",
            },
        },
    ]);
});

test("runQuestIssueSync installs from the repo root and records each issue", async (t) => {
    const previousQuestIssues = process.env.QUEST_ISSUES;
    t.after(() => {
        if (previousQuestIssues === undefined) {
            delete process.env.QUEST_ISSUES;
        } else {
            process.env.QUEST_ISSUES = previousQuestIssues;
        }
    });

    process.env.QUEST_ISSUES = JSON.stringify([
        {
            issueNumber: 123,
            questId: COMMUNITY_GITHUB_QUEST_ID,
            title: "Add a demo app",
            description: "Build it.",
            url: "https://github.com/pollinations/pollinations/issues/123",
            rewardAmount: 15,
            balanceBucket: "pack",
            state: "completed",
            assigneeGithubId: 111,
            assigneeLogin: "dev-one",
            assignees: ["dev-one"],
            completedByPrNumber: 456,
            completedAt: "2026-06-10T00:00:00Z",
            githubCreatedAt: "2026-06-01T00:00:00Z",
            githubUpdatedAt: "2026-06-10T00:00:00Z",
        },
        {
            issueNumber: 124,
            questId: COMMUNITY_GITHUB_QUEST_ID,
            title: "Claimed issue",
            description: "Wire it.",
            url: "https://github.com/pollinations/pollinations/issues/124",
            rewardAmount: 20,
            balanceBucket: "tier",
            state: "claimed",
            assigneeGithubId: 222,
            assigneeLogin: "dev-two",
            assignees: ["dev-two"],
            completedByPrNumber: null,
            completedAt: null,
            githubCreatedAt: "2026-06-02T00:00:00Z",
            githubUpdatedAt: "2026-06-03T00:00:00Z",
        },
    ]);

    const calls = [];
    const spawn = (command, args, options) => {
        calls.push({ command, args, options });
        if (command === "npm") return { status: 0 };
        return { status: calls.length === 2 ? 0 : 1 };
    };
    const core = outputCore();

    await runQuestIssueSync({ core, cwd: "/repo", spawn });

    assert.equal(calls[0].command, "npm");
    assert.deepEqual(calls[0].args, ["ci", "--ignore-scripts"]);
    assert.equal(calls[0].options.cwd, "/repo");

    assert.equal(calls[1].command, "npx");
    assert.equal(
        calls[1].options.cwd,
        path.join("/repo", "enter.pollinations.ai"),
    );
    assert.deepEqual(calls[1].args.slice(0, 4), [
        "wrangler",
        "d1",
        "execute",
        "DB",
    ]);
    assert.match(
        calls[1].args[calls[1].args.indexOf("--command") + 1],
        /INSERT INTO github_quest_issues/,
    );
    assert.match(
        calls[1].args[calls[1].args.indexOf("--command") + 1],
        /Add a demo app/,
    );

    assert.deepEqual(JSON.parse(core.outputs.results), [
        {
            issue: 123,
            status: "recorded",
        },
        {
            issue: 124,
            status: "failed",
        },
    ]);
});
