import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createObservabilityApp } from "../src/app.ts";

const origin = "https://observability.example";
const secret = "test-session-secret-at-least-32-characters";
function session() {
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
        JSON.stringify({
            sub: "test-admin",
            email: "admin@example.invalid",
            role: "admin",
            aud: origin,
            exp: now + 3600,
            checkedAt: now,
        }),
    ).toString("base64url");
    return `pollinations_session=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
const env = {
    POLLINATIONS_OAUTH_CLIENT_ID: "pk_test",
    POLLINATIONS_AUTH_SESSION_SECRET: secret,
};

for (const expiry of [
    "",
    `; grafana_session_expiry=${Math.floor(Date.now() / 1000) - 60}`,
    "; grafana_session_expiry=",
]) {
    test(`authenticated Grafana request ${expiry ? "with old expiry" : "without old expiry"}`, async () => {
        const app = createObservabilityApp(async (request) => {
            assert.equal(request.headers.get("X-WEBAUTH-USER"), "test-admin");
            assert.equal(request.headers.get("X-WEBAUTH-ROLE"), "Editor");
            assert.equal(request.headers.get("Cookie"), null);
            assert.equal(request.headers.get("Authorization"), null);
            return new Response("Grafana", {
                headers: { "Content-Type": "text/html" },
            });
        });
        const response = await app.request(
            `${origin}/grafana/`,
            {
                headers: {
                    Cookie: session() + expiry,
                    Authorization: "Bearer untrusted",
                    "X-WEBAUTH-USER": "forged",
                },
            },
            env,
        );
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "Grafana");
        const cookies = response.headers.getSetCookie();
        assert.equal(cookies.length, expiry ? 2 : 0);
        if (expiry) {
            assert.ok(cookies.some((cookie) => /Path=\/(?:;|$)/.test(cookie)));
            assert.ok(
                cookies.some((cookie) =>
                    /Path=\/grafana\/(?:;|$)/.test(cookie),
                ),
            );
            for (const cookie of cookies) {
                assert.match(cookie, /^grafana_session_expiry=;/);
                assert.match(cookie, /Max-Age=0/);
            }
            // Expiring Grafana metadata must not invalidate the app session.
            const next = await app.request(
                `${origin}/grafana/`,
                { headers: { Cookie: session() } },
                env,
            );
            assert.equal(next.status, 200);
        }
    });
}

test("old Grafana cookies and forged identity cannot bypass Pollinations sign-in", async () => {
    const app = createObservabilityApp(async () => {
        assert.fail("Unauthenticated requests must not reach Grafana");
    });
    const response = await app.request(
        `${origin}/grafana/`,
        {
            headers: {
                Cookie: "grafana_session=old-test-value; grafana_session_expiry=1",
                "X-WEBAUTH-USER": "test-admin",
            },
        },
        env,
    );
    assert.equal(response.status, 401);
});
