import assert from "node:assert/strict";
import test from "node:test";
import {
    buildReviewPrompt,
    hunkLineRanges,
    lastUserText,
    outputTextOf,
    parseAgentInput,
    parseModelReview,
    parsePrUrl,
    patchedFilesOk,
    pushBranchName,
    reviewToMarkdown,
    selectContext,
    usageOf,
} from "./agent.ts";

test("PR links parse from URLs, text, and api forms", () => {
    assert.deepEqual(
        parsePrUrl("https://github.com/pollinations/pollinations/pull/17422"),
        { owner: "pollinations", repo: "pollinations", number: 17422 },
    );
    assert.deepEqual(parsePrUrl("see github.com/o/r/pull/7 thanks"), {
        owner: "o",
        repo: "r",
        number: 7,
    });
    assert.equal(parsePrUrl("https://github.com/o/r/issues/7"), null);
    assert.equal(parsePrUrl("no link at all"), null);
});

test("input accepts a bare link or a JSON object with options", () => {
    const bare = parseAgentInput("https://github.com/o/r/pull/1");
    assert.deepEqual(bare.pr, { owner: "o", repo: "r", number: 1 });
    assert.equal(bare.githubToken, undefined);

    const json = parseAgentInput(
        JSON.stringify({
            pr: "https://github.com/o/r/pull/2",
            push_to: "me/fork",
            github_token: "github_pat_x",
        }),
    );
    assert.deepEqual(json.pr, { owner: "o", repo: "r", number: 2 });
    assert.equal(json.pushTo, "me/fork");
    assert.equal(json.githubToken, "github_pat_x");

    const fenced = parseAgentInput(
        '```json\n{"url":"https://github.com/o/r/pull/3"}\n```',
    );
    assert.deepEqual(fenced.pr, { owner: "o", repo: "r", number: 3 });

    assert.equal(parseAgentInput("hello world").pr, null);
});

test("the last user message is extracted from either request shape", () => {
    assert.equal(
        lastUserText({
            messages: [
                { role: "user", content: "first" },
                { role: "assistant", content: "hi" },
                { role: "user", content: "https://github.com/o/r/pull/1" },
            ],
        }),
        "https://github.com/o/r/pull/1",
    );
    assert.equal(
        lastUserText({ input: "https://github.com/o/r/pull/2" }),
        "https://github.com/o/r/pull/2",
    );
    assert.equal(
        lastUserText({
            input: [
                { role: "user", content: [{ type: "text", text: "in parts" }] },
            ],
        }),
        "in parts",
    );
});

test("hunk ranges follow the new-file line numbers", () => {
    const patch = [
        "@@ -10,7 +10,7 @@ function a() {",
        " context",
        "-old",
        "+new",
        "@@ -40 +40,2 @@",
        "+added line",
    ].join("\n");
    assert.deepEqual(hunkLineRanges(patch), [
        [10, 16],
        [40, 41],
    ]);
});

test("small files are returned whole; large files keep hunk surroundings", () => {
    const small = "one\ntwo\nthree";
    assert.equal(
        selectContext(small, "@@ -1 +1 @@\n-one\n+uno"),
        "1\tone\n2\ttwo\n3\tthree",
    );

    const big = Array.from({ length: 20000 }, (_, i) => `line ${i + 1}`).join(
        "\n",
    );
    const twoHunks = selectContext(
        big,
        "@@ -100 +100 @@\n+changed\n@@ -300 +300 @@\n+also changed",
    );
    assert.ok(twoHunks.includes("100\tline 100"));
    assert.ok(twoHunks.includes("300\tline 300"));
    assert.ok(twoHunks.includes("…"));
    assert.ok(!twoHunks.includes("999\tline 999"));
    assert.ok(twoHunks.length < big.length);

    const noHunks = selectContext(big, "");
    assert.ok(noHunks.startsWith("1\tline 1"));
    assert.ok(noHunks.length < big.length);
});

test("the review prompt carries the diff and the code around it", () => {
    const pr = {
        title: "Fix the thing",
        body: "It was broken.",
        htmlUrl: "https://github.com/o/r/pull/9",
        baseOwner: "o",
        baseRepo: "r",
        headOwner: "dev",
        headRepo: "r",
        headBranch: "fix-thing",
        headSha: "abcdef1234567890",
        files: [],
    };
    const prompt = buildReviewPrompt(pr, [
        {
            file: { filename: "src/a.ts", status: "modified", patch: "-x\n+x" },
            context: "1\tconst x = 1",
        },
    ]);
    assert.ok(prompt.includes("Fix the thing"));
    assert.ok(prompt.includes("src/a.ts"));
    assert.ok(prompt.includes("-x\n+x"));
    assert.ok(prompt.includes("1\tconst x = 1"));
});

test("model reviews parse from raw or fenced JSON and drop junk entries", () => {
    const review = {
        verdict: "issues",
        summary: "one real problem",
        findings: [
            {
                severity: "major",
                file: "a.ts",
                line: 3,
                what: "off by one",
                why: "crashes",
            },
            { nope: true },
        ],
        patched_files: [{ path: "a.ts", content: "fixed" }, { path: 42 }],
    };
    const parsed = parseModelReview(JSON.stringify(review));
    assert.equal(parsed.verdict, "issues");
    assert.equal(parsed.findings.length, 1);
    assert.equal(parsed.patched_files.length, 1);

    const fenced = parseModelReview(
        `Here you go:\n\`\`\`json\n${JSON.stringify(review)}\n\`\`\`\nDone.`,
    );
    assert.equal(fenced.verdict, "issues");
    assert.equal(fenced.findings[0].file, "a.ts");

    assert.throws(() => parseModelReview("no json here"));
});

test("responses text and usage are read from either shape", () => {
    assert.equal(outputTextOf({ output_text: "direct" }), "direct");
    assert.equal(
        outputTextOf({
            output: [
                { content: [{ type: "output_text", text: "hello " }] },
                { content: [{ type: "output_text", text: "world" }] },
            ],
        }),
        "hello \nworld",
    );
    assert.deepEqual(
        usageOf({ usage: { input_tokens: 10, output_tokens: 5 } }),
        {
            inputTokens: 10,
            outputTokens: 5,
        },
    );
    assert.deepEqual(usageOf({}), { inputTokens: 0, outputTokens: 0 });
});

test("a patch is only pushed when it fixes a finding in the same file", () => {
    const review = {
        verdict: "issues" as const,
        summary: "",
        findings: [
            { severity: "minor" as const, file: "a.ts", what: "w", why: "y" },
        ],
        patched_files: [],
    };
    assert.equal(patchedFilesOk([], review), false);
    assert.equal(
        patchedFilesOk([{ path: "b.ts", content: "x" }], review),
        false,
    );
    assert.equal(
        patchedFilesOk([{ path: "a.ts", content: "fixed" }], review),
        true,
    );
});

test("the rendered review is a short maintainer-readable report", () => {
    const markdown = reviewToMarkdown(
        {
            verdict: "issues",
            summary: "Mostly fine, one bug.",
            findings: [
                {
                    severity: "major",
                    file: "a.ts",
                    line: 3,
                    what: "off by one | risky",
                    why: "crashes",
                },
            ],
            patched_files: [],
        },
        {
            model: "openai/gpt-6.1-sol",
            cost: 0.0123,
            usage: { inputTokens: 1500, outputTokens: 900 },
            pushed: {
                branch: "pr-fixer/9",
                url: "https://github.com/x",
                files: ["a.ts"],
            },
        },
    );
    assert.ok(markdown.includes("**Issues found**"));
    assert.ok(markdown.includes("| major | `a.ts:3` |"));
    assert.ok(markdown.includes("pr-fixer/9"));
    assert.ok(markdown.includes("≈0.0123 Pollen"));

    const clean = reviewToMarkdown(
        { verdict: "clean", summary: "Fine.", findings: [], patched_files: [] },
        {
            model: "openai/gpt-6.1-sol",
            cost: 0,
            usage: { inputTokens: 0, outputTokens: 0 },
            pushed: { skipped: "the change looks clean." },
        },
    );
    assert.ok(clean.includes("**No issues found**"));
    assert.ok(clean.includes("No fix pushed — the change looks clean."));
});

test("branch names are derived from the PR number", () => {
    assert.equal(pushBranchName(17422), "pr-fixer/17422");
});

test("the agent reviews a PR end to end and pushes a fix branch", async () => {
    const { default: agent } = await import("./agent.ts");
    const calls: string[] = [];

    const prPayload = {
        title: "fix: the thing",
        body: "",
        html_url: "https://github.com/o/r/pull/9",
        base: { ref: "main", repo: { full_name: "o/r" } },
        head: {
            ref: "fix-thing",
            sha: "headsha0000000000000000000000000000000000",
            repo: { full_name: "dev/r" },
        },
    };
    const filesPayload = [
        {
            filename: "src/a.ts",
            status: "modified",
            patch: "-const x = 1\n+const x = 2",
        },
    ];
    const mergeStates: Record<string, unknown> = {
        "/repos/o/r/pulls/9": prPayload,
        "/repos/o/r/pulls/9/files?per_page=100": filesPayload,
        "/repos/me/fork": { default_branch: "main" },
        "/repos/me/fork/git/ref/heads/main": {
            object: { sha: "basesha00000000000000000000000000000000000" },
        },
        "/repos/me/fork/git/ref/heads/pr-fixer/9": { object: { sha: "none" } },
        "/repos/me/fork/merges": {
            sha: "mergesha0000000000000000000000000000",
        },
        "/repos/me/fork/git/commits/mergesha0000000000000000000000000000": {
            tree: { sha: "treesha000000000000000000000000000000000" },
        },
        "/repos/me/fork/git/trees": { sha: "newtree" },
        "/repos/me/fork/git/commits": { sha: "fixsha" },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (
        input: string | URL | Request,
        init?: RequestInit,
    ) => {
        const url = String(input);
        if (url.startsWith("https://raw.githubusercontent.com/")) {
            return new Response("1\tconst x = 1\n2\tlog(x)\n");
        }
        if (url.startsWith("https://api.github.com/")) {
            const path = url.slice("https://api.github.com".length);
            calls.push(`${init?.method ?? "GET"} ${path}`);
            if (path === "/repos/me/fork/git/refs" && init?.method === "POST")
                return Response.json({}, { status: 201 });
            if (path === "/repos/me/fork/git/refs/heads/pr-fixer/9") {
                if (init?.method === "PATCH")
                    return Response.json({ object: { sha: "fixsha" } });
                return new Response("{}", { status: 404 });
            }
            if (/^\/repos\/me\/fork\/git\/commits\/[^/]+$/.test(path))
                return Response.json({
                    tree: { sha: "treesha000000000000000000000000000000000" },
                });
            const state = mergeStates[path];
            if (state) return Response.json(state);
            return Response.json({});
        }
        return originalFetch(input, init);
    }) as typeof fetch;

    try {
        const response = await agent({
            request: new Request("https://agent.test/v1/chat/completions", {
                method: "POST",
                body: JSON.stringify({
                    messages: [
                        {
                            role: "user",
                            content: JSON.stringify({
                                pr: "https://github.com/o/r/pull/9",
                                push_to: "me/fork",
                                github_token: "github_pat_test",
                            }),
                        },
                    ],
                }),
            }),
            pollinations: (async () => new Response("{}")) as never,
            model: (id: string) => id,
            respond: (async () =>
                Response.json({
                    output: [
                        {
                            content: [
                                {
                                    type: "output_text",
                                    text: JSON.stringify({
                                        verdict: "issues",
                                        summary: "x is read before it is set.",
                                        findings: [
                                            {
                                                severity: "major",
                                                file: "src/a.ts",
                                                line: 1,
                                                what: "x = 2 breaks the invariant",
                                                why: "callers depend on x = 1",
                                            },
                                        ],
                                        patched_files: [
                                            {
                                                path: "src/a.ts",
                                                content:
                                                    "const x = 1\nlog(x)\n",
                                            },
                                        ],
                                    }),
                                },
                            ],
                        },
                    ],
                    usage: { input_tokens: 8000, output_tokens: 500 },
                })) as never,
        });

        assert.equal(response.status, 200);
        const body = (await response.json()) as {
            choices: { message: { content: string } }[];
        };
        const content = body.choices[0].message.content;
        assert.ok(content.includes("**Issues found**"));
        assert.ok(content.includes("pr-fixer/9"));
        // 0.021 pollen: 8000 * 0.000002 + 500 * 0.00001
        assert.ok(content.includes("≈0.0210 Pollen"));

        // The push followed the branch → merge → tree → commit → ref sequence.
        assert.ok(calls.includes("GET /repos/me/fork"));
        assert.ok(calls.includes("GET /repos/me/fork/git/ref/heads/main"));
        assert.ok(
            calls.some((c) => c.startsWith("POST /repos/me/fork/merges")),
        );
        assert.ok(
            calls.includes("PATCH /repos/me/fork/git/refs/heads/pr-fixer/9"),
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test("the agent reports cleanly when nothing is wrong", async () => {
    const { default: agent } = await import("./agent.ts");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/repos/o/r/pulls/9")) {
            if (url.includes("files?"))
                return Response.json([
                    { filename: "a.ts", status: "modified", patch: "-1\n+2" },
                ]);
            return Response.json({
                title: "docs: tweak",
                body: "",
                html_url: "https://github.com/o/r/pull/9",
                base: { ref: "main", repo: { full_name: "o/r" } },
                head: {
                    ref: "docs",
                    sha: "abc",
                    repo: { full_name: "dev/r" },
                },
            });
        }
        if (url.startsWith("https://raw.githubusercontent.com/"))
            return new Response("docs line\n");
        return new Response("{}", { status: 404 });
    }) as typeof fetch;

    try {
        const response = await agent({
            request: new Request("https://agent.test/v1/responses", {
                method: "POST",
                body: JSON.stringify({
                    input: "https://github.com/o/r/pull/9",
                }),
            }),
            pollinations: (async () => new Response("{}")) as never,
            model: (id: string) => id,
            respond: (async () =>
                Response.json({
                    output_text: JSON.stringify({
                        verdict: "clean",
                        summary: "Fine as is.",
                        findings: [],
                        patched_files: [],
                    }),
                    usage: { input_tokens: 100, output_tokens: 10 },
                })) as never,
        });
        const body = (await response.json()) as {
            output: { content: { text: string }[] }[];
            usage: { total_tokens: number };
        };
        const text = body.output[0].content[0].text;
        assert.ok(text.includes("**No issues found**"));
        assert.ok(text.includes("No fix pushed — the change looks clean."));
        assert.equal(body.usage.total_tokens, 110);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
