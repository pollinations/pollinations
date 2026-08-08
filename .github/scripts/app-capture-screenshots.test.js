const assert = require("node:assert/strict");
const test = require("node:test");
const {
    DESKTOP_USER_AGENT,
    applyAgentAction,
    applyMediaUrls,
    calculateDailyBatch,
    classifyCaptureOutcome,
    hasAllowedOrigin,
    resolveAgentClickTarget,
    resolveTarget,
    selectTargets,
    selectTargetsByUrl,
    validateAgentDecision,
    waitForSuccessfulNavigation,
} = require("./app-capture-screenshots.js");

test("uses a normal desktop browser identity for public app captures", () => {
    assert.match(DESKTOP_USER_AGENT, /Chrome\/\d+/);
    assert.doesNotMatch(DESKTOP_USER_AGENT, /HeadlessChrome/);
});

test("allows a blocked navigation to resolve to a successful document", async () => {
    const mainFrame = {};
    const successfulResponse = {
        frame: () => mainFrame,
        request: () => ({ isNavigationRequest: () => true }),
        status: () => 200,
    };
    const page = {
        mainFrame: () => mainFrame,
        waitForResponse: async (predicate, options) => {
            assert.equal(options.timeout, 10000);
            assert.equal(predicate(successfulResponse), true);
            return successfulResponse;
        },
    };

    assert.equal(
        await waitForSuccessfulNavigation(page, { status: () => 403 }, 30000),
        200,
    );
});

test("applies one uploaded screenshot URL to duplicate catalog rows", () => {
    const apps = [
        {
            name: "Duplicate app",
            screenshotUrl: "old-one",
            url: "https://app.test",
        },
        {
            name: "Duplicate app",
            screenshotUrl: "old-two",
            url: "https://app.test",
        },
        {
            name: "Other app",
            screenshotUrl: "unchanged",
            url: "https://other.test",
        },
    ];

    const rowsUpdated = applyMediaUrls(apps, [
        {
            catalogIndices: [0, 1],
            mediaUrl: "https://media.pollinations.ai/new-screenshot",
            success: true,
        },
    ]);

    assert.equal(rowsUpdated, 2);
    assert.equal(
        apps[0].screenshotUrl,
        "https://media.pollinations.ai/new-screenshot",
    );
    assert.equal(apps[1].screenshotUrl, apps[0].screenshotUrl);
    assert.equal(apps[2].screenshotUrl, "unchanged");
});

test("uses a repository only when no website URL is available", () => {
    assert.deepEqual(
        resolveTarget(
            {
                repositoryUrl: "https://github.com/example/app",
                url: "https://app.test",
            },
            3,
        ),
        {
            catalogIndex: 3,
            source: "website",
            targetUrl: "https://app.test",
        },
    );
    assert.deepEqual(
        resolveTarget(
            { repositoryUrl: "https://github.com/example/app", url: null },
            4,
        ),
        {
            catalogIndex: 4,
            source: "repository",
            targetUrl: "https://github.com/example/app",
        },
    );
    assert.deepEqual(
        resolveTarget(
            { repositoryUrl: null, url: "https://github.com/example/app" },
            5,
        ),
        {
            catalogIndex: 5,
            source: "repository",
            targetUrl: "https://github.com/example/app",
        },
    );
});

test("selects missing screenshots, deduplicates targets, and reports omissions", () => {
    const { skipped, targets } = selectTargets(
        [
            {
                category: "chat",
                description: "The first app",
                name: "One",
                platform: "web",
                screenshotUrl: null,
                url: "https://app.test",
            },
            {
                category: "chat",
                description: "The duplicate app",
                name: "Duplicate",
                platform: "web",
                url: "https://app.test",
            },
            {
                category: "build",
                description: "A repository app",
                name: "Repository",
                platform: "library",
                repositoryUrl: "https://github.com/example/repo",
            },
            { name: "No target" },
            {
                name: "Already captured",
                screenshotUrl: "https://media.pollinations.ai/existing.webp",
                url: "https://captured.test",
            },
        ],
        "missing",
    );

    assert.equal(targets.length, 2);
    assert.deepEqual(targets[0].catalogIndices, [0, 1]);
    assert.equal(targets[0].source, "website");
    assert.deepEqual(targets[0].context, {
        categories: ["chat", "chat"],
        descriptions: ["The first app", "The duplicate app"],
        platforms: ["web", "web"],
    });
    assert.equal(targets[1].source, "repository");
    assert.deepEqual(skipped, [
        {
            catalogIndex: 3,
            name: "No target",
            reason: "No website or repository URL",
        },
    ]);
});

test("selects an explicit non-contiguous target URL list", () => {
    const targets = [
        { name: "One", targetUrl: "https://one.test" },
        { name: "Two", targetUrl: "https://two.test" },
        { name: "Three", targetUrl: "https://three.test" },
    ];

    assert.deepEqual(
        selectTargetsByUrl(targets, ["https://three.test", "https://one.test"]),
        [targets[0], targets[2]],
    );
    assert.throws(
        () => selectTargetsByUrl(targets, ["https://missing.test"]),
        /not found in catalog/,
    );
    assert.throws(
        () => selectTargetsByUrl(targets, []),
        /non-empty JSON array/,
    );
});

test("validates final screenshot-agent decisions", () => {
    assert.deepEqual(
        validateAgentDecision({
            action: null,
            decision: "accept",
            reason: "The app is clearly visible.",
            score: 92,
        }),
        {
            action: null,
            decision: "accept",
            reason: "The app is clearly visible.",
            score: 92,
        },
    );
    assert.throws(
        () =>
            validateAgentDecision({
                decision: "maybe",
                reason: "Uncertain",
                score: 50,
            }),
        /invalid decision/,
    );
    assert.throws(
        () =>
            validateAgentDecision({
                decision: "accept",
                reason: "Invalid score",
                score: Number.NaN,
            }),
        /invalid score/,
    );
});

test("allows only structured actions against supplied page controls", () => {
    assert.deepEqual(
        validateAgentDecision(
            {
                action: { elementId: "f0-e2", type: "click" },
                decision: "act",
                reason: "Dismiss the cookie banner.",
                score: 60,
            },
            new Set(["f0-e2"]),
        ),
        {
            action: { elementId: "f0-e2", type: "click" },
            decision: "act",
            reason: "Dismiss the cookie banner.",
            score: 60,
        },
    );
    assert.throws(
        () =>
            validateAgentDecision(
                {
                    action: { elementId: "f0-e9", type: "click" },
                    decision: "act",
                    reason: "Click an unavailable control.",
                    score: 20,
                },
                new Set(["f0-e2"]),
            ),
        /unavailable element/,
    );
    assert.throws(
        () =>
            validateAgentDecision({
                action: { direction: "sideways", type: "scroll" },
                decision: "act",
                reason: "Move sideways.",
                score: 20,
            }),
        /scroll direction/,
    );
});

test("resolves a unique control label in any language", () => {
    const decision = {
        action: { elementId: "Aceitar", type: "click" },
        decision: "act",
        reason: "Dismiss the cookie dialog.",
        score: 60,
    };
    assert.deepEqual(
        resolveAgentClickTarget(decision, [
            { elementId: "f0-e3", label: "Aceitar" },
        ]),
        {
            ...decision,
            action: { elementId: "f0-e3", type: "click" },
        },
    );
});

test("treats a disappeared control as a recoverable action", async () => {
    const result = await applyAgentAction(
        { url: () => "https://app.test/inside" },
        { elementId: "f0-e1", type: "click" },
        new Map([["f0-e1", { isVisible: async () => false }]]),
        "https://app.test",
    );
    assert.equal(result.ok, false);
    assert.equal(result.fatal, undefined);
    assert.match(result.reason, /disappeared/);
});

test("rejects navigation away from the validated website", async () => {
    const page = {
        url: () => "https://other.test/landing",
        waitForFunction: async () => {},
        waitForLoadState: async () => {},
        waitForNavigation: async () => ({ status: () => 200 }),
        waitForTimeout: async () => {},
    };
    const result = await applyAgentAction(
        page,
        { elementId: "f0-e1", type: "click" },
        new Map([
            ["f0-e1", { click: async () => {}, isVisible: async () => true }],
        ]),
        "https://app.test",
    );
    assert.deepEqual(result, {
        fatal: true,
        ok: false,
        reason: "The action navigated away from the validated website",
    });
});

test("rejects cross-origin navigation even when the click throws", async () => {
    const page = {
        url: () => "https://other.test/landing",
        waitForNavigation: async () => null,
    };
    const result = await applyAgentAction(
        page,
        { elementId: "f0-e1", type: "click" },
        new Map([
            [
                "f0-e1",
                {
                    click: async () => {
                        throw new Error("Navigation interrupted the click");
                    },
                    isVisible: async () => true,
                },
            ],
        ]),
        "https://app.test",
    );
    assert.equal(result.fatal, true);
    assert.match(result.reason, /navigated away/);
});

test("checks page origin independently of action success", () => {
    assert.equal(
        hasAllowedOrigin(
            { url: () => "https://app.test/inside" },
            "https://app.test",
        ),
        true,
    );
    assert.equal(
        hasAllowedOrigin(
            { url: () => "https://other.test/landing" },
            "https://app.test",
        ),
        false,
    );
});

test("reports capture outcomes separately", () => {
    assert.equal(classifyCaptureOutcome({ approved: true }), "approved");
    assert.equal(
        classifyCaptureOutcome({ approved: false, success: true }),
        "agent_rejected",
    );
    assert.equal(
        classifyCaptureOutcome({ approved: false, success: false }),
        "technical_failure",
    );
});

test("rotates deterministic daily batches across the target set", () => {
    const first = calculateDailyBatch(
        839,
        100,
        new Date("2026-08-06T12:00:00Z"),
    );
    const next = calculateDailyBatch(
        839,
        100,
        new Date("2026-08-07T12:00:00Z"),
    );

    assert.equal(first.batchCount, 9);
    assert.equal(first.offset, first.batchIndex * 100);
    assert.equal(next.batchIndex, (first.batchIndex + 1) % first.batchCount);
    assert.deepEqual(calculateDailyBatch(0, 100), {
        batchCount: 0,
        batchIndex: 0,
        offset: 0,
    });
});
