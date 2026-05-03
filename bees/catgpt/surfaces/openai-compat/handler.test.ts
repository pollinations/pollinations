import assert from "node:assert/strict";
import { test } from "node:test";

// Pure shape tests. Network calls are stubbed by patching globalThis.fetch
// before importing the handler, so generateCatReply returns a fixture.

const FAKE_REPLY = "Naps. Next question.";

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (url.includes("/v1/chat/completions")) {
        return new Response(
            JSON.stringify({ choices: [{ message: { content: FAKE_REPLY } }] }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    }
    return realFetch(input);
};

const { handleChatCompletions } = await import("./handler.ts");

function makeReq(body: unknown, init: { stream?: boolean } = {}) {
    return new Request("http://localhost/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "catgpt",
            stream: init.stream,
            ...(body as object),
        }),
    });
}

test("rejects non-POST", async () => {
    const res = await handleChatCompletions(
        new Request("http://localhost/v1/chat/completions", { method: "GET" }),
    );
    assert.equal(res.status, 405);
});

test("rejects missing messages", async () => {
    const res = await handleChatCompletions(makeReq({}));
    assert.equal(res.status, 400);
});

test("non-streaming response is OpenAI-shaped", async () => {
    const res = await handleChatCompletions(
        makeReq({ messages: [{ role: "user", content: "why?" }] }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.object, "chat.completion");
    assert.equal(body.model, "catgpt");
    assert.equal(body.choices[0].message.role, "assistant");
    assert.equal(body.choices[0].message.content, FAKE_REPLY);
    assert.equal(body.choices[0].finish_reason, "stop");
    assert.match(
        body.choices[0].message.metadata.comic_url,
        /gen\.pollinations\.ai\/image\//,
    );
});

test("streaming response is SSE with chat.completion.chunk objects", async () => {
    const res = await handleChatCompletions(
        makeReq(
            { messages: [{ role: "user", content: "why?" }] },
            { stream: true },
        ),
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);

    const text = await res.text();
    // First a role chunk, then content chunks, then a metadata chunk, then [DONE].
    assert.match(text, /"delta":\{"role":"assistant"\}/);
    assert.match(text, /"delta":\{"content":"/);
    assert.match(text, /"comic_url":/);
    assert.match(text, /\[DONE\]/);
});

test("handles multipart user content with image_url", async () => {
    const res = await handleChatCompletions(
        makeReq({
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "what's this?" },
                        {
                            type: "image_url",
                            image_url: { url: "https://x.example/p.png" },
                        },
                    ],
                },
            ],
        }),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    // The comic URL should reflect the uploaded image (enhance=false).
    assert.match(body.choices[0].message.metadata.comic_url, /enhance=false/);
});
