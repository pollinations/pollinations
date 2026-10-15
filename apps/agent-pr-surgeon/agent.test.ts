import assert from "node:assert/strict";
import test from "node:test";
import agent, {
    buildReviewPrompt,
    DEFAULT_MODEL,
    deliverFix,
    loadPullRequest,
    parsePullRequestUrl,
    parseReview,
    parseUnifiedDiff,
    resolveEdits,
    type SurgeonDeps,
    unifiedDiff,
} from "./agent.ts";

const DIFF = `diff --git a/src/audio.js b/src/audio.js
index 1111111..2222222 100644
--- a/src/audio.js
+++ b/src/audio.js
@@ -10,6 +10,7 @@ export function play(file) {
     if (!file) return;
-    return decode(file);
+    const buffer = decode(file);
+    return buffer;
 }
`;

const BEFORE = ["export function play(file) {", "    if (!file) return;", "    return decode(file);", "}", ""].join("\n");
const AFTER = ["export function play(file) {", "    if (!file) return;", "    const buffer = decode(file);", "    if (!buffer) throw new Error('empty');", "    return buffer;", "}", ""].join("\n");

const ANSWER = {
    verdict: "fix",
    summary: "The change drops the null check.",
    findings: [
        {
            severity: "high",
            file: "src/audio.js",
            line: 12,
            title: "Missing guard",
            detail: "decode() throws on an empty path.",
        },
    ],
    branch: "pr-surgeon/12-fix",
    commit: "Keep the empty-path guard",
    edits: [
        {
            path: "src/audio.js",
            find: "    return decode(file);",
            replace:
                "    const buffer = decode(file);\n    if (!buffer) throw new Error('empty');\n    return buffer;",
        },
    ],
};

const FILES = [
    { path: "src/audio.js", content: AFTER, before: BEFORE },
];

function fakeDeps(overrides: Partial<SurgeonDeps> = {}) {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const commands: string[] = [];
    const deps: SurgeonDeps = {
        model: DEFAULT_MODEL,
        fetch: async (url, init) => {
            calls.push({
                url,
                headers: (init?.headers ?? {}) as Record<string, string>,
            });
            if (url.includes("/pulls/12")) {
                return Response.json({
                    title: "Make playback async",
                    body: "Rewrites the decoder.",
                    base: { ref: "main" },
                    head: {
                        ref: "feature/async",
                        sha: "a".repeat(40),
                        repo: { full_name: "octo/fork" },
                    },
                });
            }
            if (url.endsWith(".diff")) return new Response(DIFF);
            return new Response(BEFORE);
        },
        chat: async () => ({ content: JSON.stringify(ANSWER), usage: {} }),
        runCommand: async (command) => {
            commands.push(command);
            return { stdout: "deadbeef\n 1 file changed", stderr: "", exitCode: 0 };
        },
        ...overrides,
    };
    return { deps, calls, commands };
}

test("pull request links are read from any message shape", () => {
    assert.deepEqual(parsePullRequestUrl("see https://github.com/o/r/pull/42"), {
        owner: "o",
        repo: "r",
        number: 42,
    });
    assert.deepEqual(
        parsePullRequestUrl("https://github.com/o/r/pull/7/files#diff-abc"),
        { owner: "o", repo: "r", number: 7 },
    );
    assert.equal(parsePullRequestUrl("https://github.com/o/r/issues/7"), null);
});

test("a unified diff is split into files with counts and statuses", () => {
    const files = parseUnifiedDiff(
        `${DIFF}diff --git a/src/new.js b/src/new.js
new file mode 100644
--- /dev/null
+++ b/src/new.js
@@ -0,0 +1,2 @@
+export const one = 1;
+export const two = 2;
`,
    );
    assert.equal(files.length, 2);
    assert.equal(files[0].path, "src/audio.js");
    assert.deepEqual(
        [files[0].status, files[0].added, files[0].removed],
        ["modified", 2, 1],
    );
    assert.deepEqual([files[1].status, files[1].added], ["added", 2]);
});

test("the agent writes its own unified diff", () => {
    const diff = unifiedDiff("src/audio.js", BEFORE, AFTER);
    assert.match(diff, /^diff --git a\/src\/audio\.js b\/src\/audio\.js/);
    assert.match(diff, /^--- a\/src\/audio\.js$/m);
    assert.match(diff, /^\+    if \(!buffer\) throw new Error\('empty'\);$/m);
    assert.match(diff, /^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
    assert.equal(unifiedDiff("src/audio.js", BEFORE, BEFORE), "");
    assert.equal(
        unifiedDiff("new.txt", "", "one\n"),
        "diff --git a/new.txt b/new.txt\n--- a/new.txt\n+++ b/new.txt\n@@ -0,0 +1,1 @@\n+one\n",
    );
});

test("review JSON survives a fence and rejects unsafe edits", () => {
    const review = parseReview(
        `Here you go:\n\`\`\`json\n${JSON.stringify(ANSWER)}\n\`\`\`\nHope that helps.`,
    );
    assert.equal(review.verdict, "fix");
    assert.equal(review.findings[0].line, 12);
    assert.equal(review.edits[0].path, "src/audio.js");
    const none = parseReview('{"verdict":"no_fix","summary":"ok","findings":[]}');
    assert.equal(none.verdict, "no_fix");
    assert.equal(none.edits.length, 0);
    const unsafe = parseReview(
        JSON.stringify({
            verdict: "fix",
            summary: "",
            findings: [],
            edits: [
                { path: "../../etc/passwd", content: "x" },
                { path: "/etc/hosts", content: "x" },
                { path: "src/ok.js; rm -rf /", content: "x" },
            ],
        }),
    );
    assert.equal(unsafe.verdict, "no_fix");
    assert.equal(unsafe.edits.length, 0);
});

test("pull request context uses the API, the diff and the head revision", async () => {
    const { deps, calls } = fakeDeps();
    const pr = await loadPullRequest(
        deps,
        { owner: "octo", repo: "project", number: 12 },
        "ghp_secret",
    );
    assert.equal(pr.headRef, "feature/async");
    assert.equal(pr.headRepo, "octo/fork");
    assert.equal(pr.files.length, 1);
    assert.equal(calls[0].headers.authorization, "Bearer ghp_secret");
    assert.match(calls[1].url, /patch-diff\.githubusercontent\.com/);
    const prompt = buildReviewPrompt(pr, ["### src/audio.js\n3: return decode(file);"]);
    assert.match(prompt, /diff --git a\/src\/audio\.js/);
    assert.match(prompt, /3: return decode\(file\);/);
    assert.match(prompt, /Make playback async/);
});

test("an edit becomes the new file content and a diff against the PR head", async () => {
    const { deps } = fakeDeps();
    const pr = await loadPullRequest(
        deps,
        { owner: "octo", repo: "project", number: 12 },
        null,
    );
    const review = parseReview(JSON.stringify(ANSWER));
    const fix = await resolveEdits(deps, pr, review.edits, null);
    assert.equal(fix.files[0].content, AFTER);
    assert.match(fix.diff, /^\+    if \(!buffer\) throw new Error\('empty'\);$/m);
});

test("an edit that does not match the file is refused, not guessed", async () => {
    const { deps } = fakeDeps();
    const pr = await loadPullRequest(
        deps,
        { owner: "octo", repo: "project", number: 12 },
        null,
    );
    await assert.rejects(
        resolveEdits(
            deps,
            pr,
            [{ path: "src/audio.js", find: "nope", replace: "x" }],
            null,
        ),
        /does not match/,
    );
    await assert.rejects(
        resolveEdits(
            deps,
            pr,
            [{ path: "src/audio.js", find: "  ", replace: "x" }],
            null,
        ),
        /more than once/,
    );
});

test("a fix is pushed from the sandbox in one clone, one write per file, one push", async () => {
    const { deps, commands } = fakeDeps();
    const delivery = await deliverFix(deps, {
        files: FILES,
        source: "octo/fork",
        target: "octo/fork",
        branch: "pr-surgeon/12-fix",
        commit: "Keep the empty-path guard",
        headRef: "feature/async",
        headSha: "0".repeat(40),
        token: "ghp_secret",
    });
    assert.equal(delivery.status, "pushed");
    assert.equal(commands.length, 4);
    // just-git has no global options and refuses unsafe symlinks, so the
    // clone materialises no working tree at all: the index alone carries the
    // head tree into the commit.
    assert.match(
        commands[0],
        /git clone --no-checkout --depth 1 --branch feature\/async/,
    );
    assert.match(commands[0], /git reset --mixed HEAD/);
    assert.ok(!commands[0].includes("clone -c"));
    assert.match(commands[1], /cd \/workspace\/pr-surgeon-pr-surgeon-12-fix\/repo && mkdir -p \$\(dirname src\/audio\.js\) && cat > src\/audio\.js$/);
    // Only the fixed path is staged, quoted because `git add -- <path>` stages
    // nothing in just-git, and the identity comes from `git config` because
    // `git -c` does not exist there.
    assert.match(commands[2], /git checkout -B pr-surgeon\/12-fix >\/dev\/null &&/);
    assert.match(commands[2], /git config user\.name "pr-surgeon" &&/);
    assert.match(commands[2], /git config user\.email "pr-surgeon@users\.noreply\.github\.com" &&/);
    assert.match(commands[2], /git add "src\/audio\.js" &&/);
    assert.ok(!commands[2].includes("git add -- "));
    assert.ok(!commands[2].includes("git -c "));
    assert.match(commands[2], /git push https:\/\/x-access-token:ghp_secret@github\.com\/octo\/fork\.git/);
    // The command list handed back to the caller never carries the secret.
    assert.ok(
        delivery.commands.every((command) => !command.includes("ghp_secret")),
    );
    assert.ok(delivery.commands.some((command) => command.includes("***")));
});

test("a rejected push without a token still returns the fix", async () => {
    const { deps } = fakeDeps({
        runCommand: async (command) => ({
            stdout: "",
            stderr: command.includes("git push")
                ? "HTTP 401 discovering refs at https://github.com/octo/fork"
                : "ok",
            exitCode: command.includes("git push") ? 1 : 0,
        }),
    });
    const delivery = await deliverFix(deps, {
        files: FILES,
        source: "octo/fork",
        target: "octo/fork",
        branch: "pr-surgeon/12-fix",
        commit: "Keep the empty-path guard",
        headRef: "feature/async",
        headSha: "0".repeat(40),
        token: null,
    });
    assert.equal(delivery.status, "patch_only");
    assert.match(delivery.error ?? "", /401/);
});

test("a push refused because the branch is already there is retried against a fresh lease", async () => {
    const seen: string[] = [];
    const { deps } = fakeDeps({
        runCommand: async (command) => {
            seen.push(command);
            if (command.includes("git fetch "))
                return { stdout: "", stderr: "", exitCode: 0 };
            if (command.includes("git rev-parse"))
                return {
                    stdout: `${"a".repeat(40)}\n`,
                    stderr: "",
                    exitCode: 0,
                };
            if (command.includes("--force-with-lease"))
                return {
                    stdout: "To https://github.com/octo/fork.git",
                    stderr: "",
                    exitCode: 0,
                };
            if (command.includes("git push"))
                return {
                    stdout: "",
                    stderr: "! [rejected] (fetch first)",
                    exitCode: 1,
                };
            return {
                stdout: "deadbeef\n 1 file changed",
                stderr: "",
                exitCode: 0,
            };
        },
    });
    const delivery = await deliverFix(deps, {
        files: FILES,
        source: "octo/fork",
        target: "octo/other-fork",
        branch: "pr-surgeon/12-fix",
        commit: "Keep the empty-path guard",
        headRef: "feature/async",
        headSha: "0".repeat(40),
        token: "ghp_secret",
    });
    assert.equal(delivery.status, "pushed");
    // The lease is read from a fetch of the remote branch, not from
    // `git ls-remote`, which the sandbox's git does not have.
    assert.ok(
        seen.some((command) =>
            command.includes(
                `git fetch https://x-access-token:ghp_secret@github.com/octo/other-fork.git refs/heads/pr-surgeon/12-fix >/dev/null`,
            ),
        ),
    );
    assert.ok(
        seen.some((command) =>
            command.includes(
                `--force-with-lease=refs/heads/pr-surgeon/12-fix:${"a".repeat(40)}`,
            ),
        ),
    );
    // A lease, never a blind force: the branch is only replaced where it was.
    assert.ok(seen.every((command) => !command.includes("--force ")));
    assert.ok(
        delivery.commands.every((command) => !command.includes("ghp_secret")),
    );
});

test("a git without a lease option forces the branch it fetched moments ago", async () => {
    const seen: string[] = [];
    const { deps } = fakeDeps({
        runCommand: async (command) => {
            seen.push(command);
            if (command.includes("git fetch "))
                return { stdout: "", stderr: "", exitCode: 0 };
            if (command.includes("git rev-parse"))
                return {
                    stdout: `${"e".repeat(40)}\n`,
                    stderr: "",
                    exitCode: 0,
                };
            if (command.includes("--force-with-lease"))
                return {
                    stdout: "",
                    stderr: 'Unknown option "--force-with-lease".\nNot all git options are supported.',
                    exitCode: 1,
                };
            if (command.includes("git push -f"))
                return {
                    stdout: "To https://github.com/octo/fork.git",
                    stderr: "",
                    exitCode: 0,
                };
            if (command.includes("git push"))
                return {
                    stdout: "",
                    stderr: "! [rejected] (fetch first)",
                    exitCode: 1,
                };
            return {
                stdout: "deadbeef\n 1 file changed",
                stderr: "",
                exitCode: 0,
            };
        },
    });
    const delivery = await deliverFix(deps, {
        files: FILES,
        source: "octo/fork",
        target: "octo/other-fork",
        branch: "pr-surgeon/12-fix",
        commit: "Keep the empty-path guard",
        headRef: "feature/async",
        headSha: "0".repeat(40),
        token: "ghp_secret",
    });
    assert.equal(delivery.status, "pushed");
    // Only the option is missing: the remote branch was fetched first, so the
    // forced push replaces the tip that was just read, never a moved one.
    const fetched = seen.findIndex((command) => command.includes("git fetch "));
    const forced = seen.findIndex((command) => command.includes("git push -f "));
    assert.ok(fetched !== -1 && forced > fetched);
    assert.ok(
        delivery.commands.every((command) => !command.includes("ghp_secret")),
    );
});

test("when no sandbox push can go through, the fix is pushed with the GitHub API", async () => {
    const apiCalls: { method: string; path: string }[] = [];
    const { deps } = fakeDeps({
        fetch: async (url, init) => {
            const path = String(url);
            const method = init?.method ?? "GET";
            apiCalls.push({ method, path });
            if (
                method === "GET" &&
                path.includes("/git/commits/")
            )
                return Response.json({ tree: { sha: "b".repeat(40) } });
            if (path.endsWith("/git/trees"))
                return Response.json({ sha: "c".repeat(40) });
            if (path.endsWith("/git/commits"))
                return Response.json({ sha: "d".repeat(40) });
            if (path.endsWith("/git/ref/heads/pr-surgeon/12-fix"))
                return Response.json(
                    { message: "Not Found" },
                    { status: 404 },
                );
            if (path.endsWith("/git/refs"))
                return Response.json({
                    ref: "refs/heads/pr-surgeon/12-fix",
                });
            return new Response(`unexpected ${path}`, { status: 500 });
        },
        runCommand: async (command) => ({
            stdout: command.includes("git rev-parse")
                ? `${"e".repeat(40)}\n`
                : "",
            stderr: command.includes("git push")
                ? command.includes("--force-with-lease")
                    ? 'Unknown option "--force-with-lease".'
                    : "object 4030dc6abc62fd70b94769400018fd4ba825f542 not found"
                : "",
            exitCode: command.includes("git push") ? 1 : 0,
        }),
    });
    const delivery = await deliverFix(deps, {
        files: FILES,
        source: "octo/fork",
        target: "octo/other-fork",
        branch: "pr-surgeon/12-fix",
        commit: "Keep the empty-path guard",
        headRef: "feature/async",
        headSha: "0".repeat(40),
        token: "ghp_secret",
    });
    assert.equal(delivery.status, "pushed");
    // The commit GitHub created is what the branch points at, not the local
    // sandbox commit the shell could not pack.
    assert.equal(delivery.commit, "d".repeat(40));
    // The branch did not exist, so it was created rather than replaced.
    assert.ok(
        apiCalls.some(
            (call) => call.method === "GET" && call.path.endsWith("/git/ref/heads/pr-surgeon/12-fix"),
        ),
    );
    assert.ok(
        apiCalls.some(
            (call) => call.method === "POST" && call.path.endsWith("/git/refs"),
        ),
    );
    assert.ok(
        !apiCalls.some((call) => call.path.includes("octo/fork.git")),
    );
    assert.ok(delivery.commands.some((command) => command.includes("Git Data API")));
    assert.ok(
        delivery.commands.every((command) => !command.includes("ghp_secret")),
    );
});

test("without a head branch the agent refuses to guess", async () => {
    const { deps, commands } = fakeDeps();
    const delivery = await deliverFix(deps, {
        files: FILES,
        source: "octo/fork",
        target: "octo/fork",
        branch: "pr-surgeon/12-fix",
        commit: "Keep the empty-path guard",
        headRef: null,
        headSha: null,
        token: "ghp_secret",
    });
    assert.equal(delivery.status, "patch_only");
    assert.match(delivery.error ?? "", /head branch/);
    assert.equal(delivery.commands.length, 3);
    assert.equal(commands.length, 0);
});

function context(body: unknown, deps: SurgeonDeps, headers: Record<string, string> = {}) {
    return {
        request: new Request("https://example.test/", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        }),
        pollinations: async () =>
            Response.json({
                choices: [{ message: { content: JSON.stringify(ANSWER) } }],
                usage: { prompt_tokens: 1200, completion_tokens: 300 },
            }),
        mcp: async (server: string, tool: string, args: Record<string, unknown>) => {
            void server;
            void tool;
            const command = String(args.command ?? "");
            if (command.includes("git push")) {
                // No credential on this call: the sandbox push is refused.
                return {
                    content: [
                        {
                            type: "text",
                            text: "HTTP 401 discovering refs at https://github.com/octo/fork",
                        },
                    ],
                    isError: true,
                };
            }
            return { content: [{ type: "text", text: "ok" }] };
        },
        fetch: deps.fetch,
    };
}

test("the handler answers with a review and an unpushed fix", async () => {
    const { deps } = fakeDeps();
    const response = await agent(
        context({ input: "https://github.com/octo/project/pull/12" }, deps),
    );
    const data = (await response.json()) as {
        output: { content: { text: string }[] }[];
        usage: Record<string, number>;
    };
    const text = data.output[0].content[0].text;
    assert.match(text, /## Review of https:\/\/github\.com\/octo\/project\/pull\/12/);
    assert.match(text, /Missing guard/);
    assert.match(text, /### Fix prepared, not pushed/);
    assert.match(text, /^\+\s+if \(!buffer\) throw new Error\('empty'\);/m);
    assert.deepEqual(data.usage, {
        input_tokens: 1200,
        output_tokens: 300,
        total_tokens: 1500,
    });
});

test("the handler streams Responses events when asked", async () => {
    const { deps } = fakeDeps();
    const response = await agent(
        context(
            { input: "https://github.com/octo/project/pull/12", stream: true },
            deps,
        ),
    );
    assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
    const text = await response.text();
    assert.match(text, /event: response\.created/);
    assert.match(text, /event: response\.completed/);
    assert.match(text, /data: \[DONE\]/);
});

test("a request without a pull request link is rejected", async () => {
    const { deps } = fakeDeps();
    const response = await agent(context({ input: "hello" }, deps));
    assert.equal(response.status, 400);
    const data = (await response.json()) as { error: { code: string } };
    assert.equal(data.error.code, "missing_pull_request");
});
