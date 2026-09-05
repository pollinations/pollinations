import assert from "node:assert/strict";
import test from "node:test";
import { deviceLoginTools } from "../src/services/deviceLoginService.js";
import {
    clearApiKey,
    getMaskedKey,
    hasApiKey,
} from "../src/utils/authUtils.js";

const ENTER_URL =
    (typeof process !== "undefined" &&
        process.env?.POLLINATIONS_ENTER_URL?.trim()) ||
    "https://enter.pollinations.ai";

const startDeviceLogin = deviceLoginTools[0][3];
const pollDeviceLogin = deviceLoginTools[1][3];
const whoAmI = deviceLoginTools[2][3];

/** Install a fetch stub keyed by URL substring; returns a restore fn. */
function stubFetch(routes, calls = []) {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        calls.push({ url, init });
        for (const [needle, respond] of routes) {
            if (url.includes(needle)) {
                return respond(init);
            }
        }
        return new Response(JSON.stringify({ error: "unexpected" }), {
            status: 404,
        });
    };
    return () => {
        globalThis.fetch = originalFetch;
    };
}

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

test("startDeviceLogin returns user code and verification URL, never device code", async (t) => {
    const calls = [];
    const restore = stubFetch(
        [
            [
                "/api/device/code",
                () =>
                    json({
                        device_code: "secret-device-code",
                        user_code: "ABCD-1234",
                        verification_uri: `${ENTER_URL}/device`,
                        verification_uri_complete: `${ENTER_URL}/device?user_code=ABCD-1234`,
                        expires_in: 1800,
                        interval: 5,
                    }),
            ],
        ],
        calls,
    );
    t.after(restore);

    const result = await startDeviceLogin({});
    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.userCode, "ABCD-1234");
    assert.equal(
        payload.verificationUri,
        `${ENTER_URL}/device?user_code=ABCD-1234`,
    );
    assert.ok(payload.expiresAt);
    assert.ok(!JSON.stringify(payload).includes("device_code"));

    assert.equal(calls.length, 1);
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.client_id, "pk_NgBAArhUeGvSRFba");
    assert.equal(body.scope, "generate keys usage");
});

test("startDeviceLogin honors a custom scope", async (t) => {
    const calls = [];
    const restore = stubFetch(
        [
            [
                "/api/device/code",
                () =>
                    json({
                        device_code: "d",
                        user_code: "WXYZ-9876",
                        verification_uri_complete: `${ENTER_URL}/device?user_code=WXYZ-9876`,
                        expires_in: 1800,
                    }),
            ],
        ],
        calls,
    );
    t.after(restore);

    await startDeviceLogin({ scope: "generate profile usage keys" });
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.scope, "generate profile usage keys");
});

test("pollDeviceLogin walks pending -> approved and activates the key", async (t) => {
    let polls = 0;
    const restore = stubFetch([
        [
            "/api/device/code",
            () =>
                json({
                    device_code: "device-1",
                    user_code: "AAAA-1111",
                    verification_uri_complete: `${ENTER_URL}/device?user_code=AAAA-1111`,
                    expires_in: 1800,
                }),
        ],
        [
            "/api/device/token",
            () => {
                polls += 1;
                if (polls === 1) {
                    return json({ error: "authorization_pending" }, 400);
                }
                return json({
                    access_token: "sk_live_test123",
                    token_type: "bearer",
                });
            },
        ],
    ]);
    t.after(() => {
        restore();
        clearApiKey();
    });

    await startDeviceLogin({});

    const pending = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(pending.status, "pending");

    const approved = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(approved.status, "approved");
    assert.equal(approved.maskedKey, getMaskedKey());
    assert.ok(hasApiKey());
});

test("pollDeviceLogin reports expired when the code expires locally", async (t) => {
    const restore = stubFetch([
        [
            "/api/device/code",
            () =>
                json({
                    device_code: "device-2",
                    user_code: "BBBB-2222",
                    verification_uri_complete: `${ENTER_URL}/device?user_code=BBBB-2222`,
                    expires_in: -1, // already expired
                }),
        ],
    ]);
    t.after(restore);

    await startDeviceLogin({});
    const result = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(result.status, "expired");
});

test("pollDeviceLogin reports error on access_denied", async (t) => {
    const restore = stubFetch([
        [
            "/api/device/code",
            () =>
                json({
                    device_code: "device-3",
                    user_code: "CCCC-3333",
                    verification_uri_complete: `${ENTER_URL}/device?user_code=CCCC-3333`,
                    expires_in: 1800,
                }),
        ],
        ["/api/device/token", () => json({ error: "access_denied" }, 400)],
    ]);
    t.after(restore);

    await startDeviceLogin({});
    const result = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(result.status, "error");
    assert.match(result.message, /declined/i);
});

test("pollDeviceLogin errors when no login was started", async () => {
    const result = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(result.status, "error");
    assert.match(result.message, /startDeviceLogin/i);
});

test("whoAmI fetches identity with the session key", async (t) => {
    const calls = [];
    const restore = stubFetch(
        [
            [
                "/api/device/userinfo",
                () =>
                    json({
                        sub: "user-1",
                        name: "Thomas",
                        preferred_username: "thomasdev",
                    }),
            ],
        ],
        calls,
    );
    t.after(restore);

    const result = await whoAmI(
        {},
        { http: { authInfo: { token: "sk_test" } } },
    );
    const payload = JSON.parse(result.content[0].text);

    assert.equal(payload.sub, "user-1");
    assert.equal(payload.name, "Thomas");
    assert.equal(payload.preferredUsername, "thomasdev");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test");
});
