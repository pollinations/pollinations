import assert from "node:assert/strict";
import { test } from "node:test";
import agent from "./agent.ts";

const validVote = {
    answers: {
        vote: { choice: "yes", probabilities: { yes: 0.61, no: 0.39 } },
    },
};
const writer = {
    output: [
        { content: [{ type: "output_text", text: "The fox votes yes." }] },
    ],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
};

async function run(vote, messages = false) {
    const calls = [];
    const request = new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify(
            messages
                ? { messages: [{ role: "user", content: "A fair rule" }] }
                : { input: "A fair rule" },
        ),
    });
    const response = await agent({
        request,
        pollinations: async (path) => {
            calls.push(path);
            return Response.json(path === "/alpha/decisions" ? vote : writer);
        },
    });
    return { response, calls };
}

test("valid Jev votes reach the writer on both response shapes", async () => {
    for (const messages of [false, true]) {
        const { response, calls } = await run(validVote, messages);
        assert.deepEqual(calls, ["/alpha/decisions", "/v1/responses"]);
        assert.match(await response.text(), /jev voted yes/);
    }
});

test("malformed or inconsistent votes fail before the writer", async () => {
    for (const vote of [
        {},
        {
            answers: {
                vote: {
                    choice: "unknown",
                    probabilities: { yes: 0.6, no: 0.4 },
                },
            },
        },
        { answers: { vote: { choice: "yes", probabilities: { yes: 1 } } } },
        {
            answers: {
                vote: {
                    choice: "yes",
                    probabilities: { yes: 0.6, no: 0.4, maybe: 0 },
                },
            },
        },
        {
            answers: {
                vote: { choice: "yes", probabilities: { yes: "0.6", no: 0.4 } },
            },
        },
        {
            answers: {
                vote: { choice: "yes", probabilities: { yes: -0.1, no: 1.1 } },
            },
        },
        {
            answers: {
                vote: { choice: "yes", probabilities: { yes: 0.2, no: 0.2 } },
            },
        },
        {
            answers: {
                vote: { choice: "yes", probabilities: { yes: 0.4, no: 0.6 } },
            },
        },
    ]) {
        let calls = 0;
        await assert.rejects(
            agent({
                request: new Request("https://example.test", {
                    method: "POST",
                    body: JSON.stringify({ input: "A fair rule" }),
                }),
                pollinations: async () => {
                    calls++;
                    return Response.json(vote);
                },
            }),
        );
        assert.equal(calls, 1);
    }
});
