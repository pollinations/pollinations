/**
 * Reproducible connect → use → disconnect demonstration with a mocked
 * Discord interaction and a mocked Pollinations API. No Discord token or
 * Pollinations App Key needed:
 *
 *   npm test
 */

import assert from "node:assert/strict";
import {
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
    buildMessages,
    handleCommand,
    MAX_PROMPT_LENGTH,
} from "../commands.js";
import { AGENT_MODEL } from "../pollinations.js";
import { TokenStore } from "../store.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

/** Minimal interaction-shaped object recording every reply. */
function mockInteraction(commandName, { prompt } = {}) {
    const sent = [];
    return {
        commandName,
        user: {
            id: "discord-user-1",
            username: "tester",
            send: async (text) => sent.push({ dm: text }),
        },
        options: { getString: () => prompt },
        isChatInputCommand: () => true,
        deferReply: async (opts) => sent.push({ defer: opts ?? null }),
        editReply: async (text) => sent.push({ edit: text }),
        reply: async (msg) => sent.push({ reply: msg }),
        sent,
    };
}

/** Scripted fetch implementing the Pollinations device flow + agent call. */
function mockPollinations(calls, { deviceReplies } = {}) {
    const replies = [...(deviceReplies ?? [])];
    return async (url, init = {}) => {
        calls.push({ url, body: init.body, headers: init.headers });
        const json = (data, ok = true, status = ok ? 200 : 400) => ({
            ok,
            status,
            json: async () => data,
        });
        if (url.endsWith("/api/device/code")) {
            return json({
                device_code: "device-1",
                user_code: "ABCD-1234",
                verification_uri_complete:
                    "https://enter.pollinations.ai/device?user_code=ABCD-1234",
                interval: 0,
                expires_in: 600,
            });
        }
        if (url.endsWith("/api/oauth/token")) {
            return replies.length
                ? json(replies.shift(), false)
                : json({ access_token: "sk_user_scoped_key" });
        }
        if (url.endsWith("/api/device/userinfo")) {
            return json({ preferred_username: "pollinations-tester" });
        }
        if (url.endsWith("/v1/chat/completions")) {
            return json({
                choices: [
                    {
                        message: {
                            content: "Photosynthesis turns light into energy.",
                        },
                    },
                ],
            });
        }
        throw new Error(`Unexpected URL in mock: ${url}`);
    };
}

function makeServices(calls, dir, opts) {
    return {
        appKey: "pk_test_app",
        store: new TokenStore(join(dir, "tokens.json")),
        fetchImpl: mockPollinations(calls, opts),
    };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("connect → use → disconnect (full flow, mocked APIs)", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);

    // 1. CONNECT: one pending poll, then approval.
    services.fetchImpl = mockPollinations(calls, {
        deviceReplies: [{ error: "authorization_pending" }],
    });
    const connect = mockInteraction("connect");
    await handleCommand(connect, services);

    assert.equal(services.store.get("discord-user-1"), "sk_user_scoped_key");
    assert.ok(connect.sent.some((m) => m.dm?.includes("ABCD-1234")));
    assert.match(
        connect.sent.at(-1).edit,
        /Connected as \*\*pollinations-tester\*\*/,
    );
    // App Key is used for attribution on the device-code request.
    assert.match(calls[0].body, /pk_test_app/);

    // 2. USE: /chat forwards to the hosted agent with the user's key.
    const chat = mockInteraction("chat", {
        prompt: "Explain photosynthesis",
    });
    await handleCommand(chat, services);

    const genCall = calls.find((c) => c.url.endsWith("/v1/chat/completions"));
    assert.equal(genCall.headers.Authorization, "Bearer sk_user_scoped_key");
    const payload = JSON.parse(genCall.body);
    assert.equal(payload.model, AGENT_MODEL);
    assert.match(
        payload.messages.at(-1).content,
        /tester: Explain photosynthesis/,
    );
    assert.match(chat.sent.at(-1).edit, /Photosynthesis/);

    // 3. DISCONNECT: key removed; further /chat is refused without a call.
    const disconnect = mockInteraction("disconnect");
    await handleCommand(disconnect, services);
    assert.equal(services.store.get("discord-user-1"), null);
    assert.match(disconnect.sent.at(-1).reply.content, /Disconnected/);

    const callsBefore = calls.length;
    const orphan = mockInteraction("chat", { prompt: "hello?" });
    await handleCommand(orphan, services);
    assert.equal(calls.length, callsBefore);
    assert.match(orphan.sent.at(-1).reply.content, /connect/i);
});

test("expired key on /chat is dropped and the user is asked to reconnect", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);
    services.store.set("discord-user-1", "sk_old_key");
    services.fetchImpl = async (url) => {
        calls.push({ url });
        return {
            ok: false,
            status: 401,
            json: async () => ({ error: "unauthorized" }),
        };
    };

    const chat = mockInteraction("chat", { prompt: "hi" });
    await handleCommand(chat, services);
    assert.equal(services.store.get("discord-user-1"), null);
    assert.match(chat.sent.at(-1).edit, /\/connect to reconnect/);
    // Auth failures must not be retried.
    assert.equal(calls.length, 1);
});

test("denied device authorization surfaces a clear message and stores nothing", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir, {
        deviceReplies: [{ error: "access_denied" }, { error: "access_denied" }],
    });
    const connect = mockInteraction("connect");
    await handleCommand(connect, services);
    assert.equal(services.store.get("discord-user-1"), null);
    assert.match(connect.sent.at(-1).edit, /denied/i);
});

test("buildMessages keeps Discord context ahead of the new prompt", () => {
    const messages = buildMessages({
        username: "tester",
        prompt: "and why is the sky blue?",
        history: [{ role: "assistant", content: "Earlier answer." }],
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "assistant");
    assert.match(messages[1].content, /^tester: /);
});

test("transient 5xx upstream errors are retried until the answer succeeds", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);
    services.store.set("discord-user-1", "sk_user_scoped_key");
    let attempts = 0;
    services.fetchImpl = async (url) => {
        calls.push({ url });
        attempts++;
        if (attempts < 3) {
            return {
                ok: false,
                status: 500,
                json: async () => ({ error: "upstream boom" }),
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content: "Recovered answer." } }],
            }),
        };
    };

    const chat = mockInteraction("chat", { prompt: "hi" });
    await handleCommand(chat, services);
    assert.equal(attempts, 3); // two failures + one success
    assert.match(chat.sent.at(-1).edit, /Recovered answer/);
});

test("429 responses are retried and honor the Retry-After header", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);
    services.store.set("discord-user-1", "sk_user_scoped_key");
    let attempts = 0;
    services.fetchImpl = async (url) => {
        calls.push({ url });
        attempts++;
        if (attempts === 1) {
            return {
                ok: false,
                status: 429,
                headers: {
                    get: (name) => (name === "retry-after" ? "0" : null),
                },
                json: async () => ({ error: "rate limited" }),
            };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{ message: { content: "After the limit." } }],
            }),
        };
    };

    const chat = mockInteraction("chat", { prompt: "hi" });
    await handleCommand(chat, services);
    assert.equal(attempts, 2);
    assert.match(chat.sent.at(-1).edit, /After the limit/);
});

test("persistent 5xx failure ends in a clean user-safe error", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);
    services.store.set("discord-user-1", "sk_user_scoped_key");
    services.fetchImpl = async (url) => {
        calls.push({ url });
        return {
            ok: false,
            status: 502,
            json: async () => ({ error: "bad gateway" }),
        };
    };

    const chat = mockInteraction("chat", { prompt: "hi" });
    await handleCommand(chat, services);
    assert.equal(calls.length, 3); // gave up after maxAttempts
    assert.match(chat.sent.at(-1).edit, /busy right now/);
});

test("malformed agent response yields a clean error, not a crash", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);
    services.store.set("discord-user-1", "sk_user_scoped_key");
    services.fetchImpl = async (url) => {
        calls.push({ url });
        return { ok: true, status: 200, json: async () => ({}) };
    };

    const chat = mockInteraction("chat", { prompt: "hi" });
    await handleCommand(chat, services);
    assert.match(chat.sent.at(-1).edit, /could not answer/);
});

test("over-long prompts are refused before any network call", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const calls = [];
    const services = makeServices(calls, dir);
    services.store.set("discord-user-1", "sk_user_scoped_key");

    const chat = mockInteraction("chat", {
        prompt: "x".repeat(MAX_PROMPT_LENGTH + 1),
    });
    await handleCommand(chat, services);
    assert.equal(calls.length, 0);
    assert.match(chat.sent.at(-1).reply.content, /limited to 4000 characters/);
});

test("token store encrypts at rest when TOKEN_STORE_SECRET is set", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => {
        delete process.env.TOKEN_STORE_SECRET;
        rmSync(dir, { recursive: true, force: true });
    });
    process.env.TOKEN_STORE_SECRET = "test-secret";
    const path = join(dir, "tokens.json");

    const store = new TokenStore(path);
    store.set("discord-user-1", "sk_secret_user_key");

    // The key never appears in plaintext on disk.
    const raw = readFileSync(path, "utf8");
    assert.ok(!raw.includes("sk_secret_user_key"));
    assert.match(raw, /"encrypted":true/);

    // A fresh instance with the same secret reads it back.
    const reopened = new TokenStore(path);
    assert.equal(reopened.get("discord-user-1"), "sk_secret_user_key");

    // No temp files are left behind by the atomic write.
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});

test("token store without a secret stays plaintext and refuses encrypted files", async (t) => {
    const dir = mkdtempSync(join(tmpdir(), "discord-agent-"));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    delete process.env.TOKEN_STORE_SECRET;

    const path = join(dir, "tokens.json");
    const plain = new TokenStore(path, { secret: null });
    plain.set("u", "sk_plain");
    assert.match(readFileSync(path, "utf8"), /sk_plain/);

    const encPath = join(dir, "enc.json");
    const enc = new TokenStore(encPath, { secret: "s3cret" });
    enc.set("u", "sk_hidden");
    const noSecret = new TokenStore(encPath, { secret: null });
    assert.throws(() => noSecret.get("u"), /TOKEN_STORE_SECRET/);
});
