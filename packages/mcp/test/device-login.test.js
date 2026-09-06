import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
    clearPendingDevice,
    pollDeviceLogin,
    startDeviceLogin,
    whoAmI,
} from "../src/services/deviceLoginService.js";
import {
    clearApiKey,
    getMaskedKey,
    hasApiKey,
} from "../src/utils/authUtils.js";

const ENTER_URL =
    process.env.POLLINATIONS_ENTER_URL || "https://enter.pollinations.ai";

function json(body, status = 200) {
    return Response.json(body, { status });
}

function deviceCode(overrides = {}) {
    return {
        device_code: "secret-device-code",
        user_code: "ABCD-1234",
        verification_uri_complete: `${ENTER_URL}/device?user_code=ABCD-1234`,
        expires_in: 1800,
        ...overrides,
    };
}

afterEach(() => {
    clearApiKey();
    clearPendingDevice();
});

test("starts login without exposing the device code", async (t) => {
    let request;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        request = { url: String(input), init };
        return json(deviceCode());
    });

    const result = await startDeviceLogin();
    const payload = JSON.parse(result.content[0].text);

    assert.deepEqual(Object.keys(payload), [
        "userCode",
        "verificationUri",
        "expiresAt",
    ]);
    assert.equal(payload.userCode, "ABCD-1234");
    assert.equal(
        payload.verificationUri,
        `${ENTER_URL}/device?user_code=ABCD-1234`,
    );
    assert.equal(request.url, `${ENTER_URL}/api/device/code`);
    assert.equal(
        request.init.headers["Content-Type"],
        "application/x-www-form-urlencoded",
    );
    assert.equal(
        new URLSearchParams(request.init.body).get("scope"),
        "generate keys usage",
    );
});

test("polls pending login and activates the approved key", async (t) => {
    let polls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/device/code")) return json(deviceCode());

        assert.equal(url, `${ENTER_URL}/api/oauth/token`);
        assert.equal(
            new URLSearchParams(init.body).get("device_code"),
            "secret-device-code",
        );
        polls += 1;
        return polls === 1
            ? json({ error: "authorization_pending" }, 400)
            : json({ access_token: "sk_live_test123" });
    });

    await startDeviceLogin();
    assert.equal(
        JSON.parse((await pollDeviceLogin()).content[0].text).status,
        "pending",
    );

    const approved = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(approved.status, "approved");
    assert.equal(approved.maskedKey, getMaskedKey());
    assert.ok(hasApiKey());
});

test("expires a login locally", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        json(deviceCode({ expires_in: -1 })),
    );

    await startDeviceLogin();
    const result = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(result.status, "expired");
});

test("clears a denied login", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) =>
        String(input).endsWith("/api/device/code")
            ? json(deviceCode())
            : json({ error: "access_denied" }, 400),
    );

    await startDeviceLogin();
    const denied = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(denied.status, "error");
    assert.equal(denied.message, "access_denied");

    const repeated = JSON.parse((await pollDeviceLogin()).content[0].text);
    assert.equal(repeated.status, "error");
    assert.match(repeated.message, /startDeviceLogin/);
});

test("returns the current account", async (t) => {
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        assert.equal(init.headers.Authorization, "Bearer sk_test");
        return json({
            sub: "user-1",
            name: "Thomas",
            preferred_username: "thomasdev",
        });
    });

    const result = await whoAmI(
        {},
        { http: { authInfo: { token: "sk_test" } } },
    );
    assert.deepEqual(JSON.parse(result.content[0].text), {
        sub: "user-1",
        name: "Thomas",
        preferred_username: "thomasdev",
    });
});
