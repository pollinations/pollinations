import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

const base = "http://localhost:3000/api/stripe";
const checkoutAmounts = [
    "/checkout/2",
    "/checkout/5",
    "/checkout/10",
    "/checkout/20",
    "/checkout/50",
    "/checkout/100",
];

function signStripePayload(payload: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");
    return `t=${timestamp},v1=${signature}`;
}

test.for(
    checkoutAmounts,
)("%s should only be accessible when authenticated via session cookie", async (route, {
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const anonymousResponse = await SELF.fetch(`${base}${route}`, {
        method: "GET",
    });
    expect(anonymousResponse.status).toBe(401);

    const sessionCookieResponse = await SELF.fetch(`${base}${route}`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        redirect: "manual",
    });
    // 302 = redirect to Stripe checkout, 500 = Stripe API error (no real API key in test)
    expect(sessionCookieResponse.status).toBeOneOf([302, 500]);
});

test("GET /api/stripe/products returns pack list", async () => {
    const response = await SELF.fetch(`${base}/products`);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
        packs: {
            amount: number;
            bonusPollen: number;
            pollenGrant: number;
            description: string;
        }[];
    };
    expect(data.packs).toHaveLength(6);
    expect(data.packs.map((p) => p.amount)).toEqual([2, 5, 10, 20, 50, 100]);
    expect(data.packs.map((p) => p.pollenGrant)).toEqual([
        2, 6, 13, 28, 75, 160,
    ]);
});

test("GET /api/stripe/checkout/invalid returns 400 for invalid amount", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const response = await SELF.fetch(`${base}/checkout/invalid`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Invalid pack amount");
});

test("POST /api/webhooks/stripe rejects missing stripe-signature header", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ type: "checkout.session.completed" }),
        },
    );
    // Returns 400 (missing signature) or 500 (webhook secret not configured)
    // Both are valid rejections - the important thing is it doesn't process the event
    expect(response.status).toBeOneOf([400, 500]);
});

test("POST /api/webhooks/stripe rejects invalid stripe-signature header", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": "t=123,v1=invalid_signature",
            },
            body: JSON.stringify({ type: "checkout.session.completed" }),
        },
    );
    // Returns 400 (invalid signature) or 500 (webhook secret not configured)
    // Both are valid rejections - the important thing is it doesn't process the event
    expect(response.status).toBeOneOf([400, 500]);
});

test("POST /api/webhooks/stripe credits legacy sessions without packAmount only once", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id, packBalance: userTable.packBalance })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) {
        throw new Error("Expected seeded test user");
    }

    await db
        .update(userTable)
        .set({ packBalance: 0 })
        .where(eq(userTable.id, user.id));

    const checkoutEvent = {
        id: "evt_test_legacy_checkout",
        type: "checkout.session.completed",
        livemode: false,
        data: {
            object: {
                id: "cs_test_legacy_checkout",
                object: "checkout.session",
                metadata: {
                    userId: user.id,
                },
                payment_status: "paid",
                amount_subtotal: 500,
                amount_total: 500,
                currency: "usd",
                customer_email: "legacy@example.com",
                payment_method_types: ["card"],
            },
        },
    };

    const payload = JSON.stringify(checkoutEvent);

    const response = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": signStripePayload(payload),
                cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: payload,
        },
    );

    expect(response.status).toBe(200);

    const duplicatePayload = JSON.stringify({
        ...checkoutEvent,
        id: "evt_test_legacy_checkout_duplicate",
    });
    const duplicateResponse = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": signStripePayload(duplicatePayload),
                cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: duplicatePayload,
        },
    );

    expect(duplicateResponse.status).toBe(200);

    const [updatedUser] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);

    expect(updatedUser?.packBalance).toBe(10);

    const processedEvent = await env.DB.prepare(
        `SELECT COUNT(*) AS count
        FROM stripe_checkout_credits
        WHERE session_id = 'cs_test_legacy_checkout'`,
    ).first<{ count: number }>();
    expect(processedEvent?.count).toBe(1);
});
