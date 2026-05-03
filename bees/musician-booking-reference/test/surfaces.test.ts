import assert from "node:assert/strict";
import test from "node:test";
import { createMusicianBookingAgent } from "../src/agent.js";
import {
    createA2AAgentCard,
    handleA2AMessageSend,
    handleDiscordMessage,
    handleOpenAIChatCompletion,
    handleWebMessage,
    toServerSentEvents,
} from "../src/surfaces/index.js";

test("OpenAI-compatible surface returns assistant choice with metadata", async () => {
    const agent = createMusicianBookingAgent();
    const response = await handleOpenAIChatCompletion(
        agent,
        {
            model: "musician-booking-reference",
            user: "user_openai",
            messages: [
                {
                    role: "user",
                    content:
                        "Quote a jazz trio for 120 guests in Berlin on 2026-07-18. Contact alex@example.test",
                },
            ],
        },
        { now: new Date("2026-06-01T10:00:00.000Z") },
    );

    assert.equal(response.object, "chat.completion");
    assert.equal(response.choices[0]?.message.role, "assistant");
    assert.equal(response.metadata.status, "quoted");
    assert.equal(response.metadata.quote_total, 1980);
});

test("A2A surface exposes card and handles message/send", async () => {
    const agent = createMusicianBookingAgent();
    const card = createA2AAgentCard("https://example.test/");
    const response = await handleA2AMessageSend(
        agent,
        {
            jsonrpc: "2.0",
            id: "req_1",
            method: "message/send",
            params: {
                message: {
                    contextId: "ctx_1",
                    parts: [
                        {
                            kind: "text",
                            text: "List packages",
                        },
                    ],
                },
            },
        },
        { now: new Date("2026-06-01T10:00:00.000Z") },
    );

    assert.equal(card.url, "https://example.test/a2a");
    assert.equal(response.jsonrpc, "2.0");
    assert.equal(response.id, "req_1");
    assert.ok("result" in response);
    if ("result" in response) {
        assert.equal(response.result.status.state, "completed");
        assert.match(response.result.artifacts[0]?.parts[0]?.text ?? "", /Jazz trio/);
    }
});

test("Discord surface defaults to channel-scoped state", async () => {
    const agent = createMusicianBookingAgent();
    const first = await handleDiscordMessage(agent, {
        authorId: "user_a",
        guildId: "guild_1",
        channelId: "channel_1",
        content:
            "I need a solo acoustic ceremony in Hamburg on 2026-10-02 for 90 guests. Contact pat@example.test",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });
    const second = await handleDiscordMessage(agent, {
        authorId: "user_b",
        guildId: "guild_1",
        channelId: "channel_1",
        content: "Approved, please confirm it",
        now: new Date("2026-06-01T10:05:00.000Z"),
    });

    assert.equal(first.metadata.status, "quoted");
    assert.equal(second.metadata.status, "confirmed");
    assert.equal(first.metadata.booking_id, second.metadata.booking_id);
    assert.equal(second.data.allowed_mentions.parse.length, 0);
});

test("web surface returns core reply and SSE frames", async () => {
    const agent = createMusicianBookingAgent();
    const reply = await handleWebMessage(agent, {
        userId: "web_user",
        text: "What packages do you offer?",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });
    const sse = toServerSentEvents(reply);

    assert.equal(reply.status, "draft");
    assert.match(sse, /event: message/);
    assert.match(sse, /event: tool_calls/);
    assert.match(sse, /event: done/);
});
