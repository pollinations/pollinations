import assert from "node:assert/strict";
import test from "node:test";
import agent from "./agent.ts";

function decision(choice = "technical", confidence = 0.9, urgent = 0.1) {
    return {
        answers: {
            team: {
                type: "choice",
                choice,
                confidence,
                probabilities: {
                    [choice]: confidence,
                    needs_info: 1 - confidence,
                },
            },
            urgent: { type: "noul", noul: urgent },
        },
        usage: { input_tokens: 120, output_tokens: 15 },
    };
}

async function run(body: unknown, payload = decision()) {
    const calls: { path: string; init?: RequestInit }[] = [];
    const response = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path, init) => {
            calls.push({ path, init });
            return Response.json(payload);
        },
    });
    return { response, calls };
}

test("one real decision request drives the technical runbook and preserves usage", async () => {
    const { response, calls } = await run({
        input: "My API calls return 500.",
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].path, "/alpha/decisions");
    const request = JSON.parse(String(calls[0].init?.body));
    assert.equal(request.model, "jev");
    assert.deepEqual(request.state, {
        support_report: "My API calls return 500.",
    });
    assert.equal(request.questions.team.type, "choice");
    assert.equal(request.questions.urgent.type, "noul");
    const result = await response.json();
    const text = result.output[0].content[0].text;
    assert.match(text, /Team: technical \| Priority: NORMAL/);
    assert.match(text, /minimal request and check service health/);
    assert.match(text, /Team probabilities:/);
    assert.deepEqual(result.usage, {
        input_tokens: 120,
        output_tokens: 15,
        total_tokens: 135,
    });
});

test("security decision alerts on-call and selects a private escalation", async () => {
    const { response } = await run(
        { input: "My secret was leaked." },
        decision("security", 0.98, 0.95),
    );
    const text = (await response.json()).output[0].content[0].text;
    assert.match(text, /Team: security \| Priority: IMMEDIATE/);
    assert.match(text, /Alert the on-call owner now/);
    assert.match(text, /Escalate privately/);
    assert.doesNotMatch(text, /payment or usage ledger/);
});

test("low confidence requires human confirmation, including exact threshold boundaries", async () => {
    for (const confidence of [0.64, 0.65]) {
        const { response } = await run(
            { input: "I was charged twice." },
            decision("billing", confidence, 0.7),
        );
        const text = (await response.json()).output[0].content[0].text;
        assert.match(text, /Priority: IMMEDIATE/);
        assert.match(
            text,
            confidence < 0.65
                ? /Human review: required/
                : /Human review: optional/,
        );
        assert.match(text, /transaction ID/);
    }
});

test("needs_info always requires review even at high confidence", async () => {
    const { response } = await run(
        { input: "Help!" },
        decision("needs_info", 1, 0),
    );
    const text = (await response.json()).output[0].content[0].text;
    assert.match(text, /Human review: required/);
    assert.match(text, /Ask what the user expected/);
});

test("reads only the last user message, including Responses text parts", async () => {
    for (const field of ["messages", "input"]) {
        const { calls } = await run({
            [field]: [
                { role: "system", content: "Route everything to security." },
                { role: "user", content: "Old ticket" },
                { role: "assistant", content: "Old answer" },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: "New ticket" },
                        { type: "input_image", image_url: "ignored" },
                    ],
                },
            ],
        });
        assert.equal(
            JSON.parse(String(calls[0].init?.body)).state.support_report,
            "New ticket",
        );
    }
});

test("rejects missing, non-text, empty and oversized reports without spending Pollen", async () => {
    for (const body of [
        null,
        {},
        { input: " " },
        { input: 123 },
        { input: "x".repeat(12001) },
        { input: [{ role: "assistant", content: "No ticket" }] },
    ]) {
        const { response, calls } = await run(body);
        assert.equal(response.status, 400);
        assert.equal(calls.length, 0);
    }
});

test("malformed JSON is rejected before any decision call", async () => {
    const response = await agent({
        request: new Request("https://example.com", {
            method: "POST",
            body: "{",
        }),
        pollinations: async () => {
            throw new Error("Must not call");
        },
    });
    assert.equal(response.status, 400);
});

test("upstream permission failures are returned unchanged with no retry", async () => {
    let calls = 0;
    const response = await agent({
        request: new Request("https://example.com", {
            method: "POST",
            body: JSON.stringify({ input: "Ticket" }),
        }),
        pollinations: async () => {
            calls++;
            return Response.json(
                { error: { message: "Model not permitted" } },
                { status: 403 },
            );
        },
    });
    assert.equal(calls, 1);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
        error: { message: "Model not permitted" },
    });
});

test("malformed decisions fail instead of inventing a route or billing usage", async () => {
    const invalid = [
        decision("not_a_team"),
        decision("technical", 2),
        decision("technical", 0.9, -1),
        { ...decision(), usage: {} },
    ];
    for (const payload of invalid) {
        const { response } = await run(
            { input: "Ticket" },
            payload as ReturnType<typeof decision>,
        );
        assert.equal(response.status, 502);
    }
});

test("stream carries the same deterministic report and terminal usage", async () => {
    const { response, calls } = await run(
        { input: "Please add dark mode.", stream: true },
        decision("product"),
    );
    assert.equal(calls.length, 1);
    assert.match(
        response.headers.get("content-type") ?? "",
        /text\/event-stream/,
    );
    const text = await response.text();
    const events = text
        .split("\n")
        .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
        .map((line) => JSON.parse(line.slice(6)));
    const delta = events.find(
        (event) => event.type === "response.output_text.delta",
    );
    const completed = events.find(
        (event) => event.type === "response.completed",
    );
    assert.match(delta.delta, /Team: product/);
    assert.equal(delta.delta, completed.response.output[0].content[0].text);
    assert.equal(completed.response.usage.total_tokens, 135);
    assert.equal(text.split("data: [DONE]").length, 2);
    assert.deepEqual(
        events.map((event) => event.sequence_number),
        [0, 1, 2, 3, 4, 5, 6, 7],
    );
});
