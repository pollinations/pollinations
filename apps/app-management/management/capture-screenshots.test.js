const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    DESKTOP_USER_AGENT,
    applyAgentAction,
    applyCatalogChanges,
    applyMediaUrls,
    calculateDailyBatch,
    callScreenshotAgent,
    classifyAuthOrigin,
    classifyCaptureOutcome,
    hasAllowedOrigin,
    identifyAuthProvider,
    isAuthorizedRestorationEvent,
    isPublicAppUrl,
    listReviewerKeyIds,
    navigateToTarget,
    parseAgentJson,
    prepareRestoration,
    recoverApp,
    resolveAgentClickTarget,
    resolveTarget,
    revokeReviewerKeys,
    selectTargets,
    selectTargetsByUrl,
    setPollinationsAuthorizationLimits,
    validateAgentDecision,
    validateClickGuardDecision,
    validateGoogleAuthRequest,
    validateRestorationDecision,
    waitForSuccessfulNavigation,
} = require("./capture-screenshots.js");

const REMOVED_APP = {
    emoji: "🌻",
    name: "Sunflower Studio",
    url: "https://sunflower.test",
    description: "Creates images with Pollinations.",
    language: "en",
    category: "image",
    platform: "web",
    githubUsername: "gardener",
    githubUserId: "123",
    repositoryUrl: "https://github.com/gardener/sunflower",
    repositoryStars: 4,
    discordUsername: null,
    other: null,
    submittedDate: "2026-07-01",
    issueUrl: "https://github.com/pollinations/pollinations/issues/123",
    approvedDate: "2026-07-02",
    byop: false,
    requests24h: 0,
    screenshotUrl: "https://media.pollinations.ai/old.webp",
};

function restorationEvent(overrides = {}) {
    return {
        comment: {
            author_association: "NONE",
            body: "It is fixed now.",
            user: { login: "gardener", type: "User" },
        },
        issue: {
            html_url: REMOVED_APP.issueUrl,
            labels: [{ name: "APP-SUBMISSION" }],
            user: { login: "gardener" },
        },
        ...overrides,
    };
}

test("uses a normal desktop browser identity for public app captures", () => {
    assert.match(DESKTOP_USER_AGENT, /Chrome\/\d+/);
    assert.doesNotMatch(DESKTOP_USER_AGENT, /HeadlessChrome/);
});

test("recognizes only the three supported authentication providers", () => {
    assert.equal(identifyAuthProvider("Continue with Google"), "google");
    assert.equal(identifyAuthProvider("Sign in with GitHub"), "github");
    assert.equal(
        identifyAuthProvider("使用 Pollinations 登录授权"),
        "pollinations",
    );
    assert.equal(identifyAuthProvider("Continue with Discord"), null);
    assert.equal(identifyAuthProvider("Enter key manually"), null);
});

test("allows authentication only on the app and exact official origins", () => {
    const appOrigin = "https://app.test";
    assert.equal(
        classifyAuthOrigin("https://app.test/callback", appOrigin),
        "app",
    );
    assert.equal(
        classifyAuthOrigin(
            "https://accounts.google.com/o/oauth2/v2/auth",
            appOrigin,
        ),
        "google",
    );
    assert.equal(
        classifyAuthOrigin(
            "https://github.com/login/oauth/authorize",
            appOrigin,
        ),
        "github",
    );
    assert.equal(
        classifyAuthOrigin(
            "https://enter.pollinations.ai/authorize",
            appOrigin,
        ),
        "pollinations",
    );
    assert.equal(
        classifyAuthOrigin("https://accounts.google.com.evil.test", appOrigin),
        null,
    );
    assert.equal(
        classifyAuthOrigin("https://discord.com/oauth2/authorize", appOrigin),
        null,
    );
});

test("pins Pollinations authorization to zero Pollen and one day", async () => {
    const values = ["5", ""];
    const inputs = values.map((_, index) => ({
        fill: async (value) => {
            values[index] = value;
        },
        inputValue: async () => values[index],
    }));
    await setPollinationsAuthorizationLimits({
        getByRole: () => ({ all: async () => inputs }),
    });
    assert.deepEqual(values, ["0", "1"]);

    await assert.rejects(
        setPollinationsAuthorizationLimits({
            getByRole: () => ({ all: async () => inputs.slice(0, 1) }),
        }),
        /limits were not available/,
    );
});

test("allows only minimal online Google authentication scopes", () => {
    const allowed = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    allowed.searchParams.set("scope", "openid email profile");
    assert.equal(validateGoogleAuthRequest(allowed.href), true);

    const nested = new URL("https://accounts.google.com/v3/signin/identifier");
    nested.searchParams.set("continue", allowed.href);
    assert.equal(validateGoogleAuthRequest(nested.href), true);

    const offline = new URL(allowed);
    offline.searchParams.set("access_type", "offline");
    assert.equal(validateGoogleAuthRequest(offline.href), false);

    const broad = new URL(allowed);
    broad.searchParams.set(
        "scope",
        "openid email https://www.googleapis.com/auth/drive",
    );
    assert.equal(validateGoogleAuthRequest(broad.href), false);
    assert.equal(
        validateGoogleAuthRequest("https://discord.com/oauth2/authorize"),
        false,
    );
});

test("revokes every key created during an authenticated review", async () => {
    const deleted = [];
    let keys = ["existing", "new-review-key"];
    const context = {
        request: {
            delete: async (url) => {
                const keyId = decodeURIComponent(url.split("/").at(-1));
                deleted.push(keyId);
                keys = keys.filter((candidate) => candidate !== keyId);
                return { ok: () => true };
            },
            get: async () => ({
                json: async () => ({
                    data: keys.map((id) => ({ id })),
                }),
                ok: () => true,
            }),
        },
    };

    assert.deepEqual(
        await listReviewerKeyIds(context),
        new Set(["existing", "new-review-key"]),
    );
    await revokeReviewerKeys(context, ["new-review-key"]);
    assert.deepEqual(deleted, ["new-review-key"]);
    assert.deepEqual(await listReviewerKeyIds(context), new Set(["existing"]));
});

test("accepts restoration requests only from the submitter or a maintainer", () => {
    assert.equal(isAuthorizedRestorationEvent(restorationEvent()), true);
    assert.equal(
        isAuthorizedRestorationEvent(
            restorationEvent({
                comment: {
                    author_association: "MEMBER",
                    body: "The app works again.",
                    user: { login: "maintainer", type: "User" },
                },
            }),
        ),
        true,
    );
    assert.equal(
        isAuthorizedRestorationEvent(
            restorationEvent({
                comment: {
                    author_association: "NONE",
                    body: "Restore it.",
                    user: { login: "stranger", type: "User" },
                },
            }),
        ),
        false,
    );
});

test("rejects unsafe restoration targets", () => {
    assert.equal(isPublicAppUrl("https://app.test"), true);
    assert.equal(isPublicAppUrl("http://127.0.0.1"), false);
    assert.equal(isPublicAppUrl("http://169.254.169.254/latest"), false);
    assert.equal(isPublicAppUrl("http://10.0.0.4"), false);
    assert.equal(isPublicAppUrl("http://[::1]"), false);
    assert.equal(isPublicAppUrl("https://user:pass@app.test"), false);
    assert.deepEqual(
        validateRestorationDecision({
            decision: "restore",
            reason: "Use the repository.",
            url: "https://github.com/gardener/sunflower",
        }),
        {
            decision: "ignore",
            reason: "A repository is not a replacement for a working app",
            url: null,
        },
    );
});

test("the management agent prepares a recovered app for fresh review", async () => {
    const candidate = await prepareRestoration(
        restorationEvent(),
        [],
        "unused-token",
        "unused-model",
        () => REMOVED_APP,
        async () => ({
            decision: "restore",
            reason: "The submitter says it is fixed.",
            url: "https://new.sunflower.test",
        }),
    );
    assert.equal(candidate.url, "https://new.sunflower.test");
    assert.equal(candidate.screenshotUrl, null);
});

test("the management agent recovers a deleted row from Git history", (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-history-"));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    fs.mkdirSync(path.join(directory, "apps"));
    execFileSync("git", ["init"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
        cwd: directory,
    });
    const catalogFile = path.join(directory, "apps/catalog.json");
    fs.writeFileSync(
        catalogFile,
        `${JSON.stringify([REMOVED_APP], null, 2)}\n`,
    );
    execFileSync("git", ["add", "apps/catalog.json"], { cwd: directory });
    execFileSync("git", ["commit", "-m", "add app"], { cwd: directory });
    fs.writeFileSync(catalogFile, "[]\n");
    execFileSync("git", ["commit", "-am", "remove app"], { cwd: directory });

    assert.deepEqual(recoverApp(REMOVED_APP.issueUrl, directory), REMOVED_APP);
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

test("requires two matching 404 responses before confirming removal", async () => {
    let navigations = 0;
    const response = {
        status: () => 404,
    };
    const page = {
        goto: async () => {
            navigations++;
            return response;
        },
        waitForResponse: async () => {
            throw new Error("No successful navigation");
        },
        waitForTimeout: async () => {},
    };

    assert.deepEqual(
        await navigateToTarget(page, "https://missing.test", 30000),
        { response, status: 404 },
    );
    assert.equal(navigations, 2);
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

test("removes only explicitly confirmed catalog rows", () => {
    const apps = [
        {
            issueUrl: "https://github.com/pollinations/pollinations/issues/1",
            name: "Dead app",
            url: "https://dead.test",
        },
        {
            issueUrl: "https://github.com/pollinations/pollinations/issues/2",
            name: "Uncertain app",
            url: "https://uncertain.test",
        },
    ];
    const update = applyCatalogChanges(
        apps,
        [],
        [
            {
                catalogIndices: [0],
                review: {
                    decision: "remove",
                    reason: "The app returned HTTP 404 twice",
                },
                status: 404,
            },
            {
                catalogIndices: [1],
                review: {
                    decision: "reject",
                    reason: "The page did not finish loading",
                },
            },
        ],
    );

    assert.deepEqual(update.apps, [apps[1]]);
    assert.deepEqual(update.removedApps, [
        {
            issueUrl: apps[0].issueUrl,
            name: "Dead app",
            reason: "The app returned HTTP 404 twice",
            status: 404,
            url: "https://dead.test",
        },
    ]);
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
    assert.deepEqual(
        validateAgentDecision({
            action: null,
            decision: "needs_auth",
            reason: "The app is visible but requires Google sign-in.",
            score: 70,
        }),
        {
            action: null,
            decision: "needs_auth",
            reason: "The app is visible but requires Google sign-in.",
            score: 70,
        },
    );
    assert.deepEqual(
        validateAgentDecision({
            action: null,
            decision: "remove",
            reason: "The domain is visibly parked.",
            score: 100,
        }),
        {
            action: null,
            decision: "remove",
            reason: "The domain is visibly parked.",
            score: 100,
        },
    );
});

test("fails closed on invalid click-guard decisions", () => {
    assert.deepEqual(
        validateClickGuardDecision({
            reason: "Dismisses a passive consent layer.",
            safe: true,
        }),
        {
            reason: "Dismisses a passive consent layer.",
            safe: true,
        },
    );
    assert.throws(
        () => validateClickGuardDecision({ reason: "Missing safety flag." }),
        /invalid decision/,
    );
    assert.throws(
        () => validateClickGuardDecision({ reason: "", safe: false }),
        /invalid reason/,
    );
});

test("retries an empty screenshot-agent response", async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
        calls++;
        return {
            json: async () => ({
                choices: [
                    {
                        message: {
                            content:
                                calls === 1
                                    ? null
                                    : '{"decision":"reject","score":0,"reason":"No cover","action":null}',
                        },
                    },
                ],
            }),
            ok: true,
        };
    };
    try {
        const result = await callScreenshotAgent(
            JSON.stringify({ messages: [] }),
            "test-token",
            Date.now() + 5000,
        );
        assert.equal(calls, 2);
        assert.equal(result.decision.decision, "reject");
    } finally {
        global.fetch = originalFetch;
    }
});

test("parses a JSON decision wrapped by model formatting", () => {
    assert.deepEqual(
        parseAgentJson(
            '```json\n{"decision":"accept","score":90,"reason":"Ready","action":null}\n```',
        ),
        {
            action: null,
            decision: "accept",
            reason: "Ready",
            score: 90,
        },
    );
    assert.throws(() => parseAgentJson("no decision"), /No JSON object/);
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
        classifyCaptureOutcome({
            approved: false,
            review: { decision: "needs_auth" },
            success: true,
        }),
        "auth_required",
    );
    assert.equal(
        classifyCaptureOutcome({
            approved: false,
            review: { decision: "remove" },
            success: true,
        }),
        "confirmed_removal",
    );
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
