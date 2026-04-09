import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("notification status returns disabled when no subscriptions", async ({
    sessionToken,
}) => {
    const res = await SELF.fetch(
        "http://localhost:3000/api/notifications/status",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
        enabled: false,
        subscriptionCount: 0,
    });
});

test("subscribe and unsubscribe push notifications", async ({
    sessionToken,
}) => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/test-endpoint-123";
    const subscription = {
        endpoint,
        keys: {
            p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWG0",
            auth: "tBHItJI5svbpC7-BnK5gZQ",
        },
    };

    // Subscribe
    const subRes = await SELF.fetch(
        "http://localhost:3000/api/notifications/subscribe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify(subscription),
        },
    );
    expect(subRes.status).toBe(200);
    expect(await subRes.json()).toMatchObject({ ok: true });

    // Check status shows enabled
    const statusRes = await SELF.fetch(
        "http://localhost:3000/api/notifications/status",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    const statusData = await statusRes.json();
    expect(statusData).toMatchObject({
        enabled: true,
        subscriptionCount: 1,
    });

    // Unsubscribe
    const unsubRes = await SELF.fetch(
        "http://localhost:3000/api/notifications/unsubscribe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({ endpoint }),
        },
    );
    expect(unsubRes.status).toBe(200);

    // Check status shows disabled again
    const statusRes2 = await SELF.fetch(
        "http://localhost:3000/api/notifications/status",
        {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    const statusData2 = await statusRes2.json();
    expect(statusData2).toMatchObject({
        enabled: false,
        subscriptionCount: 0,
    });
});

test("subscribe requires authentication", async () => {
    const res = await SELF.fetch(
        "http://localhost:3000/api/notifications/subscribe",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                endpoint: "https://example.com/push",
                keys: { p256dh: "test", auth: "test" },
            }),
        },
    );
    expect(res.status).toBe(401);
});

test("subscribe rejects invalid endpoint URL", async ({ sessionToken }) => {
    const res = await SELF.fetch(
        "http://localhost:3000/api/notifications/subscribe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                endpoint: "not-a-url",
                keys: { p256dh: "test", auth: "test" },
            }),
        },
    );
    // Validation error
    expect(res.status).toBeGreaterThanOrEqual(400);
});
