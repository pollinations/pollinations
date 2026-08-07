const assert = require("node:assert/strict");
const test = require("node:test");
const {
    DESKTOP_USER_AGENT,
    applyMediaUrls,
    calculateDailyBatch,
    isSafeDismissLabel,
    resolveTarget,
    selectTargets,
    selectTargetsByUrl,
    toCaptureTarget,
    validateReview,
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

test("recognizes safe first-visit dismiss controls without clicking primary actions", () => {
    for (const label of [
        "Accept all cookies",
        "Acepto y Continuar",
        "Skip Tour",
        "SKIP",
        "Close",
        "No thanks",
    ]) {
        assert.equal(isSafeDismissLabel(label), true, label);
    }

    for (const label of [
        "Next",
        "Open Character Forge",
        "Generate",
        "Delete account",
    ]) {
        assert.equal(isSafeDismissLabel(label), false, label);
    }
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

test("prefers a live app URL and falls back to a repository URL", () => {
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

test("validates visual review decisions", () => {
    assert.deepEqual(
        validateReview({
            decision: "approved",
            reason: "The app is clearly visible.",
            score: 92,
        }),
        {
            decision: "approved",
            reason: "The app is clearly visible.",
            score: 92,
        },
    );
    assert.throws(
        () =>
            validateReview({
                decision: "maybe",
                reason: "Uncertain",
                score: 50,
            }),
        /invalid decision/,
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

test("removes stale capture fields before a retry", () => {
    assert.deepEqual(
        toCaptureTarget({
            catalogIndices: [12],
            key: "website:https://app.test",
            context: {
                categories: ["chat"],
                descriptions: ["A useful app"],
                platforms: ["web"],
            },
            name: "Retry app",
            names: ["Retry app"],
            screenshotBytes: 12345,
            screenshotPath: "/tmp/old.png",
            source: "website",
            status: 200,
            success: true,
            targetUrl: "https://app.test",
        }),
        {
            catalogIndices: [12],
            context: {
                categories: ["chat"],
                descriptions: ["A useful app"],
                platforms: ["web"],
            },
            key: "website:https://app.test",
            name: "Retry app",
            names: ["Retry app"],
            source: "website",
            targetUrl: "https://app.test",
        },
    );
});
