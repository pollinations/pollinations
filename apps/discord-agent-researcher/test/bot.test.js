import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
    askAgent,
    errorMessage,
    handleCommand,
    MODEL_ID,
    pollDeviceToken,
    requestDeviceCode,
    UserFacingError,
} from "../bot.js";
import { TokenStore } from "../store.js";

const response = (body, ok = true, status = ok ? 200 : 400) => ({
    ok,
    status,
    json: async () => body,
});
let directory;

before(async () => {
    directory = await mkdtemp(join(tmpdir(), "discord-researcher-"));
});

after(async () => {
    await rm(directory, { recursive: true, force: true });
});

test("device polling handles pending and slow_down before success", async () => {
    const waits = [];
    const replies = [
        response({ error: "authorization_pending" }, false),
        response({ error: "slow_down" }, false),
        response({ access_token: "sk_test_token" }),
    ];
    let clock = 0;
    const token = await pollDeviceToken({
        deviceCode: "device-code",
        interval: 1,
        expiresIn: 30,
        now: () => clock,
        sleep: async (ms) => {
            waits.push(ms);
            clock += ms;
        },
        fetchImpl: async () => replies.shift(),
    });
    assert.equal(token, "sk_test_token");
    assert.deepEqual(waits, [1000, 1000, 6000]);
});

test("device polling maps denial and expiry without exposing response text", async () => {
    await assert.rejects(
        pollDeviceToken({
            deviceCode: "device-code",
            interval: 0,
            expiresIn: 10,
            sleep: async () => {},
            now: (() => {
                let calls = 0;
                return () => (calls++ < 2 ? 0 : 1);
            })(),
            fetchImpl: async () =>
                response(
                    {
                        error: "access_denied",
                        error_description: "sk_secret_should_not_escape",
                    },
                    false,
                ),
        }),
        (error) =>
            error instanceof UserFacingError &&
            error.code === "denied" &&
            !error.message.includes("sk_secret"),
    );
    assert.equal(
        errorMessage(new UserFacingError("expired")),
        "The sign-in code expired. Run /connect to get a new one.",
    );
});

test("device start validates App Key and returns complete verification URI", async () => {
    const calls = [];
    const device = await requestDeviceCode({
        appKey: " pk_test_app ",
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return response({
                device_code: "d1",
                user_code: "ABCD-1234",
                verification_uri_complete:
                    "https://enter.pollinations.ai/device?user_code=ABCD-1234",
                interval: 5,
                expires_in: 600,
            });
        },
    });
    assert.equal(
        device.verificationUri,
        "https://enter.pollinations.ai/device?user_code=ABCD-1234",
    );
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        client_id: "pk_test_app",
    });
    await assert.rejects(
        requestDeviceCode({
            appKey: "sk_not_an_app_key",
            fetchImpl: async () => response({}),
        }),
        { code: "configuration" },
    );
});

test("ask sends the pinned model and bearer while redacting failures", async () => {
    const calls = [];
    const answer = await askAgent("hello", "sk_user_token", {
        fetchImpl: async (url, init) => {
            calls.push({ url, init });
            return response({
                choices: [{ message: { content: "hello back" } }],
            });
        },
    });
    assert.equal(answer, "hello back");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_user_token");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
        model: MODEL_ID,
        messages: [{ role: "user", content: "hello" }],
    });
    assert.equal(
        errorMessage(new UserFacingError("ask")),
        "Pollinations could not answer right now. Please try again.",
    );
    await assert.rejects(
        askAgent("hello", "sk_user_token", {
            fetchImpl: async () => response({ error: "sk_secret" }, false),
        }),
        { code: "ask" },
    );
});

test("request timeout becomes a redacted network error", async () => {
    await assert.rejects(
        requestDeviceCode({
            appKey: "pk_test_app",
            timeoutMs: 5,
            fetchImpl: (_url, { signal }) =>
                new Promise((_, reject) =>
                    signal.addEventListener("abort", () =>
                        reject(new Error("contains sk_secret")),
                    ),
                ),
        }),
        (error) =>
            error.code === "network" && !error.message.includes("sk_secret"),
    );
});

test("token store enforces shape and supports set/get/delete", async () => {
    const store = new TokenStore(join(directory, "tokens.json"));
    await store.set("123456", "sk_user_token");
    assert.equal(await store.get("123456"), "sk_user_token");
    await assert.rejects(store.set("123456", "not-a-token"));
    await store.delete("123456");
    assert.equal(await store.get("123456"), null);
});

function interaction(commandName, userId = "123456") {
    const edits = [];
    return {
        commandName,
        guildId: "guild",
        user: { id: userId },
        options: { getString: () => "What is Pollinations?" },
        isChatInputCommand: () => true,
        deferReply: async (options) => edits.push({ deferred: options }),
        editReply: async (options) => edits.push(options),
        edits,
    };
}

test("connect stores the polled key and disconnect removes it", async () => {
    const values = {};
    const store = {
        set: async (id, token) => {
            values[id] = token;
        },
        get: async (id) => values[id] ?? null,
        delete: async (id) => {
            delete values[id];
        },
    };
    const connect = interaction("connect");
    const replies = [
        response({
            device_code: "d1",
            user_code: "ABCD-1234",
            verification_uri_complete:
                "https://enter.pollinations.ai/device?user_code=ABCD-1234",
            interval: 1,
            expires_in: 10,
        }),
        response({ access_token: "sk_connected" }),
    ];
    let now = 0;
    await handleCommand(connect, {
        appKey: "pk_test_app",
        store,
        now: () => now,
        sleep: async (ms) => {
            now += ms;
        },
        fetchImpl: async () => replies.shift(),
    });
    assert.equal(values["123456"], "sk_connected");
    assert.equal(connect.edits[0].deferred.ephemeral, true);
    assert.match(
        connect.edits[1].content,
        /verification_uri_complete|enter\.pollinations\.ai\/device/,
    );
    assert.match(connect.edits.at(-1).content, /Connected/);
    const disconnect = interaction("disconnect");
    await handleCommand(disconnect, { store });
    assert.equal(values["123456"], undefined);
    assert.match(
        disconnect.edits.at(-1).content,
        /revoke.*server-side|account keys page|enter\.pollinations\.ai\/keys/i,
    );
});

test("ask without a connection does not call the model", async () => {
    const ask = interaction("ask");
    let called = false;
    await handleCommand(ask, {
        store: { get: async () => null },
        fetchImpl: async () => {
            called = true;
            return response({});
        },
    });
    assert.equal(called, false);
    assert.match(ask.edits.at(-1).content, /Connect first/);
});

test("expired authorization is removed and asks the user to reconnect", async () => {
    const ask = interaction("ask");
    let removed = false;
    await handleCommand(ask, {
        store: {
            get: async () => "sk_expired",
            delete: async () => {
                removed = true;
            },
        },
        fetchImpl: async () => response({}, false, 401),
    });
    assert.equal(removed, true);
    assert.match(ask.edits.at(-1).content, /\/connect to reconnect/);
});
