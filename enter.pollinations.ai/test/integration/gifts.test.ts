import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getPollenPackByKey } from "@shared/pollen-packs.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

const base = "http://localhost:3000/api/gifts";
const stripeWebhookUrl = "http://localhost:3000/api/webhooks/stripe";

function signStripeWebhookPayload(payload: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");
    return `t=${timestamp},v1=${signature}`;
}

async function postSignedStripeWebhook(
    payloadObject: Record<string, unknown>,
): Promise<Response> {
    const payload = JSON.stringify(payloadObject);
    return SELF.fetch(stripeWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "stripe-signature": signStripeWebhookPayload(payload),
        },
        body: payload,
    });
}

async function getSeededUserId(): Promise<string> {
    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");
    return user.id;
}

async function insertRecipient({
    id,
    githubUsername,
    name = id,
    image = null,
    packBalance = 0,
}: {
    id: string;
    githubUsername: string;
    name?: string;
    image?: string | null;
    packBalance?: number;
}) {
    const db = drizzle(env.DB);
    await db.insert(userTable).values({
        id,
        email: `${id}@test.com`,
        name,
        githubUsername,
        image,
        tier: "seed",
        packBalance,
        createdAt: new Date(),
    });
}

function checkoutSessionEvent({
    eventId,
    sessionId,
    metadata,
    amountUsd,
    type = "checkout.session.completed",
}: {
    eventId: string;
    sessionId: string;
    metadata: Record<string, string>;
    amountUsd: number;
    type?: string;
}) {
    return {
        id: eventId,
        type,
        livemode: false,
        data: {
            object: {
                id: sessionId,
                object: "checkout.session",
                metadata,
                payment_status: "paid",
                amount_subtotal: amountUsd * 100,
                amount_total: amountUsd * 100,
                currency: "usd",
                customer_email: "buyer@example.com",
                payment_method_types: ["card"],
            },
        },
    };
}

// --- Lookup endpoint ---

test("GET /api/gifts/lookup/:githubUsername requires authentication", async () => {
    const response = await SELF.fetch(`${base}/lookup/someone`, {
        method: "GET",
    });
    expect(response.status).toBe(401);
});

test("GET /api/gifts/lookup/:githubUsername returns 404 for unknown username", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    const response = await SELF.fetch(`${base}/lookup/no-such-user`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe(
        "No Pollinations account found for that GitHub username",
    );
});

test("GET /api/gifts/lookup/:githubUsername returns 400 for self-lookup", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    // The seeded test user signs in via the GitHub mock with login "testuser".
    const response = await SELF.fetch(`${base}/lookup/testuser`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("You can't gift Pollen to yourself");
});

test("GET /api/gifts/lookup/:githubUsername returns recipient profile without leaking userId", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    await insertRecipient({
        id: "recipient-lookup",
        githubUsername: "octocat-gift",
        name: "Octocat",
        image: "https://avatars.example/octocat.png",
    });

    const response = await SELF.fetch(`${base}/lookup/octocat-gift`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
        name: "Octocat",
        image: "https://avatars.example/octocat.png",
        githubUsername: "octocat-gift",
    });
});

test("GET /api/gifts/lookup/:githubUsername matches regardless of case", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    await insertRecipient({
        id: "recipient-case",
        githubUsername: "OctoCat-Case",
        name: "Octocat",
    });

    const response = await SELF.fetch(`${base}/lookup/octocat-case`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
        name: "Octocat",
        image: null,
        githubUsername: "OctoCat-Case",
    });
});

// --- Checkout endpoint ---

test("GET /api/gifts/checkout/:packKey/:githubUsername returns 400 for invalid pack", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    await insertRecipient({
        id: "recipient-invalid-pack",
        githubUsername: "recipient-invalid-pack",
    });

    const response = await SELF.fetch(
        `${base}/checkout/invalid/recipient-invalid-pack`,
        {
            method: "GET",
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Invalid pack");
});

test("GET /api/gifts/checkout/:packKey/:githubUsername returns 404 for unknown recipient", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    const response = await SELF.fetch(`${base}/checkout/p10/no-such-user`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
        redirect: "manual",
    });
    expect(response.status).toBe(404);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Recipient not found");
});

test("GET /api/gifts/checkout/:packKey/:githubUsername returns 400 for self-gift", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    const response = await SELF.fetch(`${base}/checkout/p10/testuser`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
        redirect: "manual",
    });
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("You can't gift Pollen to yourself");
});

test("GET /api/gifts/checkout/:packKey/:githubUsername creates a Stripe session with gift metadata", async ({
    sessionToken,
    mocks,
}) => {
    const pack = getPollenPackByKey("p10");
    expect(pack).toBeDefined();
    await mocks.enable("stripe", "tinybird");

    const senderId = await getSeededUserId();
    await insertRecipient({
        id: "recipient-checkout",
        githubUsername: "recipient-checkout",
        name: "Recipient",
    });

    const response = await SELF.fetch(
        `${base}/checkout/${pack?.packKey}/recipient-checkout`,
        {
            method: "GET",
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
            redirect: "manual",
        },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("checkout.stripe.test");

    const body = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    )?.body;
    expect(body).toBeTruthy();

    expect(body?.["metadata[type]"]).toBe("gift");
    expect(body?.["metadata[userId]"]).toBe(senderId);
    expect(body?.["metadata[senderUserId]"]).toBe(senderId);
    expect(body?.["metadata[recipientUserId]"]).toBe("recipient-checkout");
    expect(body?.["metadata[recipientGithubUsername]"]).toBe(
        "recipient-checkout",
    );
    expect(body?.["metadata[packKey]"]).toBe(pack?.packKey);
    expect(body?.["line_items[0][price_data][product_data][name]"]).toContain(
        "@recipient-checkout",
    );
    expect(body?.["customer_update[address]"]).toBe("auto");
    expect(body?.["payment_intent_data[metadata][senderUserId]"]).toBe(
        senderId,
    );
});

// --- Webhook credit branch ---

test("POST /api/webhooks/stripe credits the recipient's pack_balance on gift checkout, not the sender's", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const senderId = await getSeededUserId();
    await insertRecipient({
        id: "recipient-webhook-credit",
        githubUsername: "recipient-webhook-credit",
        packBalance: 2,
    });

    const response = await postSignedStripeWebhook(
        checkoutSessionEvent({
            eventId: "evt_gift_credit",
            sessionId: "cs_gift_credit",
            amountUsd: 10,
            metadata: {
                type: "gift",
                userId: senderId,
                senderUserId: senderId,
                recipientUserId: "recipient-webhook-credit",
                recipientGithubUsername: "recipient-webhook-credit",
                packKey: "p10",
            },
        }),
    );
    expect(response.status).toBe(200);

    const db = drizzle(env.DB);
    const [sender] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, senderId))
        .limit(1);
    const [recipient] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, "recipient-webhook-credit"))
        .limit(1);

    expect(recipient?.packBalance).toBe(12);
    expect(sender?.packBalance ?? 0).toBe(0);

    const giftCredit = await env.DB.prepare(
        `SELECT sender_user_id AS senderUserId, recipient_user_id AS recipientUserId, pollen_credited AS pollenCredited
        FROM stripe_gift_credits
        WHERE session_id = 'cs_gift_credit'`,
    ).first<{
        senderUserId: string;
        recipientUserId: string;
        pollenCredited: number;
    }>();
    expect(giftCredit).toMatchObject({
        senderUserId: senderId,
        recipientUserId: "recipient-webhook-credit",
        pollenCredited: 10,
    });
});

test("POST /api/webhooks/stripe gift credit is idempotent on replay", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const senderId = await getSeededUserId();
    await insertRecipient({
        id: "recipient-webhook-replay",
        githubUsername: "recipient-webhook-replay",
        packBalance: 0,
    });

    const event = checkoutSessionEvent({
        eventId: "evt_gift_replay",
        sessionId: "cs_gift_replay",
        amountUsd: 5,
        metadata: {
            type: "gift",
            userId: senderId,
            senderUserId: senderId,
            recipientUserId: "recipient-webhook-replay",
            recipientGithubUsername: "recipient-webhook-replay",
            packKey: "p5",
        },
    });

    const first = await postSignedStripeWebhook(event);
    expect(first.status).toBe(200);
    const second = await postSignedStripeWebhook(event);
    expect(second.status).toBe(200);

    const db = drizzle(env.DB);
    const [recipient] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, "recipient-webhook-replay"))
        .limit(1);
    expect(recipient?.packBalance).toBe(5);
});

test("POST /api/webhooks/stripe credits a gift on checkout.session.async_payment_succeeded too", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const senderId = await getSeededUserId();
    await insertRecipient({
        id: "recipient-webhook-async",
        githubUsername: "recipient-webhook-async",
        packBalance: 0,
    });

    const response = await postSignedStripeWebhook(
        checkoutSessionEvent({
            eventId: "evt_gift_async",
            sessionId: "cs_gift_async",
            amountUsd: 5,
            type: "checkout.session.async_payment_succeeded",
            metadata: {
                type: "gift",
                userId: senderId,
                senderUserId: senderId,
                recipientUserId: "recipient-webhook-async",
                recipientGithubUsername: "recipient-webhook-async",
                packKey: "p5",
            },
        }),
    );
    expect(response.status).toBe(200);

    const db = drizzle(env.DB);
    const [recipient] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, "recipient-webhook-async"))
        .limit(1);
    expect(recipient?.packBalance).toBe(5);
});

test("POST /api/webhooks/stripe non-gift checkout still credits the payer as before (regression)", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const userId = await getSeededUserId();

    const response = await postSignedStripeWebhook(
        checkoutSessionEvent({
            eventId: "evt_regular_topup",
            sessionId: "cs_regular_topup",
            amountUsd: 10,
            metadata: { userId, packKey: "p10" },
        }),
    );
    expect(response.status).toBe(200);

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);
    expect(user?.packBalance).toBe(10);
});
