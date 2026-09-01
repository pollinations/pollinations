import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { answerEmbeds, messagesFromDiscordHistory } from "../bot.js";
import { TokenStore } from "../store.js";

test("token store persists privately and disconnect removes only that user", async () => {
    const dir = await mkdtemp(join(tmpdir(), "polli-discord-"));
    const path = join(dir, "tokens.json");
    const store = new TokenStore(path);
    await store.set("user-a", { token: "sk_a", username: "alice" });
    await store.set("user-b", { token: "sk_b", username: "bob" });
    assert.equal((await store.get("user-a")).token, "sk_a");
    assert.equal(await store.delete("user-a"), true);
    assert.equal(await store.get("user-a"), null);
    assert.equal((await store.get("user-b")).token, "sk_b");
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.doesNotMatch(await readFile(path, "utf8"), /user-a/);
});

test("Discord messages reconstruct context without a conversation database", () => {
    const embeds = answerEmbeds(
        "Fix this loop",
        "Use a bounded iterator.",
        "alice",
    );
    const history = [
        {
            createdTimestamp: 1,
            author: { id: "bot" },
            embeds: embeds.map((embed) => embed.data),
        },
        {
            createdTimestamp: 2,
            author: { id: "other" },
            embeds: embeds.map((embed) => embed.data),
        },
    ];
    assert.deepEqual(messagesFromDiscordHistory(history, "bot"), [
        { role: "user", content: "Fix this loop" },
        { role: "assistant", content: "Use a bounded iterator." },
    ]);
});

test("long Discord responses are split and bounded", () => {
    const embeds = answerEmbeds("question", "x".repeat(7000), "alice");
    assert.equal(embeds.length, 2);
    assert.ok(embeds[0].data.description.length <= 3900);
    assert.ok(embeds[1].data.description.length <= 2000);
});

test("Discord context is isolated between connected users", () => {
    const a = answerEmbeds("A question", "A answer", "alice", "user-a");
    const b = answerEmbeds("B question", "B answer", "bob", "user-b");
    const history = [
        {
            createdTimestamp: 1,
            author: { id: "bot" },
            embeds: a.map((e) => e.data),
        },
        {
            createdTimestamp: 2,
            author: { id: "bot" },
            embeds: b.map((e) => e.data),
        },
    ];
    assert.deepEqual(messagesFromDiscordHistory(history, "bot", "user-a"), [
        { role: "user", content: "A question" },
        { role: "assistant", content: "A answer" },
    ]);
    assert.deepEqual(messagesFromDiscordHistory(history, "bot", "user-b"), [
        { role: "user", content: "B question" },
        { role: "assistant", content: "B answer" },
    ]);
});

test("connect -> ask -> disconnect keeps credentials private and per-user", async () => {
    const { createInteractionHandler } = await import("../bot.js");
    const dir = await mkdtemp(join(tmpdir(), "polli-discord-flow-"));
    const store = new TokenStore(join(dir, "tokens.json"));
    const agentCalls = [];
    const handler = createInteractionHandler({
        store,
        appKey: "pk_test",
        authorize: async () => ({
            verificationUri:
                "https://enter.pollinations.ai/device?user_code=ABCD",
            userCode: "ABCD",
            poll: async () => "sk_private_user_token",
        }),
        userInfo: async () => ({ preferred_username: "alice" }),
        agent: async (token, messages) => {
            agentCalls.push({ token, messages });
            return "Use Promise.allSettled for independent work.";
        },
    });

    const base = (commandName) => {
        const replies = [];
        const edits = [];
        return {
            commandName,
            user: { id: "user-a", username: "alice" },
            client: { user: { id: "bot" } },
            channel: { messages: { fetch: async () => new Map() } },
            options: { getString: () => "How should these promises run?" },
            isChatInputCommand: () => true,
            reply: async (value) => replies.push(value),
            editReply: async (value) => edits.push(value),
            deferReply: async () => {},
            replies,
            edits,
        };
    };

    const connect = base("connect");
    await handler(connect);
    assert.match(connect.replies[0].content, /ABCD/);
    let connected = null;
    for (let attempt = 0; attempt < 20 && !connected; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        connected = await store.get("user-a");
    }
    assert.equal(connected?.token, "sk_private_user_token");
    assert.doesNotMatch(
        JSON.stringify(connect.replies),
        /sk_private_user_token/,
    );

    const ask = base("ask");
    await handler(ask);
    assert.equal(agentCalls[0].token, "sk_private_user_token");
    assert.deepEqual(agentCalls[0].messages, [
        { role: "user", content: "How should these promises run?" },
    ]);
    assert.equal(
        JSON.stringify(ask.edits).includes("sk_private_user_token"),
        false,
    );

    const disconnect = base("disconnect");
    await handler(disconnect);
    assert.equal(await store.get("user-a"), null);
});

test("least-privilege consent URL pins agent/base model and zero budget", async () => {
    const {
        AGENT_BASE_MODEL,
        AGENT_MODEL,
        CONSENT_BUDGET,
        CONSENT_EXPIRY_DAYS,
        buildConsentUrl,
    } = await import("../pollinations.js");
    const url = new URL(
        buildConsentUrl(
            "https://enter.pollinations.ai/device?user_code=ABCD1234",
            "pk_demo",
            "ABCD1234",
        ),
    );
    assert.equal(url.pathname, "/authorize");
    assert.equal(url.searchParams.get("user_code"), "ABCD1234");
    assert.equal(url.searchParams.get("client_id"), "pk_demo");
    assert.equal(
        url.searchParams.get("models"),
        `${AGENT_MODEL},${AGENT_BASE_MODEL}`,
    );
    assert.equal(url.searchParams.get("budget"), String(CONSENT_BUDGET));
    assert.equal(url.searchParams.get("expiry"), String(CONSENT_EXPIRY_DAYS));
    assert.equal(CONSENT_BUDGET, 0);
});
