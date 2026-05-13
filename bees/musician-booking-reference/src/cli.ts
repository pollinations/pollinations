#!/usr/bin/env node
import { createMusicianBookingAgent } from "./agent.js";

const input =
    process.argv.slice(2).join(" ") ||
    "I need a jazz trio for a 120 person gala in Berlin on 2026-07-18. Budget around 2500. Contact alex@example.test";

const agent = createMusicianBookingAgent();
const reply = await agent.handleInboundMessage({
    userId: "demo-user",
    channel: "cli",
    text: input,
});

console.log(reply.text);
console.log(
    JSON.stringify(
        {
            conversationId: reply.conversationId,
            bookingId: reply.bookingId,
            status: reply.status,
            quoteTotal: reply.quoteTotal,
            toolCalls: reply.toolCalls,
        },
        null,
        2,
    ),
);
