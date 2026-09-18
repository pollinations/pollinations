import assert from "node:assert/strict";
import test from "node:test";
import worker from "./worker.js";

const ENV = {
    JEV_PROXY_TOKEN: "proxy-token",
    TYPESAFE_API_KEY: "typesafe-key",
};
const URL_CHAT = "https://jev.pollinations.ai/v1/chat/completions";

const QUESTIONS = {
    department: {
        type: "choice",
        instructions: "Which team should handle this?",
        criteria: { billing: "Payment issues", technical: "Product failures" },
    },
    is_urgent: { type: "noul", instructions: "Does this convey urgency?" },
};
const ANSWERS = {
    department: {
        type: "choice",
        choice: "billing",
        confidence: 0.99,
        probabilities: { billing: 1, technical: 0 },
    },
    is_urgent: { type: "noul", noul: 0.82 },
};
const NATIVE = {
    state: "Payouts have been failing for 3 days.",
    questions: QUESTIONS,
};

function chatRequest(body, token = ENV.JEV_PROXY_TOKEN) {
    return new Request(URL_CHAT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });
}

function nativeMessages(content = JSON.stringify(NATIVE)) {
    return [{ role: "user", content }];
}

function typeSafeResponse() {
    return Response.json({
        model: "jev-1.13.0",
        answers: ANSWERS,
        usage: { input_tokens: 312, output_tokens: 48 },
    });
}

test("serves health without a token", async () => {
    const response = await worker.fetch(
        new Request("https://jev.pollinations.ai/health"),
        ENV,
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).api, "chat_completions");
});

test("requires the registered bearer token", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected upstream call");
    });
    for (const token of ["", "wrong-token"]) {
        const response = await worker.fetch(
            chatRequest(
                { model: "jev-latest", messages: nativeMessages() },
                token,
            ),
            ENV,
        );
        assert.equal(response.status, 401);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("forwards the native request and returns native answers with usage", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), "https://api.typesafe.ai/v1/systemone");
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            "Bearer typesafe-key",
        );
        assert.deepEqual(JSON.parse(init.body), {
            model: "jev-latest",
            state: NATIVE.state,
            questions: QUESTIONS,
        });
        return typeSafeResponse();
    });
    const response = await worker.fetch(
        chatRequest({
            model: "jev-latest",
            messages: [
                { role: "system", content: "Route the ticket." },
                { role: "user", content: "hello" },
                ...nativeMessages(),
            ],
        }),
        ENV,
    );
    assert.equal(response.status, 200);
    const completion = await response.json();
    assert.equal(completion.model, "jev-1.13.0");
    assert.equal(completion.choices[0].finish_reason, "stop");
    assert.deepEqual(
        JSON.parse(completion.choices[0].message.content),
        ANSWERS,
    );
    assert.deepEqual(completion.usage, {
        prompt_tokens: 312,
        completion_tokens: 48,
        total_tokens: 360,
    });
});

test("wraps the finished answers in SSE with a terminal usage chunk", async (t) => {
    t.mock.method(globalThis, "fetch", async () => typeSafeResponse());
    const response = await worker.fetch(
        chatRequest({
            model: "jev-latest",
            stream: true,
            messages: nativeMessages(),
        }),
        ENV,
    );
    assert.equal(
        response.headers.get("content-type"),
        "text/event-stream; charset=utf-8",
    );
    const events = (await response.text())
        .split("\n\n")
        .filter(Boolean)
        .map((event) => event.replace(/^data: /, ""));
    assert.equal(events.at(-1), "[DONE]");
    const chunks = events.slice(0, -1).map((event) => JSON.parse(event));
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].object, "chat.completion.chunk");
    assert.deepEqual(JSON.parse(chunks[0].choices[0].delta.content), ANSWERS);
    assert.equal(chunks[0].usage, null);
    assert.deepEqual(chunks[1].choices, []);
    assert.equal(chunks[1].usage.total_tokens, 360);
});

test("rejects a malformed native payload with the example and docs link", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected upstream call");
    });
    for (const messages of [
        [],
        [{ role: "assistant", content: JSON.stringify(NATIVE) }],
        [{ role: "user", content: [{ type: "text", text: "parts" }] }],
        nativeMessages("which team should handle this?"),
        nativeMessages('{"questions":{}}'),
        nativeMessages('{"state":"Payment failed."}'),
    ]) {
        const response = await worker.fetch(
            chatRequest({ model: "jev-latest", messages }),
            ENV,
        );
        assert.equal(response.status, 400);
        const { error } = await response.json();
        assert.match(error.message, /docs\.typesafe\.ai/);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("reports missing credentials without calling TypeSafe", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected upstream call");
    });
    const response = await worker.fetch(
        chatRequest({ model: "jev-latest", messages: nativeMessages() }),
        { JEV_PROXY_TOKEN: "proxy-token" },
    );
    assert.equal(response.status, 500);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("preserves the upstream status and rejects a response without usage", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("quota exceeded", { status: 429 }),
    );
    const rateLimited = await worker.fetch(
        chatRequest({ model: "jev-latest", messages: nativeMessages() }),
        ENV,
    );
    assert.equal(rateLimited.status, 429);
    assert.match((await rateLimited.json()).error.message, /quota exceeded/);

    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ model: "jev-1.13.0", answers: ANSWERS }),
    );
    const noUsage = await worker.fetch(
        chatRequest({ model: "jev-latest", messages: nativeMessages() }),
        ENV,
    );
    assert.equal(noUsage.status, 502);
});
