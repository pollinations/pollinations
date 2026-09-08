import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
    assert.doesNotMatch(
        publish,
        /checkout|POLLY_BOT|contents: write|pull-requests: write/,
    );
    assert.doesNotMatch(full, /allowed_non_write_users/);
    assert.match(full, /needs: authorize-write/);
    assert.match(
        full,
        /if: needs\.authorize-write\.outputs\.authorized == 'true'/,
    );
});

const publisher = workflow
    .split("  publish:")[1]
    .split("<<'NODE'\n")[1]
    .split("\n          NODE")[0]
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
