import assert from "node:assert/strict";
import test from "node:test";
import {
    askModel,
    buildReviewPrompt,
    collectReviewContext,
    getDestination,
} from "./askpolli-review.mjs";

test("routes PR context through read-only GitHub API headers", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url, options });
        if (options.headers.Accept === "application/vnd.github.v3.diff")
            return new Response("diff");
        if (url.includes("/files"))
            return new Response(
                JSON.stringify([{ filename: "f.js", patch: "patch" }]),
            );
        return new Response(
            JSON.stringify({ title: "Fix", body: "Description" }),
        );
    };
    const event = {
        issue: { number: 7, pull_request: {} },
        comment: { body: "Please review." },
    };
    const review = await collectReviewContext({
        fetchImpl,
        token: "token",
        repository: "owner/repo",
        eventName: "issue_comment",
        event,
    });
    assert.deepEqual(getDestination("issue_comment", event), {
        issue_number: 7,
    });
    assert.equal(calls.length, 3);
    assert.equal(calls[0].options.headers.Authorization, "Bearer token");
    assert.equal(
        calls[1].options.headers.Accept,
        "application/vnd.github.v3.diff",
    );
    assert.match(buildReviewPrompt(review), /Pull request #7: Fix/);
});

test("rejects inference errors and invalid usage", async () => {
    await assert.rejects(
        askModel({
            fetchImpl: async () => new Response("failure", { status: 502 }),
            apiKey: "key",
            prompt: "prompt",
        }),
        /failed with 502/,
    );
    await assert.rejects(
        askModel({
            fetchImpl: async () =>
                new Response(
                    JSON.stringify({
                        choices: [
                            {
                                message: {
                                    content: '{"version":1,"answer":"ok"}',
                                },
                            },
                        ],
                    }),
                ),
            apiKey: "key",
            prompt: "prompt",
        }),
        /invalid usage/,
    );
});

test("accepts only a bounded artifact with provider usage", async () => {
    const artifact = await askModel({
        fetchImpl: async () =>
            new Response(
                JSON.stringify({
                    choices: [
                        { message: { content: '{"version":1,"answer":"ok"}' } },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 2 },
                }),
            ),
        apiKey: "key",
        prompt: "prompt",
    });
    assert.deepEqual(artifact, { version: 1, answer: "ok" });
});
