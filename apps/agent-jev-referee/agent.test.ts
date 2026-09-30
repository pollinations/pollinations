import assert from "node:assert/strict";
import test from "node:test";
import agent from "./agent.ts";

function makeContext(overrides: Record<string, unknown>) {
    const state = { chosen: "done" as string };
    const modelCalls: Array<Record<string, unknown>> = [];

    const pollinations = async (path: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (path === "/alpha/decisions") {
            const chosen = state.chosen;
            return new Response(
                JSON.stringify({
                    model: "typesafe/jev-1.13",
                    answers: { status: { type: "choice", choice: chosen, probabilities: { [chosen]: 0.99 } } },
                    usage: { input_tokens: 10, output_tokens: 5 },
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        }
        if (path === "/v1/chat/completions") {
            modelCalls.push(body);
            return new Response(
                JSON.stringify({
                    id: "chatcmpl-test",
                    choices: [{ message: { role: "assistant", content: `acting-on:${body.messages[0].content}` } }],
                    usage: { total_tokens: 42 },
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        }
        return new Response("not found", { status: 404 });
    };

    const request = {
        headers: { get: (name: string) => (name === "authorization" ? "Bearer test-key" : null) },
        json: async () => overrides.body,
    } as unknown as Request;

    return { pollinations, modelCalls, request, state };
}

function responsesBody(goal: string, output: string) {
    return {
        input: [
            {
                role: "user",
                content: [{ type: "input_text", text: `Goal: ${goal}\nLatest tool output: ${output}` }],
            },
        ],
        model: "openai/gpt-5.4-nano",
    };
}

test("done verdict asks the model to summarize the result", async () => {
    const ctx = makeContext({ body: responsesBody("Write report.md", "File report.md written (1,024 bytes)") });
    ctx.state.chosen = "done";
    const response = await agent({ request: ctx.request, pollinations: ctx.pollinations });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.choices[0].message.content, /acting-on:The run is DONE/s);
    assert.equal(payload.jev.status, "done");
    assert.equal(response.headers.get("x-jev-status"), "done");
});

test("in-progress verdict asks for the next step", async () => {
    const ctx = makeContext({ body: responsesBody("Write report.md", "Directory created, generating content...") });
    ctx.state.chosen = "in-progress";
    const response = await agent({ request: ctx.request, pollinations: ctx.pollinations });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.choices[0].message.content, /acting-on:The run is IN PROGRESS/s);
    assert.equal(payload.jev.status, "in-progress");
});

test("stuck verdict asks for diagnosis and alternative", async () => {
    const ctx = makeContext({ body: responsesBody("Write report.md", "Error: EACCES permission denied (3rd time)") });
    ctx.state.chosen = "stuck";
    const response = await agent({ request: ctx.request, pollinations: ctx.pollinations });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.choices[0].message.content, /acting-on:The run is STUCK/s);
});

test("blocked verdict asks for what the user must provide", async () => {
    const ctx = makeContext({ body: responsesBody("Write report.md", "VPN login failed, need verification code") });
    ctx.state.chosen = "blocked";
    const response = await agent({ request: ctx.request, pollinations: ctx.pollinations });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.match(payload.choices[0].message.content, /acting-on:The run is BLOCKED/s);
});

test("no markers: whole input becomes the goal and Jev still decides", async () => {
    const ctx = makeContext({
        body: { input: [{ role: "user", content: [{ type: "input_text", text: "Just clean the temp dir" }] }] },
    });
    ctx.state.chosen = "in-progress";
    const response = await agent({ request: ctx.request, pollinations: ctx.pollinations });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.jev.status, "in-progress");
});

test("Jev failure returns 502 with jev_error", async () => {
    const ctx = makeContext({ body: responsesBody("Write report.md", "some output") });
    const failing = async (path: string) => {
        if (path === "/alpha/decisions") return new Response("boom", { status: 500 });
        return new Response("not found", { status: 404 });
    };
    const response = await agent({ request: ctx.request, pollinations: failing });
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.equal(payload.error.type, "jev_error");
});
