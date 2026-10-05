import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    answerEmbeds,
    commands,
    createInteractionHandler,
    messagesFromDiscordHistory,
} from "../bot.js";
import { loadConfig } from "../config.js";
import { buildConsentUrl } from "../pollinations.js";
import { TokenStore } from "../store.js";

const config = {
    agentId: "creator/researcher",
    agentName: "Researcher",
    appKey: "pk_test",
};

test("configuration turns a creator-owned bot into any Community Agent", () => {
    assert.deepEqual(
        loadConfig({
            DISCORD_TOKEN: "discord-secret",
            DISCORD_CLIENT_ID: "123",
            POLLINATIONS_APP_KEY: "pk_test",
            COMMUNITY_AGENT_ID: "creator/researcher",
        }),
        {
            agentId: "creator/researcher",
            agentName: "researcher",
            appKey: "pk_test",
            discordClientId: "123",
            discordGuildId: undefined,
            discordToken: "discord-secret",
        },
    );
    assert.equal(commands("Researcher")[1].description, "Ask Researcher");
});

test("consent is limited to the configured agent and bounded budget", () => {
    const url = new URL(
        buildConsentUrl(
            "https://enter.pollinations.ai/device?user_code=ABCD",
            "pk_test",
            "ABCD",
            config.agentId,
        ),
    );
    assert.equal(url.searchParams.get("models"), config.agentId);
    assert.equal(url.searchParams.get("budget"), "5");
    assert.equal(url.searchParams.get("expiry"), "7");
});

test("Discord messages provide bounded, per-user conversation history", () => {
    const a = answerEmbeds(config, "A question", "A answer", "user-a");
    const b = answerEmbeds(config, "B question", "B answer", "user-b");
    const history = [
        {
            createdTimestamp: 1,
            author: { id: "bot" },
            embeds: a.map((embed) => embed.data),
        },
        {
            createdTimestamp: 2,
            author: { id: "bot" },
            embeds: b.map((embed) => embed.data),
        },
    ];
    assert.deepEqual(
        messagesFromDiscordHistory(history, "bot", "user-a", config.agentId),
        [
            { role: "user", content: "A question" },
            { role: "assistant", content: "A answer" },
        ],
    );
    assert.deepEqual(
        messagesFromDiscordHistory(history, "bot", "user-a", "other/agent"),
        [],
    );
});

test("connect, ask, and disconnect keep delegated credentials private", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hosted-discord-agent-"));
    const tokenPath = join(directory, "tokens.json");
    const store = new TokenStore(tokenPath);
    const calls = [];
    const handler = createInteractionHandler({
        config,
        store,
        authorize: async () => ({
            verificationUri: "https://enter.pollinations.ai/device",
            userCode: "ABCD",
            poll: async () => "sk_private",
        }),
        userInfo: async () => ({ preferred_username: "alice" }),
        agent: async (token, messages, agentId) => {
            calls.push({ token, messages, agentId });
            return "Answer";
        },
    });
    const interaction = (commandName) => {
        const replies = [];
        const edits = [];
        return {
            commandName,
            user: { id: "user-a" },
            client: { user: { id: "bot" } },
            channel: { messages: { fetch: async () => new Map() } },
            options: { getString: () => "Question" },
            isChatInputCommand: () => true,
            reply: async (value) => replies.push(value),
            editReply: async (value) => edits.push(value),
            deferReply: async () => {},
            replies,
            edits,
        };
    };

    const connect = interaction("connect");
    await handler(connect);
    for (
        let attempt = 0;
        attempt < 20 && !(await store.get("user-a"));
        attempt++
    )
        await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await store.get("user-a")).token, "sk_private");
    assert.doesNotMatch(JSON.stringify(connect.replies), /sk_private/);
    assert.equal((await stat(tokenPath)).mode & 0o777, 0o600);

    const ask = interaction("ask");
    await handler(ask);
    assert.deepEqual(calls[0], {
        token: "sk_private",
        messages: [{ role: "user", content: "Question" }],
        agentId: config.agentId,
    });

    await handler(interaction("disconnect"));
    assert.equal(await store.get("user-a"), null);
});
