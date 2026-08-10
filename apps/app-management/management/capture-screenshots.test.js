const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
    DESKTOP_USER_AGENT,
    SCREENSHOT_AGENT_SYSTEM_PROMPT,
    applyAgentAction,
    applyCatalogChanges,
    applyMediaUrls,
    attachReviewEvidence,
    attachUploadOutcomes,
    calculateDailyBatch,
    callScreenshotAgent,
    classifyAuthOrigin,
    classifyCaptureOutcome,
    classifyRetryKind,
    collectAgentControls,
    compactGithubEvidence,
    githubApiUrl,
    hasAllowedOrigin,
    identifyRedirectedAuthProvider,
    investigateTechnicalFailure,
    listReviewerKeyIds,
    navigateToTarget,
    normalizeHttpUrl,
    normalizedPointToViewport,
    parseAgentJson,
    preferDismissalBeforeAuthentication,
    readStorageState,
    requestAgentDecision,
    reviewContextOptions,
    resolveTarget,
    revokeReviewerKeys,
    selectTargets,
    selectTargetsByUrl,
    selectDailyTargets,
    setPollinationsAuthorizationLimits,
    validateAgentDecision,
    validateClickGuardDecision,
    validateGoogleAuthRequest,
    validateFreshAgentDecision,
    validateRemovalDecision,
    waitForSuccessfulNavigation,
} = require("./capture-screenshots.js");

test("uses a normal desktop browser identity for public app captures", () => {
    assert.match(DESKTOP_USER_AGENT, /Chrome\/\d+/);
    assert.doesNotMatch(DESKTOP_USER_AGENT, /HeadlessChrome/);
});

test("reads plain and compressed Playwright authentication state", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-auth-state-"));
    const state = { cookies: [], origins: [] };
    const plainPath = path.join(directory, "plain.json");
    const compressedPath = path.join(directory, "compressed.txt");
    fs.writeFileSync(plainPath, JSON.stringify(state));
    fs.writeFileSync(
        compressedPath,
        require("node:zlib").gzipSync(JSON.stringify(state)).toString("base64"),
    );

    assert.deepEqual(readStorageState(plainPath), state);
    assert.deepEqual(readStorageState(compressedPath), state);
});

test("keeps routine review anonymous and adds auth state only on demand", () => {
    const state = { cookies: [], origins: [] };
    assert.equal("storageState" in reviewContextOptions(), false);
    assert.equal(reviewContextOptions(state).storageState, state);
});

test("records failed cover uploads as unresolved outcomes", () => {
    const [result] = attachUploadOutcomes(
        [
            {
                approved: true,
                outcome: "approved",
                targetUrl: "https://app.test",
            },
        ],
        [
            {
                error: "Media upload returned 503",
                success: false,
                targetUrl: "https://app.test",
            },
        ],
    );
    assert.equal(result.outcome, "retry");
    assert.equal(result.retryKind, "upload");
    assert.equal(result.uploadError, "Media upload returned 503");
});

test("recognizes redirects to official authentication without changing app identity", () => {
    assert.equal(
        identifyRedirectedAuthProvider(
            "https://example-app.test",
            "https://enter.pollinations.ai/authorize",
        ),
        "pollinations",
    );
    assert.equal(
        identifyRedirectedAuthProvider(
            "https://example-app.test",
            "https://example-app.test/login",
        ),
        null,
    );
    assert.equal(
        identifyRedirectedAuthProvider(
            "https://example-app.test",
            "https://untrusted-login.test",
        ),
        null,
    );
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
    const values = { budget: "5", expiry: "" };
    const inputs = Object.fromEntries(
        Object.keys(values).map((name) => [
            name,
            {
                count: async () => 1,
                fill: async (value) => {
                    values[name] = value;
                },
                inputValue: async () => values[name],
            },
        ]),
    );
    await setPollinationsAuthorizationLimits({
        locator: (selector) =>
            selector.includes("pollen-budget") ? inputs.budget : inputs.expiry,
    });
    assert.deepEqual(values, { budget: "0", expiry: "1" });

    await assert.rejects(
        setPollinationsAuthorizationLimits({
            locator: () => ({ count: async () => 0 }),
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
    assert.equal(
        validateGoogleAuthRequest(
            "https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fapp.test",
        ),
        true,
    );

    const offline = new URL(allowed);
    offline.searchParams.set("access_type", "offline");
    assert.equal(validateGoogleAuthRequest(offline.href), false);

    const broad = new URL(allowed);
    broad.searchParams.set(
        "scope",
        "openid email https://www.googleapis.com/auth/drive",
    );
    assert.equal(validateGoogleAuthRequest(broad.href), false);
    const nestedBroad = new URL(
        "https://accounts.google.com/v3/signin/identifier",
    );
    nestedBroad.searchParams.set("continue", broad.href);
    assert.equal(validateGoogleAuthRequest(nestedBroad.href), false);
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

test("retries any non-successful navigation before investigation", async () => {
    let navigations = 0;
    const response = { status: () => 503 };
    const page = {
        goto: async () => {
            navigations++;
            return response;
        },
        mainFrame: () => ({}),
        waitForResponse: async () => null,
        waitForTimeout: async () => {},
    };

    assert.deepEqual(
        await navigateToTarget(page, "https://temporary.test", 30000),
        { response, status: 503 },
    );
    assert.equal(navigations, 2);
});

test("collects only compact evidence from exact GitHub resources", () => {
    assert.equal(
        githubApiUrl(
            "https://github.com/pollinations/pollinations/issues/123",
            "issue",
        ),
        "https://api.github.com/repos/pollinations/pollinations/issues/123",
    );
    assert.equal(
        githubApiUrl("https://github.com/example/app/tree/main", "repository"),
        "https://api.github.com/repos/example/app",
    );
    assert.equal(
        githubApiUrl("https://github.com.evil.test/example/app", "repository"),
        null,
    );
    assert.deepEqual(
        compactGithubEvidence(
            {
                archived: true,
                description: "A project",
                disabled: false,
                full_name: "example/app",
                homepage: "https://app.test",
                pushed_at: "2026-01-01T00:00:00Z",
                ignored: "not sent to the model",
            },
            "repository",
        ),
        {
            archived: true,
            description: "A project",
            disabled: false,
            fullName: "example/app",
            homepage: "https://app.test",
            pushedAt: "2026-01-01T00:00:00Z",
        },
    );
});

test("technical removals require an independent agent confirmation", async () => {
    const decisions = [
        { decision: "remove", reason: "The host no longer exists." },
        { decision: "remove", reason: "The evidence is conclusive." },
    ];
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => ({
        json: async () => ({
            choices: [
                { message: { content: JSON.stringify(decisions[calls++]) } },
            ],
            model: "test-model",
        }),
        ok: true,
    });
    try {
        const result = await investigateTechnicalFailure(
            {
                context: {
                    descriptions: ["A test app"],
                    platforms: ["web"],
                },
                names: ["Test app"],
                targetUrl: "https://missing.test",
            },
            "net::ERR_NAME_NOT_RESOLVED",
            "test-token",
            "test-model",
        );
        assert.equal(calls, 2);
        assert.equal(result.decision.decision, "remove");
    } finally {
        global.fetch = originalFetch;
    }
});

test("invalid technical confirmation fails closed without losing the report", async () => {
    const decisions = [
        { decision: "remove", reason: "The host no longer exists." },
        { decision: "accept", reason: "Invalid confirmation shape." },
    ];
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => ({
        json: async () => ({
            choices: [
                { message: { content: JSON.stringify(decisions[calls++]) } },
            ],
            model: "test-model",
        }),
        ok: true,
    });
    try {
        const result = await investigateTechnicalFailure(
            {
                context: {
                    descriptions: ["A test app"],
                    platforms: ["web"],
                },
                names: ["Test app"],
                targetUrl: "https://missing.test",
            },
            "net::ERR_NAME_NOT_RESOLVED",
            "test-token",
            "test-model",
        );
        assert.equal(calls, 2);
        assert.equal(result.decision.decision, "retry");
        assert.equal(
            result.decision.proposal.reason,
            "The host no longer exists.",
        );
        assert.match(result.decision.reason, /did not confirm removal/);
    } finally {
        global.fetch = originalFetch;
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
            confirmationReason: "The app returned HTTP 404 twice",
            issueUrl: apps[0].issueUrl,
            name: "Dead app",
            proposalReason: "The app returned HTTP 404 twice",
            reason: "The app returned HTTP 404 twice",
            status: 404,
            url: "https://dead.test",
        },
    ]);
});

test("applies an independently accepted catalog name correction", () => {
    const apps = [
        {
            name: "Old working title",
            screenshotUrl: "https://media.pollinations.ai/old.webp",
            url: "https://app.test",
        },
    ];
    const result = applyCatalogChanges(
        apps,
        [],
        [
            {
                approved: true,
                catalogIndices: [0],
                review: {
                    catalogUpdate: {
                        name: "Canonical Product",
                        reason: "The accepted app screen shows this product name.",
                    },
                    decision: "accept",
                },
            },
        ],
    );

    assert.equal(result.apps[0].name, "Canonical Product");
    assert.equal(result.metadataRowsUpdated, 1);
    assert.deepEqual(result.updatedApps, [
        {
            catalogIndex: 0,
            changes: [
                {
                    field: "name",
                    from: "Old working title",
                    reason: "The accepted app screen shows this product name.",
                    to: "Canonical Product",
                },
            ],
            name: "Canonical Product",
        },
    ]);
});

test("never applies catalog suggestions from an unapproved capture", () => {
    const apps = [{ name: "Trusted name", url: "https://app.test" }];
    const result = applyCatalogChanges(
        apps,
        [],
        [
            {
                approved: false,
                catalogIndices: [0],
                review: {
                    catalogUpdate: {
                        name: "Untrusted name",
                        reason: "The rejected screen suggested it.",
                    },
                    decision: "reject",
                },
            },
        ],
    );
    assert.equal(result.apps[0].name, "Trusted name");
    assert.deepEqual(result.updatedApps, []);
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

test("normalizes a safe scheme-less app URL for review", () => {
    assert.equal(
        normalizeHttpUrl("example.test/app"),
        "https://example.test/app",
    );
    assert.equal(
        normalizeHttpUrl(" https://example.test/app "),
        "https://example.test/app",
    );
    assert.equal(normalizeHttpUrl("localhost:3000"), null);
    assert.equal(normalizeHttpUrl("127.0.0.1/app"), null);
    assert.equal(normalizeHttpUrl("not a url"), null);

    assert.deepEqual(resolveTarget({ url: "example.test/app" }, 8), {
        catalogIndex: 8,
        catalogUrlCorrection: {
            from: "example.test/app",
            reason: "The catalog URL was normalized to an absolute HTTPS URL",
            to: "https://example.test/app",
        },
        source: "website",
        targetUrl: "https://example.test/app",
    });
});

test("applies a normalized URL only after its app is accepted", () => {
    const apps = [
        { name: "Accepted", url: "accepted.test" },
        { name: "Retry", url: "retry.test" },
    ];
    const result = applyCatalogChanges(
        apps,
        [],
        [
            {
                approved: true,
                catalogIndices: [0],
                catalogUrlCorrections: [
                    {
                        catalogIndex: 0,
                        from: "accepted.test",
                        reason: "The catalog URL was missing its HTTPS scheme",
                        to: "https://accepted.test/",
                    },
                ],
                review: { decision: "accept" },
            },
            {
                approved: false,
                catalogIndices: [1],
                catalogUrlCorrections: [
                    {
                        catalogIndex: 1,
                        from: "retry.test",
                        reason: "The catalog URL was missing its HTTPS scheme",
                        to: "https://retry.test/",
                    },
                ],
                review: { decision: "retry" },
            },
        ],
    );

    assert.equal(result.apps[0].url, "https://accepted.test/");
    assert.equal(result.apps[1].url, "retry.test");
    assert.equal(result.metadataRowsUpdated, 1);
    assert.equal(result.updatedApps[0].changes[0].field, "url");
});

test("uses the repository as the public cover for Discord bots", () => {
    assert.deepEqual(
        resolveTarget(
            {
                platform: "discord",
                repositoryUrl: "https://github.com/example/bot",
                url: "https://discord.com/oauth2/authorize?client_id=123",
            },
            6,
        ),
        {
            catalogIndex: 6,
            source: "repository",
            targetUrl: "https://github.com/example/bot",
        },
    );
});

test("uses the repository as the public cover for CLI apps", () => {
    assert.deepEqual(
        resolveTarget(
            {
                platform: "cli",
                repositoryUrl: "https://github.com/example/cli",
                url: "https://example.test/downloads",
            },
            7,
        ),
        {
            catalogIndex: 7,
            source: "repository",
            targetUrl: "https://github.com/example/cli",
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
        }),
        {
            action: null,
            catalogUpdate: null,
            decision: "accept",
            reason: "The app is clearly visible.",
        },
    );
    assert.throws(
        () =>
            validateAgentDecision({
                decision: "maybe",
                reason: "Uncertain",
            }),
        /invalid decision/,
    );
    assert.deepEqual(
        validateAgentDecision(
            {
                action: { elementId: "f0-e2", type: "authenticate" },
                decision: "authenticate",
                reason: "The app requires official Google sign-in.",
            },
            new Set(["f0-e2"]),
        ),
        {
            action: { elementId: "f0-e2", type: "authenticate" },
            catalogUpdate: null,
            decision: "authenticate",
            reason: "The app requires official Google sign-in.",
        },
    );
    assert.throws(
        () =>
            validateAgentDecision({
                action: { elementId: "missing", type: "authenticate" },
                decision: "authenticate",
                reason: "Authenticate.",
            }),
        /unavailable authentication control/,
    );
    assert.deepEqual(
        validateAgentDecision({
            action: null,
            decision: "remove",
            reason: "The domain is visibly parked.",
        }),
        {
            action: null,
            catalogUpdate: null,
            decision: "remove",
            reason: "The domain is visibly parked.",
        },
    );
    assert.deepEqual(
        validateAgentDecision({
            action: null,
            catalogUpdate: {
                name: " Canonical Product ",
                reason: " Visible on the accepted screen. ",
            },
            decision: "accept",
            reason: "The product is clearly visible.",
        }).catalogUpdate,
        {
            name: "Canonical Product",
            reason: "Visible on the accepted screen.",
        },
    );
    assert.throws(
        () =>
            validateAgentDecision({
                action: null,
                catalogUpdate: {
                    name: "Untrusted rename",
                    reason: "Not accepted.",
                },
                decision: "reject",
                reason: "The screen is unusable.",
            }),
        /without acceptance/,
    );
});

test("loads a focused screenshot-agent system prompt", () => {
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /Goal:/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /"type":"go_back"/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /"type":"press_escape"/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /Never type/);
    assert.match(
        SCREENSHOT_AGENT_SYSTEM_PROMPT,
        /advertising is a removal signal/,
    );
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /API-key prompt/);
    assert.match(
        SCREENSHOT_AGENT_SYSTEM_PROMPT,
        /Explicit sexual or pornographic products/,
    );
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /not adult evidence/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /Horror, violence, fear/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /When Source is repository/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /Authentication is forbidden/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /email\/password form/);
    assert.match(SCREENSHOT_AGENT_SYSTEM_PROMPT, /multi-step onboarding/);
    assert.doesNotMatch(
        SCREENSHOT_AGENT_SYSTEM_PROMPT,
        /accept a matching readable product despite an advertisement/,
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

test("the independent removal gate cannot accept a cover", () => {
    assert.equal(
        validateRemovalDecision({
            decision: "remove",
            reason: "The destination is conclusively parked.",
        }).decision,
        "remove",
    );
    assert.throws(
        () =>
            validateRemovalDecision({
                decision: "accept",
                reason: "Wrong review phase.",
            }),
        /removal review was invalid/,
    );
});

test("dismisses an explicit presentation layer before authentication", () => {
    assert.deepEqual(
        preferDismissalBeforeAuthentication(
            {
                action: { elementId: "authorize", type: "authenticate" },
                decision: "authenticate",
                reason: "Authentication is visible.",
            },
            [
                { elementId: "authorize", label: "Authorize & Continue" },
                { elementId: "close", label: "Close" },
            ],
        ),
        {
            action: { elementId: "close", type: "click" },
            decision: "act",
            reason: "Dismiss the presentation layer before considering authentication",
        },
    );
});

test("a model-proposed removal requires independent confirmation", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-removal-"));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    const screenshotPath = path.join(directory, "screen.png");
    fs.writeFileSync(screenshotPath, "image");
    const decisions = [
        {
            action: null,
            catalogUpdate: null,
            decision: "remove",
            reason: "The page appears parked.",
        },
        {
            action: null,
            catalogUpdate: null,
            decision: "reject",
            reason: "The evidence is not conclusive.",
        },
    ];
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => ({
        json: async () => ({
            choices: [
                { message: { content: JSON.stringify(decisions[calls++]) } },
            ],
            model: "test-model",
        }),
        ok: true,
    });
    try {
        const result = await requestAgentDecision(
            {
                finalUrl: "https://app.test",
                pageTitle: "App",
                screenshotPath,
            },
            {
                context: {
                    categories: ["chat"],
                    descriptions: ["A test app"],
                    platforms: ["web"],
                },
                names: ["Test app"],
                source: "website",
            },
            [],
            6,
            [],
            Date.now() + 5000,
            "test-token",
            "test-model",
        );
        assert.equal(calls, 2);
        assert.equal(result.decision, "retry");
        assert.equal(result.proposal.reason, "The page appears parked.");
        assert.equal(
            result.confirmation.reason,
            "The evidence is not conclusive.",
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test("retries an invalid independent removal confirmation", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-removal-"));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    const screenshotPath = path.join(directory, "screen.png");
    fs.writeFileSync(screenshotPath, "image");
    const decisions = [
        {
            action: null,
            catalogUpdate: null,
            decision: "remove",
            reason: "The page is an adult service.",
        },
        {
            action: null,
            catalogUpdate: null,
            decision: "accept",
            reason: "Invalid in the removal-review phase.",
        },
        {
            action: null,
            catalogUpdate: null,
            decision: "remove",
            reason: "The page conclusively shows an adult service.",
        },
    ];
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => ({
        json: async () => ({
            choices: [
                { message: { content: JSON.stringify(decisions[calls++]) } },
            ],
            model: "test-model",
        }),
        ok: true,
    });
    try {
        const result = await requestAgentDecision(
            {
                finalUrl: "https://app.test",
                pageTitle: "App",
                screenshotPath,
            },
            {
                context: {
                    categories: ["chat"],
                    descriptions: ["A test app"],
                    platforms: ["web"],
                },
                names: ["Test app"],
                source: "website",
            },
            [],
            6,
            [],
            Date.now() + 5000,
            "test-token",
            "test-model",
        );
        assert.equal(calls, 3);
        assert.equal(result.decision, "remove");
    } finally {
        global.fetch = originalFetch;
    }
});

test("acceptance is terminal without a redundant confirmation", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-quality-"));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    const screenshotPath = path.join(directory, "screen.png");
    fs.writeFileSync(screenshotPath, "image");
    const decisions = [
        {
            action: null,
            catalogUpdate: null,
            decision: "accept",
            reason: "The app is clearly visible.",
        },
    ];
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => ({
        json: async () => ({
            choices: [
                { message: { content: JSON.stringify(decisions[calls++]) } },
            ],
            model: "test-model",
        }),
        ok: true,
    });
    try {
        const result = await requestAgentDecision(
            {
                finalUrl: "https://app.test",
                pageTitle: "App",
                screenshotPath,
            },
            {
                context: {
                    categories: ["chat"],
                    descriptions: ["A test app"],
                    platforms: ["web"],
                },
                names: ["Test app"],
                source: "website",
            },
            [],
            6,
            [],
            Date.now() + 5000,
            "test-token",
            "test-model",
        );
        assert.equal(calls, 1);
        assert.equal(result.decision, "accept");
    } finally {
        global.fetch = originalFetch;
    }
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
                                    : '{"decision":"reject","reason":"No cover","action":null}',
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
            '```json\n{"decision":"accept","reason":"Ready","action":null}\n```',
        ),
        {
            action: null,
            decision: "accept",
            reason: "Ready",
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
            },
            new Set(["f0-e2"]),
        ),
        {
            action: { elementId: "f0-e2", type: "click" },
            catalogUpdate: null,
            decision: "act",
            reason: "Dismiss the cookie banner.",
        },
    );
    assert.throws(
        () =>
            validateAgentDecision(
                {
                    action: { elementId: "f0-e9", type: "click" },
                    decision: "act",
                    reason: "Click an unavailable control.",
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
            }),
        /scroll direction/,
    );
    for (const type of ["go_back", "press_escape"]) {
        assert.deepEqual(
            validateAgentDecision({
                action: { type },
                decision: "act",
                reason: "Use a bounded browser action.",
            }),
            {
                action: { type },
                catalogUpdate: null,
                decision: "act",
                reason: "Use a bounded browser action.",
            },
        );
    }
    assert.deepEqual(
        validateAgentDecision({
            action: { type: "click_point", x: 308, y: 478 },
            decision: "act",
            reason: "Dismiss an unlabeled close icon.",
        }),
        {
            action: { type: "click_point", x: 308, y: 478 },
            catalogUpdate: null,
            decision: "act",
            reason: "Dismiss an unlabeled close icon.",
        },
    );
    assert.throws(
        () =>
            validateAgentDecision({
                action: { type: "click_point", x: 1001, y: 10 },
                decision: "act",
                reason: "Outside the viewport.",
            }),
        /invalid click point/,
    );
});

test("rejects an action that already failed in the same session", () => {
    const decision = {
        action: { type: "click_point", x: 308, y: 478 },
        catalogUpdate: null,
        decision: "act",
        reason: "Try the same point again.",
    };
    assert.throws(
        () =>
            validateFreshAgentDecision(decision, [
                {
                    action: decision.action,
                    actionResult: { ok: false, reason: "Blocked" },
                },
            ]),
        /repeated a failed action/,
    );
    assert.equal(
        validateFreshAgentDecision(decision, [
            { action: decision.action, actionResult: { ok: true } },
        ]),
        decision,
    );
});

test("offers same-origin and official authentication links to the agent", async () => {
    const locators = [
        { id: "same" },
        { id: "external" },
        { id: "official-auth" },
    ];
    const candidates = {
        evaluateAll: async () => [
            {
                href: "https://app.test/gallery?private=value",
                index: 0,
                kind: "link",
                label: "Gallery",
                x: 10,
                y: 20,
            },
            {
                href: "https://external.test/leave",
                index: 1,
                kind: "link",
                label: "External",
                x: 30,
                y: 40,
            },
            {
                href: "https://accounts.google.com/o/oauth2/v2/auth",
                index: 2,
                kind: "link",
                label: "Continue",
                x: 50,
                y: 60,
            },
        ],
        nth: (index) => locators[index],
    };
    const page = {
        frames: () => [
            {
                locator: () => candidates,
                url: () => "https://app.test/home",
            },
        ],
    };

    const result = await collectAgentControls(page, "https://app.test");
    assert.deepEqual(result.elements, [
        {
            authentication: null,
            destination: "/gallery",
            elementId: "f0-e0",
            kind: "link",
            label: "Gallery",
            position: { x: 10, y: 20 },
        },
        {
            authentication: "google",
            destination: "official google authentication",
            elementId: "f0-e2",
            kind: "link",
            label: "Continue",
            position: { x: 50, y: 60 },
        },
    ]);
    assert.equal(result.controls.get("f0-e0"), locators[0]);
    assert.equal(result.controls.get("f0-e2"), locators[2]);
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

test("supports bounded browser navigation tools", async () => {
    const calls = [];
    const page = {
        evaluate: async () => {},
        goBack: async () => {
            calls.push("back");
            return { status: () => 200 };
        },
        keyboard: {
            press: async (key) => calls.push(key),
        },
        url: () => "https://app.test/inside",
        waitForFunction: async () => {},
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
    };

    assert.deepEqual(
        await applyAgentAction(
            page,
            { type: "press_escape" },
            new Map(),
            "https://app.test",
        ),
        { ok: true },
    );
    assert.deepEqual(
        await applyAgentAction(
            page,
            { type: "go_back" },
            new Map(),
            "https://app.test",
        ),
        { ok: true },
    );
    assert.deepEqual(calls, ["Escape", "back"]);
});

test("clicks a guarded point inside the screenshot viewport", async () => {
    const clicks = [];
    const page = {
        mouse: {
            click: async (x, y) => clicks.push([x, y]),
        },
        url: () => "https://app.test/inside",
        waitForFunction: async () => {},
        waitForLoadState: async () => {},
        waitForNavigation: async () => null,
        waitForTimeout: async () => {},
    };
    assert.deepEqual(
        await applyAgentAction(
            page,
            { type: "click_point", x: 308, y: 478 },
            new Map(),
            "https://app.test",
        ),
        { ok: true },
    );
    assert.deepEqual(clicks, [[369, 286]]);
});

test("converts normalized vision coordinates to viewport pixels", () => {
    assert.deepEqual(normalizedPointToViewport({ x: 308, y: 478 }), {
        x: 369,
        y: 286,
    });
});

test("lets the agent recover from a same-origin dead end", async () => {
    const page = {
        goBack: async () => ({ status: () => 404 }),
        url: () => "https://app.test/missing",
        waitForFunction: async () => {},
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
    };
    assert.deepEqual(
        await applyAgentAction(
            page,
            { type: "go_back" },
            new Map(),
            "https://app.test",
        ),
        {
            ok: false,
            reason: "The action navigated to HTTP 404",
        },
    );
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

test("recovers when a control redirects outside the app", async () => {
    let currentUrl = "https://app.test/inside";
    const page = {
        goBack: async () => {
            currentUrl = "https://app.test/inside";
            return { status: () => 200 };
        },
        url: () => currentUrl,
        waitForFunction: async () => {},
        waitForLoadState: async () => {},
        waitForNavigation: async () => {
            currentUrl = "https://external.test/ad";
            return { status: () => 200 };
        },
        waitForTimeout: async () => {},
    };
    assert.deepEqual(
        await applyAgentAction(
            page,
            { elementId: "f0-e1", type: "click" },
            new Map([
                [
                    "f0-e1",
                    { click: async () => {}, isVisible: async () => true },
                ],
            ]),
            "https://app.test",
        ),
        {
            ok: false,
            reason: "The action left the app, so the browser returned to the previous screen",
            recovered: true,
        },
    );
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

test("reports only terminal keep, remove, or retry outcomes", () => {
    assert.equal(classifyCaptureOutcome({ approved: true }), "keep");
    assert.equal(
        classifyCaptureOutcome({
            approved: false,
            review: { decision: "authenticate" },
            success: true,
        }),
        "retry",
    );
    assert.equal(
        classifyCaptureOutcome({
            approved: false,
            review: { decision: "remove" },
            success: true,
        }),
        "remove",
    );
    assert.equal(
        classifyCaptureOutcome({ approved: false, success: true }),
        "retry",
    );
    assert.equal(
        classifyCaptureOutcome({ approved: false, success: false }),
        "retry",
    );
    assert.equal(
        classifyRetryKind({
            review: { decision: "authenticate" },
            success: true,
        }),
        "authentication",
    );
    assert.equal(classifyRetryKind({ error: "HTTP 503" }), "technical");
    assert.equal(classifyRetryKind({ success: true }), "ui");
    assert.equal(classifyRetryKind({ approved: true }), null);
});

test("keeps only anonymous rejected screenshots as review evidence", (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "app-evidence-"));
    t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
    const screenshotPath = path.join(directory, "terminal.png");
    fs.writeFileSync(screenshotPath, "public screenshot");

    const captures = attachReviewEvidence(
        [
            {
                name: "Public rejection",
                outcome: "retry",
                screenshotPath,
            },
            {
                authentication: { provider: "google" },
                name: "Authenticated rejection",
                outcome: "retry",
                screenshotPath,
            },
            {
                name: "Removal",
                outcome: "remove",
                screenshotPath,
            },
        ],
        directory,
    );

    assert.match(captures[0].evidenceFile, /^evidence\/01-/);
    assert.equal(
        fs.existsSync(path.join(directory, captures[0].evidenceFile)),
        true,
    );
    assert.equal(captures[1].evidenceFile, undefined);
    assert.equal(captures[2].evidenceFile, undefined);
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

test("prioritizes missing covers before rotating refreshes", () => {
    const targets = [
        ...Array.from({ length: 3 }, (_, index) => ({
            name: `Missing ${index}`,
            needsScreenshot: true,
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
            name: `Refresh ${index}`,
            needsScreenshot: false,
        })),
    ];
    const selection = selectDailyTargets(
        targets,
        5,
        new Date("2026-08-10T12:00:00Z"),
    );

    assert.equal(selection.targets.length, 5);
    assert.deepEqual(
        selection.targets.slice(0, 3).map(({ name }) => name),
        ["Missing 0", "Missing 1", "Missing 2"],
    );
    assert.equal(selection.dailyBatch.missingSelected, 3);
    assert.equal(selection.dailyBatch.refreshSelected, 2);
});
