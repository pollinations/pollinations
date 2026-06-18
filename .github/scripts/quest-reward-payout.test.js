const assert = require("node:assert/strict");
const test = require("node:test");

const {
    MAX_QUEST_PAYOUT,
    parseReward,
    runGitHubQuestEvaluators,
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
    labels = ["POLLEN-QUEST"],
    assignee = { login: "octocat", databaseId: 456 },
} = {}) {
    return {
        number,
        title,
        url: `https://github.com/pollinations/pollinations/issues/${number}`,
        body,
        labels: { nodes: labels.map((name) => ({ name })) },
        assignees: { nodes: assignee ? [assignee] : [] },
    };
}

function githubWithLinkedIssues(issues) {
    const calls = [];
    return {
        calls,
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
    };
}

test("parseReward reads numeric reward sections", () => {
    assert.equal(parseReward("### Reward\n12.5"), 12.5);
    assert.equal(parseReward("## Goal\nShip it\n\n### Reward\n20"), 20);
    assert.equal(parseReward("### Reward\nnope"), null);
});

test("community issue quest returns a payout candidate for merged quest PRs", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            number: 321,
            title: "Fix a model",
            body: "### Reward\n15",
            assignee: { login: "dev-user", databaseId: 999 },
        }),
    ]);

    const result = await runGitHubQuestEvaluators({
        github,
        context: pullRequestContext(),
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.reviews.length, 0);
    assert.deepEqual(result.candidates[0], {
        questTypeId: "github:community_issue_quest",
        balanceBucket: "pack",
        payoutScope: "once_per_event_per_user",
        issue: 321,
        issueTitle: "Fix a model",
        issueUrl: "https://github.com/pollinations/pollinations/issues/321",
        prNumber: 42,
        recipient: "dev-user",
        recipientId: 999,
        role: "assignee",
        amount: 15,
        eventId: "issue:321",
        sourceRef: "pr:42",
        metadata: {
            issueNumber: 321,
            issueTitle: "Fix a model",
            issueUrl: "https://github.com/pollinations/pollinations/issues/321",
            prNumber: 42,
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

    assert.deepEqual(result.candidates, []);
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

    assert.deepEqual(result.candidates, []);
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

    assert.deepEqual(result.candidates, []);
    assert.deepEqual(result.reviews, []);
});

test("payout amount validator enforces the shared ceiling", () => {
    assert.equal(validateQuestPayoutAmount(1), null);
    assert.equal(validateQuestPayoutAmount(MAX_QUEST_PAYOUT), null);
    assert.equal(
        validateQuestPayoutAmount(MAX_QUEST_PAYOUT + 1),
        `reward amount <= ${MAX_QUEST_PAYOUT}`,
    );
});
