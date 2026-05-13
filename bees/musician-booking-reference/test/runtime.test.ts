import assert from "node:assert/strict";
import test from "node:test";
import { createMusicianBookingAgent } from "../src/agent.js";
import { handleBeeRequest } from "../src/runtime/index.js";

const now = new Date("2026-06-01T10:00:00.000Z");

function jsonRequest(path: string, body: unknown): Request {
    return new Request(`https://bee.example.test${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

test("HTTP runtime exposes A2A agent card", async () => {
    const response = await handleBeeRequest(
        new Request("https://bee.example.test/.well-known/agent-card.json"),
    );
    const card = (await response.json()) as { url: string; skills: unknown[] };

    assert.equal(response.status, 200);
    assert.equal(card.url, "https://bee.example.test/a2a");
    assert.equal(card.skills.length, 1);
});

test("HTTP runtime handles OpenAI-compatible chat completions", async () => {
    const response = await handleBeeRequest(
        jsonRequest("/v1/chat/completions", {
            model: "musician-booking-reference",
            user: "runtime_user",
            messages: [
                {
                    role: "user",
                    content:
                        "Quote a jazz trio for 120 guests in Berlin on 2026-07-18. Contact alex@example.test",
                },
            ],
        }),
        { agent: createMusicianBookingAgent(), now },
    );
    const body = (await response.json()) as {
        metadata: { status: string; quote_total: number };
    };

    assert.equal(response.status, 200);
    assert.equal(body.metadata.status, "quoted");
    assert.equal(body.metadata.quote_total, 1980);
});

test("HTTP runtime handles A2A message/send", async () => {
    const response = await handleBeeRequest(
        jsonRequest("/a2a", {
            jsonrpc: "2.0",
            id: "req_2",
            method: "message/send",
            params: {
                message: {
                    contextId: "ctx_runtime",
                    parts: [
                        { kind: "text", text: "What packages are available?" },
                    ],
                },
            },
        }),
        { agent: createMusicianBookingAgent(), now },
    );
    const body = (await response.json()) as {
        result: { artifacts: Array<{ parts: Array<{ text: string }> }> };
    };

    assert.equal(response.status, 200);
    assert.match(body.result.artifacts[0]?.parts[0]?.text ?? "", /Jazz trio/);
});

test("HTTP runtime handles web SSE messages", async () => {
    const response = await handleBeeRequest(
        jsonRequest("/web/messages", {
            userId: "web_runtime",
            text: "What packages are available?",
            stream: true,
        }),
        { agent: createMusicianBookingAgent(), now },
    );
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.match(text, /event: message/);
});

test("HTTP runtime handles Discord messages and 404s unknown routes", async () => {
    const agent = createMusicianBookingAgent();
    const discord = await handleBeeRequest(
        jsonRequest("/discord/messages", {
            authorId: "user_1",
            guildId: "guild_1",
            channelId: "channel_1",
            content: "What packages are available?",
        }),
        { agent, now },
    );
    const notFound = await handleBeeRequest(
        new Request("https://bee.example.test/missing"),
        { agent, now },
    );

    assert.equal(discord.status, 200);
    assert.equal(notFound.status, 404);
});

test("HTTP runtime supports a pluggable authorization gate", async () => {
    const denied = await handleBeeRequest(
        jsonRequest("/web/messages", {
            text: "What packages are available?",
        }),
        {
            agent: createMusicianBookingAgent(),
            now,
            authorize: () => ({
                allowed: false,
                status: 402,
                reason: "BYOP authorization required",
            }),
        },
    );
    const allowed = await handleBeeRequest(
        jsonRequest("/web/messages", {
            text: "What packages are available?",
        }),
        {
            agent: createMusicianBookingAgent(),
            now,
            authorize: () => ({ allowed: true, userId: "payer_user" }),
        },
    );
    const deniedBody = (await denied.json()) as { error: string };
    const allowedBody = (await allowed.json()) as { status: string };

    assert.equal(denied.status, 402);
    assert.equal(deniedBody.error, "BYOP authorization required");
    assert.equal(allowed.status, 200);
    assert.equal(allowedBody.status, "draft");
});
