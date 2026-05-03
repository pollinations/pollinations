import assert from "node:assert/strict";
import test from "node:test";
import { createMusicianBookingAgent } from "../src/agent.js";

test("lists packages and creates a conversation", async () => {
    const agent = createMusicianBookingAgent();
    const reply = await agent.handleInboundMessage({
        userId: "user_1",
        channel: "api",
        text: "What packages and prices do you offer?",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });

    assert.equal(reply.status, "draft");
    assert.match(reply.text, /Solo acoustic set/);
    assert.match(reply.text, /Jazz trio/);
    assert.deepEqual(reply.toolCalls, ["list_packages"]);
});

test("quotes a complete booking request", async () => {
    const agent = createMusicianBookingAgent();
    const reply = await agent.handleInboundMessage({
        userId: "user_2",
        channel: "api",
        text: "I need a jazz trio for a 120 person gala in Berlin on 2026-07-18 at 19:30. Budget around 2500. Contact alex@example.test",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });

    assert.equal(reply.status, "quoted");
    assert.equal(reply.quoteTotal, 1980);
    assert.equal(reply.needsReview, false);
    assert.match(reply.text, /Quote:/);
    assert.ok(reply.toolCalls.includes("generate_quote"));
});

test("flags large full-band requests for manager review", async () => {
    const agent = createMusicianBookingAgent();
    const reply = await agent.handleInboundMessage({
        userId: "user_3",
        channel: "api",
        text: "We want a full band for a 700 person festival in Lisbon on 2026-09-03. Budget 3000. Contact booking@example.test",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });

    assert.equal(reply.status, "needs_review");
    assert.equal(reply.needsReview, true);
    assert.match(reply.text, /review/);
});

test("can place a tentative hold and writes audit events", async () => {
    const agent = createMusicianBookingAgent();
    const reply = await agent.handleInboundMessage({
        userId: "user_4",
        channel: "api",
        text: "Please hold a solo acoustic ceremony in Munich on 2026-08-12 for 80 guests. Contact sam@example.test",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });
    const events = await agent.store.listEvents();

    assert.equal(reply.status, "hold");
    assert.ok(reply.toolCalls.includes("place_hold"));
    assert.ok(events.some((event) => event.type === "tool_calls"));
    assert.ok(events.some((event) => event.type === "agent_reply"));
});

test("can confirm a previously quoted booking", async () => {
    const agent = createMusicianBookingAgent();
    const first = await agent.handleInboundMessage({
        userId: "user_5",
        channel: "api",
        text: "I need a solo acoustic ceremony in Hamburg on 2026-10-02 for 90 guests. Contact pat@example.test",
        now: new Date("2026-06-01T10:00:00.000Z"),
    });
    const second = await agent.handleInboundMessage({
        userId: "user_5",
        channel: "api",
        text: "Approved, please confirm the booking",
        now: new Date("2026-06-01T10:05:00.000Z"),
    });
    const booking = await agent.store.getBooking(first.bookingId);

    assert.equal(second.status, "confirmed");
    assert.equal(booking?.status, "confirmed");
    assert.ok(second.toolCalls.includes("confirm_booking"));
});
