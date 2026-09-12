import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const workflow = await readFile(
    new URL("../workflows/repo-askpolli.yml", import.meta.url),
    "utf8",
);
const full = await readFile(
    new URL("../workflows/repo-polli-assistant.yml", import.meta.url),
    "utf8",
);

test("read execution and publication have separate permissions", () => {
    const read = workflow.split("  publish:")[0];
    assert.doesNotMatch(
        read,
        /: write|POLLY_BOT|create-github-app-token|id-token/,
    );
    assert.match(read, /needs: authorize/);
    assert.match(read, /if: needs\.authorize\.outputs\.authorized == 'true'/);
    assert.equal((read.match(/persist-credentials: false/g) || []).length, 2);
    assert.equal(
        (read.match(/ref: \$\{\{ github\.workflow_sha \}\}/g) || []).length,
        2,
    );
    const publish = workflow.split("  publish:")[1];
    assert.match(publish, /issues: write/);
    assert.match(publish, /pull-requests: write/);
    assert.doesNotMatch(publish, /checkout|POLLY_BOT|contents: write/);
    assert.doesNotMatch(full, /allowed_non_write_users/);
    assert.match(full, /needs: authorize-write/);
    assert.match(
        full,
        /if: needs\.authorize-write\.outputs\.authorized == 'true'/,
    );
});

test("write assistant starts on trusted code before handling the target PR", () => {
    const checkouts = full
        .split(/^ {6}- /m)
        .filter((step) => step.includes("uses: actions/checkout@"));
    assert.equal(checkouts.length, 2);
    assert.match(checkouts[0], /ref: \$\{\{ github\.workflow_sha \}\}/);
    assert.match(
        checkouts[1],
        /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/,
    );
    assert.doesNotMatch(checkouts[1], /pull_request\.head|refs\/pull\//);
    assert.match(full, /uses: anthropics\/claude-code-action@v1/);
});

test("askpolli uses the Polli Claude Code runtime with every read-only tool", () => {
    const answer = workflow.split(/^  answer:\r?$/m)[1].split(/^  publish:\r?$/m)[0];
    assert.match(answer, /uses: anthropics\/claude-code-action@v1/);
    assert.match(answer, /--model pollinations-router\/polli/);
    assert.match(
        answer,
        /body\.model === "pollinations-router\/polli"[\s\S]*body\.agent_model = "openai\/gpt-5\.6-terra"/,
    );
    assert.match(answer, /--setting-sources user/);
    assert.match(answer, /--strict-mcp-config/);
    assert.match(answer, /allowed_non_write_users: \$\{\{ github\.actor \}\}/);
    assert.match(answer, /github_token: \$\{\{ github\.token \}\}/);
    assert.match(answer, /outputs\.structured_output/);
    assert.doesNotMatch(answer, /askpolli-run|askModel/);
    assert.match(
        full,
        /body\.model === "pollinations-router\/polli"[\s\S]*body\.agent_model = "openai\/gpt-6-astra"/,
    );
    assert.match(full, /default: "pollinations,pollinations-router\/polli"/);

    const allowedTools = answer.match(/--allowedTools ([^\r\n]+)/)?.[1] ?? "";
    assert.match(allowedTools, /^"Read\(\$\{\{ github\.workspace \}\}\/\*\*\)"/);
    for (const tool of [
        "AskUserQuestion",
        "CronList",
        "Glob",
        "Grep",
        "ListAgents",
        "ListMcpResourcesTool",
        "LSP",
        "ReadMcpResourceTool",
        "TaskGet",
        "TaskList",
        "TaskOutput",
        "WaitForMcpServers",
        "WebFetch",
        "WebSearch",
        "mcp__github__get_code_scanning_alert",
        "mcp__github__get_commit",
        "mcp__github__get_dependabot_alert",
        "mcp__github__get_file_contents",
        "mcp__github__get_issue",
        "mcp__github__get_issue_comments",
        "mcp__github__get_me",
        "mcp__github__get_notification_details",
        "mcp__github__get_project",
        "mcp__github__get_project_field",
        "mcp__github__get_project_item",
        "mcp__github__get_pull_request",
        "mcp__github__get_pull_request_diff",
        "mcp__github__get_pull_request_files",
        "mcp__github__get_pull_request_review_comments",
        "mcp__github__get_pull_request_reviews",
        "mcp__github__get_pull_request_status",
        "mcp__github__get_release_by_tag",
        "mcp__github__get_tag",
        "mcp__github__get_team_members",
        "mcp__github__get_teams",
        "mcp__github__list_branches",
        "mcp__github__list_code_scanning_alerts",
        "mcp__github__list_commits",
        "mcp__github__list_dependabot_alerts",
        "mcp__github__list_issue_types",
        "mcp__github__list_issues",
        "mcp__github__list_notifications",
        "mcp__github__list_project_fields",
        "mcp__github__list_project_items",
        "mcp__github__list_projects",
        "mcp__github__list_pull_requests",
        "mcp__github__list_starred_repositories",
        "mcp__github__list_sub_issues",
        "mcp__github__list_tags",
        "mcp__github__search_code",
        "mcp__github__search_issues",
        "mcp__github__search_pull_requests",
        "mcp__github__search_repositories",
        "mcp__github__search_users",
        "mcp__github_ci__get_ci_status",
        "mcp__github_ci__get_workflow_run_details",
    ]) {
        assert.ok(allowedTools.split(" ").includes(tool), `missing ${tool}`);
    }
    assert.doesNotMatch(
        allowedTools,
        /(?:^|[ ,])(?:Agent|Artifact|Bash|Edit|NotebookEdit|PowerShell|Skill|TaskStop|TodoWrite|Write)(?:[ ,]|$)/,
    );
    const availableTools = answer.match(/--tools ([^\r\n]+)/)?.[1] ?? "";
    const exposed = new Set(availableTools.split(","));
    const approved = new Set(
        allowedTools
            .replace(/^"Read\([^\r\n]+?\)" /, "Read ")
            .split(" "),
    );
    assert.deepEqual(exposed, approved);
    for (const tool of [
        "Agent",
        "Artifact",
        "Bash",
        "Edit",
        "NotebookEdit",
        "PowerShell",
        "Skill",
        "TaskStop",
        "TodoWrite",
        "Write",
    ]) {
        assert.ok(!exposed.has(tool), `${tool} must be unavailable`);
    }
});

test("both first jobs whitelist callers before allocating a runner", () => {
    for (const source of [full, workflow]) {
        const gate = source
            .split(/ {4}if: \|\r?\n/)[1]
            .split("    runs-on:")[0];
        assert.match(
            gate,
            /contains\(fromJSON\('\[5099901,36901823,158852059,74301576\]'\), github\.event\.sender\.id\)/,
        );
        assert.match(gate, /github\.triggering_actor == github\.actor/);
        assert.match(gate, /github\.event\.sender\.login == github\.actor/);
    }
    const readGate = workflow
        .split(/ {4}if: \|\r?\n/)[1]
        .split("    runs-on:")[0];
    assert.match(
        readGate,
        /\[34513273,204561696,182555207,189873015,228371309\]/,
    );
    assert.match(readGate, /github\.event\.issue\.pull_request/);
    const writeGate = full.split(/ {4}if: \|\r?\n/)[1].split("    runs-on:")[0];
    assert.doesNotMatch(
        writeGate,
        /34513273|204561696|182555207|189873015|228371309/,
    );
});

// Preserve the block scalar's relative indentation, including heredoc delimiters.
function runScripts(source) {
    return [
        ...source.matchAll(
            /^ {8}run: \|\r?\n((?: {10}[^\r\n]*(?:\r?\n|$)|\r?\n)+)/gm,
        ),
    ].map((match) => match[1].replace(/^ {10}/gm, "").replace(/\r\n/g, "\n"));
}

const bash =
    process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const repository = fileURLToPath(new URL("../../", import.meta.url));

for (const [name, source, command, ids] of [
    ["askpolli", workflow, "!askpolli", [189873015, 1]],
    ["polli", full, "!polli", [158852059, 189873015]],
]) {
    test(`${name} actual run blocks parse in Bash`, () => {
        const scripts = runScripts(source);
        assert.ok(scripts.length >= 2);
        for (const script of scripts) {
            const result = spawnSync(bash, ["-n"], {
                input: script,
                encoding: "utf8",
            });
            assert.equal(
                result.status,
                0,
                result.error?.message || result.stderr,
            );
            assert.equal(result.stderr, "");
        }
    });

    test(`${name} actual authorization shell emits allowed and denied results`, async () => {
        const directory = await mkdtemp(join(tmpdir(), "polli-shell-"));
        try {
            for (const [index, id] of ids.entries()) {
                const output = join(directory, `output-${index}`).replaceAll(
                    "\\",
                    "/",
                );
                const event = JSON.stringify({
                    sender: { id, login: "fixture" },
                    issue: { number: 42, pull_request: {} },
                    comment: { body: command },
                });
                const result = spawnSync(bash, ["-e"], {
                    cwd: repository,
                    input: runScripts(source)[0],
                    encoding: "utf8",
                    env: {
                        ...process.env,
                        EVENT: event,
                        EVENT_JSON: event,
                        EVENT_NAME: "issue_comment",
                        ACTOR: "fixture",
                        TRIGGERING_ACTOR: "fixture",
                        GITHUB_OUTPUT: output,
                    },
                });
                assert.equal(
                    result.status,
                    0,
                    result.error?.message || result.stderr,
                );
                assert.equal(
                    await readFile(output, "utf8"),
                    `authorized=${index === 0}\n`,
                );
            }
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}

const publisher = workflow
    .split("  publish:")[1]
    .split(/<<'NODE'\r?\n/)[1]
    .split(/\r?\n          NODE/)[0]
    .replace('import { readFile } from "node:fs/promises";', "");
async function publish(answer) {
    const calls = [];
    await vm.runInNewContext(`(async () => {${publisher}})()`, {
        process: {
            env: {
                ANSWER: JSON.stringify(answer),
                GITHUB_EVENT_PATH: "event.json",
                GITHUB_REPOSITORY: "owner/repo",
                GITHUB_TOKEN: "fixture",
            },
        },
        readFile: async () => JSON.stringify({ issue: { number: 42 } }),
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true };
        },
        AbortSignal,
    });
    return calls;
}

test("publisher posts only answer text to the event destination", async () => {
    const calls = await publish({ version: 1, answer: "Review result" });
    assert.equal(calls.length, 1);
    assert.equal(
        calls[0].url,
        "https://api.github.com/repos/owner/repo/issues/42/comments",
    );
    assert.deepEqual(JSON.parse(calls[0].options.body), {
        body: "Review result",
    });
});

test("publisher rejects invalid output and routing fields", async () => {
    for (const answer of [
        null,
        {},
        { version: 1, answer: " " },
        { version: 1, answer: "x".repeat(6001) },
        { version: 1, answer: "ok", issue_number: 99 },
    ]) {
        await assert.rejects(publish(answer));
    }
});
