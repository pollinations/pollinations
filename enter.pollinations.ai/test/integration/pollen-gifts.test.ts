import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { hashIp } from "@shared/client-ip.ts";
import {
    normalizePollenGiftCode,
    POLLEN_GIFT_AMOUNTS,
    POLLEN_GIFT_PURPOSE,
} from "@shared/pollen-gifts.ts";
import {
    calculateServiceFeeCents,
    SERVICE_FEE_NAME,
} from "@shared/pollen-packs.ts";
import { expect } from "vitest";
import { POLLEN_GIFT_BUYER_KEY_METADATA } from "../../src/utils/pollen-gift-security.ts";
import { STRIPE_NEW_CARD_GATE_METADATA } from "../../src/utils/stripe-card-gate.ts";
import { test } from "../fixtures.ts";

const giftBase = "http://localhost:3000/api/pollen-gifts";
const stripeWebhookUrl = "http://localhost:3000/api/webhooks/stripe";
const stripePmcId = "pmc_1SrYT96O03AauPe8ijLy6sZU";

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

test("anonymous gift checkout preserves the Stripe purchase contract", async ({
    mocks,
}) => {
    await mocks.enable("stripe");

    const amount = 20;
    const response = await SELF.fetch(`${giftBase}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
        url: "https://checkout.stripe.test/1",
    });

    const checkoutRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    );
    expect(checkoutRequest).toBeTruthy();
    const body = checkoutRequest?.body;
    if (!body || !checkoutRequest) {
        throw new Error("Expected Stripe Checkout request");
    }

    const giftId = body["metadata[giftId]"];
    const code =
        body["invoice_creation[invoice_data][custom_fields][0][value]"];
    expect(giftId).toBeTruthy();
    expect(code).toBeTruthy();
    expect(normalizePollenGiftCode(code ?? "")).not.toBeNull();

    expect(body.mode).toBe("payment");
    expect(body.payment_method_configuration).toBe(stripePmcId);
    expect(body.payment_method_types).toBeUndefined();
    expect(
        Object.keys(body).some((key) =>
            key.startsWith("payment_method_types["),
        ),
    ).toBe(false);
    expect(body.customer).toBeUndefined();
    expect(body.customer_email).toBeUndefined();
    expect(body.customer_creation).toBe("always");
    expect(body.billing_address_collection).toBe("required");
    expect(body["name_collection[individual][enabled]"]).toBe("true");
    expect(body["name_collection[individual][optional]"]).toBe("false");
    expect(body["phone_number_collection[enabled]"]).toBeUndefined();
    expect(body["automatic_tax[enabled]"]).toBe("true");
    expect(body["tax_id_collection[enabled]"]).toBe("true");
    expect(body["invoice_creation[enabled]"]).toBe("true");
    expect(body["adaptive_pricing[enabled]"]).toBe("true");

    expect(body["line_items[0][price_data][currency]"]).toBe("usd");
    expect(body["line_items[0][price_data][unit_amount]"]).toBe("2000");
    expect(body["line_items[0][price_data][tax_behavior]"]).toBe("exclusive");
    expect(body["line_items[1][price_data][currency]"]).toBe("usd");
    expect(body["line_items[1][price_data][unit_amount]"]).toBe(
        String(calculateServiceFeeCents(amount * 100)),
    );
    expect(body["line_items[1][price_data][product_data][name]"]).toBe(
        SERVICE_FEE_NAME,
    );

    expect(body.client_reference_id).toBe(giftId);
    expect(body["metadata[purpose]"]).toBe(POLLEN_GIFT_PURPOSE);
    expect(body["metadata[pollenAmount]"]).toBe(String(amount));
    expect(body["metadata[giftCode]"]).toBe(code);
    expect(body["metadata[packPollenGrant]"]).toBeUndefined();
    expect(body[`metadata[${POLLEN_GIFT_BUYER_KEY_METADATA}]`]).toBeTruthy();
    expect(body[`metadata[${STRIPE_NEW_CARD_GATE_METADATA.gate}]`]).toBe("ok");
    expect(body[`metadata[${STRIPE_NEW_CARD_GATE_METADATA.count24h}]`]).toBe(
        "0",
    );
    expect(body[`metadata[${STRIPE_NEW_CARD_GATE_METADATA.limit24h}]`]).toBe(
        "4",
    );
    expect(body["payment_intent_data[metadata][purpose]"]).toBe(
        POLLEN_GIFT_PURPOSE,
    );
    expect(body["payment_intent_data[metadata][giftId]"]).toBe(giftId);
    expect(body["payment_intent_data[metadata][giftCode]"]).toBeUndefined();
    expect(checkoutRequest.idempotencyKey).toBe(`pollen-gift:${giftId}`);

    expect(body["line_items[0][price_data][product_data][name]"]).not.toContain(
        code,
    );
    expect(body["invoice_creation[invoice_data][custom_fields][0][name]"]).toBe(
        "Gift code",
    );
    expect(body.success_url).not.toContain(code);
    expect(body.cancel_url).not.toContain(code);
    expect(body.success_url).toBe(
        "http://localhost:3000/pollen?mode=gift&success=true&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(body.cancel_url).toBe(
        "http://localhost:3000/pollen?mode=gift&canceled=true",
    );

    const storedGift = await env.DB.prepare(
        `SELECT
            code_hash AS codeHash,
            status,
            pollen_amount AS pollenAmount,
            stripe_checkout_session_id AS stripeCheckoutSessionId
         FROM pollen_gift_code
         WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            codeHash: string;
            status: string;
            pollenAmount: number;
            stripeCheckoutSessionId: string | null;
        }>();
    expect(storedGift).toMatchObject({
        status: "pending",
        pollenAmount: amount,
        stripeCheckoutSessionId: "cs_mock_1",
    });
    expect(storedGift?.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedGift?.codeHash).not.toBe(code);
});

test("gift checkout rejects invalid amounts before creating an order", async ({
    mocks,
}) => {
    await mocks.enable("stripe");

    for (const amount of [2, 6, 25, 101, 20.5, "20", null]) {
        const response = await SELF.fetch(`${giftBase}/checkout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount }),
        });
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: `Choose one of these gift amounts: ${POLLEN_GIFT_AMOUNTS.join(", ")} Pollen.`,
        });
    }

    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === "/v1/checkout/sessions",
        ),
    ).toBe(false);
    const count = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM pollen_gift_code",
    ).first<{ count: number }>();
    expect(count?.count).toBe(0);
});

test("gift receipt throttling ignores spoofed forwarding headers", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await SELF.fetch(
            `${giftBase}/receipt/cs_missing_${attempt}`,
            {
                headers: {
                    "x-forwarded-host": "enter.pollinations.ai",
                    "x-original-client-ip": `spoofed-${attempt}`,
                },
            },
        );
        expect(response.status).toBe(404);
    }

    const blocked = await SELF.fetch(`${giftBase}/receipt/cs_missing_blocked`, {
        headers: {
            "x-forwarded-host": "enter.pollinations.ai",
            "x-original-client-ip": "another-spoofed-value",
        },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
});

test("gift checkout blocks a buyer after four distinct failed cards", async ({
    mocks,
}) => {
    await mocks.enable("stripe");
    const buyerIp = "203.0.113.19";
    const buyerKey = await hashIp(buyerIp, env.BETTER_AUTH_SECRET);
    expect(buyerKey).toBeTruthy();
    if (!buyerKey) throw new Error("Expected hashed buyer key");

    await env.DB.prepare(
        `INSERT INTO pollen_gift_rate_limit (
            key, window_started_at, attempts
         ) VALUES (?, ?, ?)`,
    )
        .bind("stale-gift-limit", Date.now() - 11 * 60 * 1000, 1)
        .run();

    await env.DB.batch(
        Array.from({ length: 5 }, (_, index) =>
            env.DB.prepare(
                `INSERT INTO stripe_gift_card_fingerprint_attempt (
                    event_id, buyer_key, card_fingerprint, created_at
                 ) VALUES (?, ?, ?, ?)`,
            ).bind(
                `evt_failed_${index}`,
                buyerKey,
                `fingerprint_${index}`,
                index === 4 ? Date.now() - 25 * 60 * 60 * 1000 : Date.now(),
            ),
        ),
    );

    const response = await SELF.fetch(`${giftBase}/checkout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": buyerIp,
        },
        body: JSON.stringify({ amount: 20 }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("86400");
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === "/v1/checkout/sessions",
        ),
    ).toBe(false);
    const expiredRows = await env.DB.batch([
        env.DB.prepare(
            `SELECT COUNT(*) AS count
             FROM stripe_gift_card_fingerprint_attempt
             WHERE event_id = 'evt_failed_4'`,
        ),
        env.DB.prepare(
            `SELECT COUNT(*) AS count
             FROM pollen_gift_rate_limit
             WHERE key = 'stale-gift-limit'`,
        ),
    ]);
    expect(expiredRows.map((result) => result.results[0])).toEqual([
        { count: 0 },
        { count: 0 },
    ]);
});

test("failed gift card fingerprints are recorded against the anonymous buyer", async ({
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    const buyerKey = "hashed-anonymous-buyer";
    const paymentIntent = {
        id: "pi_failed_gift_card",
        object: "payment_intent" as const,
        status: "requires_payment_method",
        amount: 2_100,
        currency: "usd",
        metadata: {
            purpose: POLLEN_GIFT_PURPOSE,
            giftId: "gift_failed_card",
            [POLLEN_GIFT_BUYER_KEY_METADATA]: buyerKey,
        },
        payment_method_types: ["card"],
        latest_charge: {
            id: "ch_failed_gift_card",
            object: "charge",
            metadata: {},
            payment_method_details: {
                type: "card",
                card: {
                    fingerprint: "fp_failed_gift_card",
                    country: "US",
                    brand: "visa",
                    network: "visa",
                },
            },
            outcome: { risk_level: "elevated", risk_score: 72 },
        },
    };
    mocks.stripe.state.paymentIntents.push(paymentIntent);

    const response = await postSignedStripeWebhook({
        id: "evt_failed_gift_card",
        type: "payment_intent.payment_failed",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: { object: paymentIntent },
    });
    expect(response.status).toBe(200);

    const attempt = await env.DB.prepare(
        `SELECT buyer_key AS buyerKey, card_fingerprint AS cardFingerprint
         FROM stripe_gift_card_fingerprint_attempt
         WHERE event_id = ?`,
    )
        .bind("evt_failed_gift_card")
        .first<{ buyerKey: string; cardFingerprint: string }>();
    expect(attempt).toEqual({
        buyerKey,
        cardFingerprint: "fp_failed_gift_card",
    });
});

test("paid gift lifecycle is authenticated, single-use, and idempotent", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("stripe", "tinybird");

    const userBefore = await env.DB.prepare(
        "SELECT id, pack_balance AS packBalance FROM user LIMIT 1",
    ).first<{ id: string; packBalance: number }>();
    expect(userBefore).toBeTruthy();
    if (!userBefore) throw new Error("Expected seeded test user");

    const amount = 50;
    const checkoutResponse = await SELF.fetch(`${giftBase}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });
    expect(checkoutResponse.status).toBe(200);

    const checkoutRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    );
    const giftId = checkoutRequest?.body["metadata[giftId]"];
    const code =
        checkoutRequest?.body[
            "invoice_creation[invoice_data][custom_fields][0][value]"
        ];
    const checkoutSessionId = mocks.stripe.state.checkoutSessions[0]?.id;
    expect(giftId).toBeTruthy();
    expect(code).toBeTruthy();
    expect(checkoutSessionId).toBeTruthy();
    if (!giftId || !code || !checkoutSessionId) {
        throw new Error("Expected completed gift checkout setup");
    }

    const totalCents = amount * 100 + calculateServiceFeeCents(amount * 100);
    const unpaidReceipt = await SELF.fetch(
        `${giftBase}/receipt/${checkoutSessionId}`,
    );
    expect(unpaidReceipt.status).toBe(404);
    const mockSession = mocks.stripe.state.checkoutSessions[0];
    if (!mockSession) throw new Error("Expected mock Checkout Session");
    mockSession.payment_status = "paid";
    const paidReceipt = await SELF.fetch(
        `${giftBase}/receipt/${checkoutSessionId}`,
    );
    expect(paidReceipt.status).toBe(200);
    await expect(paidReceipt.json()).resolves.toEqual({
        code,
        pollenAmount: amount,
    });

    const checkoutEvent = {
        id: "evt_pollen_gift_paid",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
            object: {
                id: checkoutSessionId,
                object: "checkout.session",
                mode: "payment",
                metadata: {
                    purpose: POLLEN_GIFT_PURPOSE,
                    giftId,
                    pollenAmount: String(amount),
                    giftCode: code,
                },
                payment_status: "paid",
                amount_subtotal: totalCents,
                amount_total: totalCents,
                currency: "usd",
                customer: "cus_pollen_gift",
                customer_details: {
                    email: "gift-buyer@example.com",
                    phone: "+37255555555",
                    address: { country: "EE" },
                },
                payment_intent: "pi_pollen_gift",
                invoice: "in_pollen_gift",
                payment_method_types: ["card"],
            },
        },
    };

    const [firstWebhookResponse, duplicateWebhookResponse] = await Promise.all([
        postSignedStripeWebhook(checkoutEvent),
        postSignedStripeWebhook({
            ...checkoutEvent,
            id: "evt_pollen_gift_paid_retry",
        }),
    ]);
    expect(firstWebhookResponse.status).toBe(200);
    expect(duplicateWebhookResponse.status).toBe(200);

    expect(mocks.tinybird.state.stripeEvents).toHaveLength(1);
    const analyticsEvent = mocks.tinybird.state.stripeEvents[0];
    expect(analyticsEvent?.customer_email).toBe("");
    expect(analyticsEvent?.user_id).toBe("");
    const analyticsPayload = analyticsEvent?.payload;
    expect(analyticsPayload).toBeTypeOf("string");
    if (typeof analyticsPayload !== "string") {
        throw new Error("Expected serialized Stripe analytics payload");
    }
    expect(analyticsPayload).not.toContain("gift-buyer@example.com");
    expect(analyticsPayload).not.toContain(code);
    expect(JSON.parse(analyticsPayload)).toEqual({
        id: expect.stringMatching(/^evt_pollen_gift_paid(?:_retry)?$/),
        type: checkoutEvent.type,
        created: checkoutEvent.created,
        livemode: false,
        data: {
            object: {
                metadata: {
                    purpose: POLLEN_GIFT_PURPOSE,
                    pollenAmount: String(amount),
                },
            },
        },
    });

    const activeGift = await env.DB.prepare(
        `SELECT
            status,
            stripe_payment_intent_id AS stripePaymentIntentId
         FROM pollen_gift_code
         WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            status: string;
            stripePaymentIntentId: string;
        }>();
    expect(activeGift).toEqual({
        status: "active",
        stripePaymentIntentId: "pi_pollen_gift",
    });

    const userAfterPayment = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(userBefore.id)
        .first<{ packBalance: number }>();
    expect(userAfterPayment?.packBalance).toBe(userBefore.packBalance);
    const directCreditCount = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM stripe_checkout_credits WHERE session_id = ?",
    )
        .bind(checkoutSessionId)
        .first<{ count: number }>();
    expect(directCreditCount?.count).toBe(0);

    const anonymousRedeemResponse = await SELF.fetch(`${giftBase}/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });
    expect(anonymousRedeemResponse.status).toBe(401);

    const redeemResponse = await SELF.fetch(`${giftBase}/redeem`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ code: code.toLowerCase() }),
    });
    expect(redeemResponse.status).toBe(200);
    expect(redeemResponse.headers.get("Cache-Control")).toBe("no-store");
    await expect(redeemResponse.json()).resolves.toEqual({
        redeemed: true,
        pollenAdded: amount,
        newBalance: userBefore.packBalance + amount,
    });

    const secondRedeemResponse = await SELF.fetch(`${giftBase}/redeem`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ code }),
    });
    expect(secondRedeemResponse.status).toBe(400);
    await expect(secondRedeemResponse.json()).resolves.toEqual({
        error: "This gift code is invalid or unavailable.",
    });

    const finalUser = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(userBefore.id)
        .first<{ packBalance: number }>();
    expect(finalUser?.packBalance).toBe(userBefore.packBalance + amount);
    const redeemedGift = await env.DB.prepare(
        `SELECT status, redeemer_user_id AS redeemerUserId
         FROM pollen_gift_code
         WHERE id = ?`,
    )
        .bind(giftId)
        .first<{ status: string; redeemerUserId: string }>();
    expect(redeemedGift).toEqual({
        status: "redeemed",
        redeemerUserId: userBefore.id,
    });

    const refundEvent = {
        id: "evt_pollen_gift_refund",
        type: "refund.created",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
            object: {
                id: "re_pollen_gift",
                object: "refund",
                amount: totalCents,
                currency: "usd",
                status: "succeeded",
                payment_intent: "pi_pollen_gift",
                metadata: {},
            },
        },
    };
    for (const event of [
        refundEvent,
        { ...refundEvent, id: "evt_pollen_gift_refund_retry" },
    ]) {
        const response = await postSignedStripeWebhook(event);
        expect(response.status).toBe(200);
    }

    const refundedGift = await env.DB.prepare(
        "SELECT status FROM pollen_gift_code WHERE id = ?",
    )
        .bind(giftId)
        .first<{ status: string }>();
    expect(refundedGift?.status).toBe("voided");
    const userAfterRefund = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(userBefore.id)
        .first<{ packBalance: number }>();
    expect(userAfterRefund?.packBalance).toBe(userBefore.packBalance ?? 0);
});

test("refund before checkout completion keeps the gift voided", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");

    const giftId = "gift_refunded_before_completion";
    const checkoutSessionId = "cs_refunded_before_completion";
    const paymentIntentId = "pi_refunded_before_completion";
    await env.DB.prepare(
        `INSERT INTO pollen_gift_code (
            id, code_hash, pollen_amount, status, stripe_checkout_session_id
         ) VALUES (?, ?, 20, 'pending', ?)`,
    )
        .bind(giftId, "a".repeat(64), checkoutSessionId)
        .run();

    const refundResponse = await postSignedStripeWebhook({
        id: "evt_refund_before_completion",
        type: "refund.created",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
            object: {
                id: "re_before_completion",
                object: "refund",
                amount: 2_000,
                currency: "usd",
                status: "succeeded",
                payment_intent: paymentIntentId,
                metadata: {},
            },
        },
    });
    expect(refundResponse.status).toBe(200);

    const checkoutResponse = await postSignedStripeWebhook({
        id: "evt_checkout_after_refund",
        type: "checkout.session.completed",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
            object: {
                id: checkoutSessionId,
                object: "checkout.session",
                mode: "payment",
                metadata: {
                    purpose: POLLEN_GIFT_PURPOSE,
                    giftId,
                    pollenAmount: "20",
                },
                payment_status: "paid",
                amount_total: 2_000,
                currency: "usd",
                payment_intent: paymentIntentId,
                payment_method_types: ["card"],
            },
        },
    });
    expect(checkoutResponse.status).toBe(200);

    const gift = await env.DB.prepare(
        `SELECT status, stripe_payment_intent_id AS paymentIntentId
         FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{ status: string; paymentIntentId: string }>();
    expect(gift).toEqual({ status: "voided", paymentIntentId });
});

test("expired Checkout Session voids a pending gift", async ({ mocks }) => {
    await mocks.enable("stripe", "tinybird");

    const checkoutResponse = await SELF.fetch(`${giftBase}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 20 }),
    });
    expect(checkoutResponse.status).toBe(200);

    const checkoutRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    );
    const giftId = checkoutRequest?.body["metadata[giftId]"];
    const checkoutSessionId = mocks.stripe.state.checkoutSessions[0]?.id;
    expect(giftId).toBeTruthy();
    expect(checkoutSessionId).toBeTruthy();
    if (!giftId || !checkoutSessionId) {
        throw new Error("Expected pending gift checkout");
    }

    const webhookResponse = await postSignedStripeWebhook({
        id: "evt_pollen_gift_expired",
        type: "checkout.session.expired",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: {
            object: {
                id: checkoutSessionId,
                object: "checkout.session",
                metadata: {
                    purpose: POLLEN_GIFT_PURPOSE,
                    giftId,
                },
                payment_status: "unpaid",
                currency: "usd",
            },
        },
    });
    expect(webhookResponse.status).toBe(200);

    const gift = await env.DB.prepare(
        `SELECT status FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{ status: string }>();
    expect(gift?.status).toBe("voided");
});
