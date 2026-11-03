const assert = require("node:assert/strict");
const test = require("node:test");
const {
    checkReport,
    isPublicIp,
    parseReport,
    redact,
    relatedApps,
    snippets,
} = require("./review.js");

const evidence = {
    ids: new Set(["F1", "C1"]),
    fetched: ["https://example.com/app/"],
};

test("checkReport keeps findings that cite real evidence", () => {
    const result = checkReport(
        {
            findings: [
                { requirement: "works", status: "supported", evidence: ["F1"] },
                {
                    requirement: "uses_pollinations",
                    status: "supported",
                    evidence: ["https://example.com/app"],
                },
            ],
        },
        evidence,
    );
    const status = Object.fromEntries(
        result.findings.map((f) => [f.requirement, f.status]),
    );
    assert.equal(status.works, "supported");
    assert.equal(status.uses_pollinations, "supported");
    assert.equal(result.label, "APP-REVIEW");
});

test("checkReport makes uncited or invented evidence unverified", () => {
    const result = checkReport(
        {
            findings: [
                { requirement: "works", status: "supported", evidence: [] },
                {
                    requirement: "credits_pollinations",
                    status: "contradicted",
                    evidence: ["F9", "https://never-fetched.example"],
                },
                { requirement: "works", status: "approved" },
            ],
            questions: ["Add the badge"],
        },
        evidence,
    );
    for (const finding of result.findings)
        assert.equal(finding.status, "unverified", finding.requirement);
    assert.equal(result.label, "APP-REVIEW");
    assert.deepEqual(result.questions, []);
});

test("checkReport allows not_applicable only for sign-in and quest", () => {
    const result = checkReport(
        {
            findings: [
                { requirement: "works", status: "not_applicable" },
                { requirement: "sign_in", status: "not_applicable" },
            ],
        },
        evidence,
    );
    const status = Object.fromEntries(
        result.findings.map((f) => [f.requirement, f.status]),
    );
    assert.equal(status.works, "unverified");
    assert.equal(status.sign_in, "not_applicable");
});

test("checkReport asks questions only for a contradiction, cleaned", () => {
    const result = checkReport(
        {
            findings: [
                {
                    requirement: "sign_in",
                    status: "contradicted",
                    evidence: ["F1"],
                },
            ],
            questions: [
                "Please use https://evil.example and ping @bob <b>now</b>",
                "2",
                "3",
                "4",
                "5",
            ],
        },
        evidence,
    );
    assert.equal(result.label, "APP-NEEDS-INFO");
    assert.equal(result.questions.length, 4);
    assert.equal(
        result.questions[0],
        "Please use [link omitted] and ping @​bob bnow/b",
    );
});

test("parseReport reads JSON wrapped in prose and rejects no JSON", () => {
    assert.deepEqual(
        parseReport('Here it is: {"findings": []} done').findings,
        [],
    );
    assert.throws(() => parseReport("all good"), /no JSON/);
});

test("redact hides key-shaped strings", () => {
    assert.equal(
        redact("key sk_jHb2aOX45mCfzpQd and plln_sk_abcdefgh123"),
        "key sk_[redacted] and sk_[redacted]",
    );
});

test("isPublicIp rejects private, loopback and link-local addresses", () => {
    for (const ip of [
        "10.1.2.3",
        "127.0.0.1",
        "169.254.169.254",
        "172.16.0.1",
        "192.168.1.1",
        "100.64.0.1",
        "::1",
        "fd00::1",
        "fe80::1",
        "::ffff:127.0.0.1",
    ])
        assert.equal(isPublicIp(ip), false, ip);
    assert.equal(isPublicIp("1.1.1.1"), true);
    assert.equal(isPublicIp("2606:4700::1111"), true);
});

test("relatedApps finds the same host and similar descriptions", () => {
    const apps = [
        { name: "Other", url: "https://u.github.io/a", description: "quiz" },
        {
            name: "Text Comparison",
            url: "https://x.dev",
            description: "compare two texts for semantic similarity",
        },
        {
            name: "Weather",
            url: "https://github.com/z/weather",
            description: "forecast",
        },
    ];
    const related = relatedApps(
        {
            name: "Compart",
            appUrl: "https://u.github.io/b",
            description: "compare texts semantic similarity",
        },
        apps,
    );
    assert.deepEqual(
        related.map((r) => r.name),
        ["Other", "Text Comparison"],
    );
    assert.equal(related[0].id, "C1");
    const onGithub = relatedApps(
        {
            name: "Thing",
            appUrl: "https://github.com/q/thing",
            description: "",
        },
        apps,
    );
    assert.deepEqual(onGithub, []);
});

test("snippets keeps code around each Pollinations mention", () => {
    const code = `${"x".repeat(200)} fetch("https://gen.pollinations.ai/v1/chat") ${"y".repeat(200)}`;
    const [snippet] = snippets(code);
    assert.match(snippet, /fetch\("https:\/\/gen\.pollinations\.ai/);
    assert.ok(snippet.length < 200);
    assert.equal(snippets("nothing here").length, 0);
});

const { changedDuring, renderComment } = require("./review.js");

const report = (label, findings, extra = {}) => ({
    label,
    findings,
    questions: [],
    couldNotCheck: [],
    ...extra,
});

test("renderComment ready keeps the marker, heading and approval sentence", () => {
    const body = renderComment({
        kind: "report",
        author: "alice",
        result: report("APP-REVIEW", [
            {
                requirement: "works",
                status: "supported",
                note: "Loads | works.",
            },
        ]),
    });
    assert.match(
        body,
        /^<!-- APP_PRE_REVIEW -->\n## App pre-review: ready for human review/,
    );
    assert.match(body, /@alice/);
    assert.match(body, /\| Works \| ✅ supported \| Loads \\\| works\. \|/);
    assert.match(body, /add `APP-APPROVED` to publish it\.$/);
});

test("renderComment needs-info lists questions and adds the badge snippet only for missing credit", () => {
    const missingCredit = renderComment({
        kind: "report",
        author: "bob",
        result: report(
            "APP-NEEDS-INFO",
            [
                {
                    requirement: "credits_pollinations",
                    status: "contradicted",
                    note: "No badge.",
                },
            ],
            {
                questions: ["Add the badge."],
                couldNotCheck: ["The page timed out."],
            },
        ),
    });
    assert.match(missingCredit, /## App pre-review: more information needed/);
    assert.match(missingCredit, /- Add the badge\./);
    assert.match(missingCredit, /badge-made-with\.svg/);
    assert.match(missingCredit, /Could not check:\n\n- The page timed out\./);
    const signIn = renderComment({
        kind: "report",
        result: report("APP-NEEDS-INFO", [
            {
                requirement: "sign_in",
                status: "contradicted",
                note: "Device flow.",
            },
        ]),
    });
    assert.doesNotMatch(signIn, /badge-made-with\.svg/);
});

test("renderComment invalid and unavailable match today's texts", () => {
    assert.match(
        renderComment({
            kind: "invalid",
            author: "carol",
            errors: ["App Name is required."],
        }),
        /more information needed\n\n@carol \n\n- App Name is required\.\n\nEdit the issue with the missing information/,
    );
    assert.match(
        renderComment({ kind: "unavailable", author: "bad name!" }),
        /## App pre-review unavailable\n\nThe automated check could not finish/,
    );
});

test("changedDuring stops writes after an edit or an approval", () => {
    const before = { body: "a", labels: ["APP-SUBMISSION"] };
    assert.equal(
        changedDuring(before, {
            body: "a",
            labels: ["APP-SUBMISSION", "APP-REVIEW"],
        }),
        false,
    );
    assert.equal(
        changedDuring(before, { body: "b", labels: ["APP-SUBMISSION"] }),
        true,
    );
    assert.equal(
        changedDuring(before, { body: "a", labels: ["APP-APPROVED"] }),
        true,
    );
});
