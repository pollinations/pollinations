const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
    evaluateQuestPayouts,
    MAX_QUEST_PAYOUT,
    parseReward,
    runGitHubQuestEvaluators,
    runPollenGrant,
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

test("evaluateQuestPayouts writes payout candidates output", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            number: 321,
            body: "### Reward\n15",
            assignee: { login: "dev-user", databaseId: 999 },
        }),
    ]);
    const core = outputCore();

    await evaluateQuestPayouts({
        github,
        context: pullRequestContext(),
        core,
    });

    const payouts = JSON.parse(core.outputs.payouts);
    assert.equal(payouts.length, 1);
    assert.equal(payouts[0].recipient, "dev-user");
    assert.equal(payouts[0].role, "assignee");
    assert.equal(payouts[0].amount, 15);
    assert.deepEqual(github.comments, []);
});

test("evaluateQuestPayouts comments when linked quest data is incomplete", async () => {
    const github = githubWithLinkedIssues([
        linkedIssue({
            body: "### Reward\nnot-a-number",
            assignee: null,
        }),
    ]);
    const core = outputCore();

    await evaluateQuestPayouts({
        github,
        context: pullRequestContext(),
        core,
    });

    assert.equal(core.outputs.payouts, "");
    assert.equal(github.comments.length, 1);
    assert.equal(github.comments[0].issue_number, 123);
    assert.match(github.comments[0].body, /\*\*Missing:\*\* assignee/);
    assert.match(github.comments[0].body, /valid reward amount in issue body/);
});

test("runPollenGrant installs from the repo root and grants each payout", async (t) => {
    const previousPayouts = process.env.PAYOUTS;
    t.after(() => {
        if (previousPayouts === undefined) {
            delete process.env.PAYOUTS;
        } else {
            process.env.PAYOUTS = previousPayouts;
        }
    });

    process.env.PAYOUTS = JSON.stringify([
        {
            issue: 123,
            prNumber: 456,
            recipient: "dev-one",
            recipientId: 111,
            role: "assignee",
            amount: 15,
        },
        {
            issue: 124,
            prNumber: 457,
            recipient: "dev-two",
            recipientId: 222,
            role: "collaborator",
            amount: 20,
        },
    ]);

    const calls = [];
    const spawn = (command, args, options) => {
        calls.push({ command, args, options });
        if (command === "npm") return { status: 0 };
        return { status: calls.length === 2 ? 0 : 3 };
    };
    const core = outputCore();

    await runPollenGrant({ core, cwd: "/repo", spawn });

    assert.equal(calls[0].command, "npm");
    assert.deepEqual(calls[0].args, ["ci", "--ignore-scripts"]);
    assert.equal(calls[0].options.cwd, "/repo");

    assert.equal(calls[1].command, "npx");
    assert.equal(
        calls[1].options.cwd,
        path.join("/repo", "enter.pollinations.ai"),
    );
    assert.deepEqual(calls[1].args.slice(0, 3), [
        "tsx",
        "src/tier-progression/shared/quest-grant-pollen.ts",
        "grant",
    ]);
    assert.equal(
        calls[1].args[calls[1].args.indexOf("--role") + 1],
        "assignee",
    );
    assert.equal(
        calls[2].args[calls[2].args.indexOf("--role") + 1],
        "collaborator",
    );

    assert.deepEqual(JSON.parse(core.outputs.results), [
        {
            issue: 123,
            user: "dev-one",
            amount: 15,
            status: "granted",
        },
        {
            issue: 124,
            user: "dev-two",
            amount: 20,
            status: "duplicate",
        },
    ]);
});
