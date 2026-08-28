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

async function insertRedeemedGift({
    giftId,
    paymentIntentId,
    userId,
    pollenAmount,
}: {
    giftId: string;
    paymentIntentId: string;
    userId: string;
    pollenAmount: number;
}): Promise<number> {
    const faceValueCents = pollenAmount * 100;
    const serviceFeeCents = calculateServiceFeeCents(faceValueCents);
    const paidAmountCents = faceValueCents + serviceFeeCents;
    const now = Date.now();
    await env.DB.prepare(
        `INSERT INTO pollen_gift_code (
            id, code_hash, pollen_amount, face_value_cents, service_fee_cents,
            paid_amount_cents, paid_currency, status, stripe_checkout_session_id,
            stripe_payment_intent_id, redeemer_user_id, created_at, activated_at,
            redeemed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'usd', 'redeemed', ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            giftId,
            `hash_${giftId}`,
            pollenAmount,
            faceValueCents,
            serviceFeeCents,
            paidAmountCents,
            `cs_${giftId}`,
            paymentIntentId,
            userId,
            now,
            now,
            now,
        )
        .run();
    return paidAmountCents;
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
    expect(body["phone_number_collection[enabled]"]).toBe("true");
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
    expect(checkoutRequest.idempotencyKey).toBe(`pollen-gift:${giftId}`);

    expect(body["line_items[0][price_data][product_data][name]"]).not.toContain(
        code,
    );
    expect(body["invoice_creation[invoice_data][custom_fields][0][name]"]).toBe(
        "Gift code",
    );
    const metadataValues = Object.entries(body)
        .filter(([key]) => key.includes("metadata"))
        .map(([, value]) => value);
    expect(metadataValues).not.toContain(code);
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
            face_value_cents AS faceValueCents,
            service_fee_cents AS serviceFeeCents,
            stripe_checkout_session_id AS stripeCheckoutSessionId
         FROM pollen_gift_code
         WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            codeHash: string;
            status: string;
            pollenAmount: number;
            faceValueCents: number;
            serviceFeeCents: number;
            stripeCheckoutSessionId: string | null;
        }>();
    expect(storedGift).toMatchObject({
        status: "pending",
        pollenAmount: amount,
        faceValueCents: amount * 100,
        serviceFeeCents: calculateServiceFeeCents(amount * 100),
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

test("gift checkout blocks a buyer after four distinct failed cards", async ({
    mocks,
}) => {
    await mocks.enable("stripe");
    const buyerIp = "203.0.113.19";
    const buyerKey = await hashIp(buyerIp, env.BETTER_AUTH_SECRET);
    expect(buyerKey).toBeTruthy();
    if (!buyerKey) throw new Error("Expected hashed buyer key");

    await env.DB.batch(
        Array.from({ length: 4 }, (_, index) =>
            env.DB.prepare(
                `INSERT INTO stripe_gift_card_fingerprint_attempt (
                    event_id, buyer_key, card_fingerprint, created_at
                 ) VALUES (?, ?, ?, ?)`,
            ).bind(
                `evt_failed_${index}`,
                buyerKey,
                `fingerprint_${index}`,
                Date.now(),
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

test("paid gift activation is idempotent and redemption is authenticated and single-use", async ({
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
    mockSession.invoice = {
        id: "in_pollen_gift",
        object: "invoice",
        customer: null,
        status: "paid",
        amount_due: totalCents,
        amount_paid: totalCents,
        currency: "usd",
        metadata: {},
        custom_fields: [{ name: "Gift code", value: code }],
    };
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

    const firstWebhookResponse = await postSignedStripeWebhook(checkoutEvent);
    expect(firstWebhookResponse.status).toBe(200);
    const duplicateWebhookResponse = await postSignedStripeWebhook({
        ...checkoutEvent,
        id: "evt_pollen_gift_paid_retry",
    });
    expect(duplicateWebhookResponse.status).toBe(200);

    expect(mocks.tinybird.state.stripeEvents).toHaveLength(1);
    const analyticsEvent = mocks.tinybird.state.stripeEvents[0];
    expect(analyticsEvent?.customer_email).toBe("");
    expect(analyticsEvent?.user_id).toBe("");
    expect(analyticsEvent?.payload).not.toContain("gift-buyer@example.com");
    expect(JSON.parse(analyticsEvent?.payload ?? "{}")).toEqual({
        id: checkoutEvent.id,
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
            paid_amount_cents AS paidAmountCents,
            paid_currency AS paidCurrency,
            stripe_payment_intent_id AS stripePaymentIntentId
         FROM pollen_gift_code
         WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            status: string;
            paidAmountCents: number;
            paidCurrency: string;
            stripePaymentIntentId: string;
        }>();
    expect(activeGift).toEqual({
        status: "active",
        paidAmountCents: totalCents,
        paidCurrency: "usd",
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
});

test("a refund delivered before checkout fulfillment keeps the gift revoked", async ({
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    const amount = 20;
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
    const checkoutSessionId = mocks.stripe.state.checkoutSessions[0]?.id;
    if (!giftId || !checkoutSessionId) {
        throw new Error("Expected pending gift checkout");
    }

    const paymentIntentId = "pi_refund_before_fulfillment";
    mocks.stripe.state.paymentIntents.push({
        id: paymentIntentId,
        object: "payment_intent",
        status: "succeeded",
        metadata: { purpose: POLLEN_GIFT_PURPOSE, giftId },
    });
    const refundResponse = await postSignedStripeWebhook({
        id: "evt_refund_before_fulfillment",
        type: "refund.created",
        created: 100,
        livemode: false,
        data: {
            object: {
                id: "re_before_fulfillment",
                object: "refund",
                amount: 100,
                currency: "usd",
                status: "succeeded",
                payment_intent: paymentIntentId,
                metadata: {},
            },
        },
    });
    expect(refundResponse.status).toBe(200);

    const totalCents = amount * 100 + calculateServiceFeeCents(amount * 100);
    const fulfillmentResponse = await postSignedStripeWebhook({
        id: "evt_checkout_after_refund",
        type: "checkout.session.completed",
        created: 101,
        livemode: false,
        data: {
            object: {
                id: checkoutSessionId,
                object: "checkout.session",
                metadata: {
                    purpose: POLLEN_GIFT_PURPOSE,
                    giftId,
                    pollenAmount: String(amount),
                },
                payment_status: "paid",
                amount_total: totalCents,
                currency: "usd",
                payment_intent: paymentIntentId,
                invoice: "in_after_refund",
            },
        },
    });
    expect(fulfillmentResponse.status).toBe(200);

    const gift = await env.DB.prepare(
        `SELECT status, stripe_payment_intent_id AS stripePaymentIntentId
         FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{ status: string; stripePaymentIntentId: string }>();
    expect(gift).toEqual({
        status: "refunded",
        stripePaymentIntentId: paymentIntentId,
    });
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
        `SELECT status, invalidated_at AS invalidatedAt
         FROM pollen_gift_code
         WHERE id = ?`,
    )
        .bind(giftId)
        .first<{ status: string; invalidatedAt: number | null }>();
    expect(gift?.status).toBe("voided");
    expect(gift?.invalidatedAt).toBeTypeOf("number");
});

test("a full refund reverses redeemed Pollen exactly once", async ({
    mocks,
    sessionToken,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");
    await env.DB.prepare("UPDATE user SET pack_balance = 100 WHERE id = ?")
        .bind(user.id)
        .run();

    const giftId = "gift_refund_once";
    const paymentIntentId = "pi_gift_refund_once";
    const pollenAmount = 20;
    const paidAmountCents = await insertRedeemedGift({
        giftId,
        paymentIntentId,
        userId: user.id,
        pollenAmount,
    });
    const refund = {
        id: "re_gift_full",
        object: "refund",
        amount: paidAmountCents,
        currency: "usd",
        status: "succeeded",
        payment_intent: paymentIntentId,
        metadata: {},
    };

    for (const eventId of ["evt_gift_refund", "evt_gift_refund_retry"]) {
        const response = await postSignedStripeWebhook({
            id: eventId,
            type: "refund.created",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: refund },
        });
        expect(response.status).toBe(200);
    }

    const gift = await env.DB.prepare(
        `SELECT status, balance_reversed AS balanceReversed,
                refunded_amount_cents AS refundedAmountCents
         FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            status: string;
            balanceReversed: number;
            refundedAmountCents: number;
        }>();
    expect(gift).toEqual({
        status: "refunded",
        balanceReversed: 1,
        refundedAmountCents: paidAmountCents,
    });
    const balance = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(user.id)
        .first<{ packBalance: number }>();
    expect(balance?.packBalance).toBe(100 - pollenAmount);
});

test("a failed refund restores a redeemed gift and its Pollen", async ({
    mocks,
    sessionToken,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw new Error("Expected seeded test user");
    await env.DB.prepare("UPDATE user SET pack_balance = 100 WHERE id = ?")
        .bind(user.id)
        .run();

    const giftId = "gift_refund_failed";
    const paymentIntentId = "pi_gift_refund_failed";
    const pollenAmount = 20;
    const paidAmountCents = await insertRedeemedGift({
        giftId,
        paymentIntentId,
        userId: user.id,
        pollenAmount,
    });
    const refund = {
        id: "re_gift_failed",
        object: "refund",
        amount: paidAmountCents,
        currency: "usd",
        payment_intent: paymentIntentId,
        metadata: {},
    };

    const succeeded = await postSignedStripeWebhook({
        id: "evt_gift_refund_succeeded",
        type: "refund.created",
        created: 100,
        livemode: false,
        data: { object: { ...refund, status: "succeeded" } },
    });
    expect(succeeded.status).toBe(200);
    const failed = await postSignedStripeWebhook({
        id: "evt_gift_refund_failed",
        type: "refund.failed",
        created: 101,
        livemode: false,
        data: { object: { ...refund, status: "failed" } },
    });
    expect(failed.status).toBe(200);

    const gift = await env.DB.prepare(
        `SELECT status, balance_reversed AS balanceReversed,
                refunded_amount_cents AS refundedAmountCents
         FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            status: string;
            balanceReversed: number;
            refundedAmountCents: number;
        }>();
    expect(gift).toEqual({
        status: "redeemed",
        balanceReversed: 0,
        refundedAmountCents: 0,
    });
    const balance = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(user.id)
        .first<{ packBalance: number }>();
    expect(balance?.packBalance).toBe(100);
});

test("card-network inquiries do not revoke or debit a redeemed gift", async ({
    mocks,
    sessionToken,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");
    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    if (!user) throw new Error("Expected seeded test user");
    await env.DB.prepare("UPDATE user SET pack_balance = 100 WHERE id = ?")
        .bind(user.id)
        .run();

    const giftId = "gift_warning_inquiry";
    const paymentIntentId = "pi_gift_warning_inquiry";
    const amount = await insertRedeemedGift({
        giftId,
        paymentIntentId,
        userId: user.id,
        pollenAmount: 20,
    });
    const dispute = {
        id: "dp_gift_warning",
        object: "dispute",
        amount,
        currency: "usd",
        payment_intent: paymentIntentId,
    };

    for (const [type, status, created] of [
        ["charge.dispute.created", "warning_needs_response", 100],
        ["charge.dispute.closed", "warning_closed", 101],
    ] as const) {
        const response = await postSignedStripeWebhook({
            id: `evt_${status}`,
            type,
            created,
            livemode: false,
            data: { object: { ...dispute, status } },
        });
        expect(response.status).toBe(200);
    }

    const gift = await env.DB.prepare(
        `SELECT status, balance_reversed AS balanceReversed
         FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{ status: string; balanceReversed: number }>();
    expect(gift).toEqual({ status: "redeemed", balanceReversed: 0 });
    const balance = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(user.id)
        .first<{ packBalance: number }>();
    expect(balance?.packBalance).toBe(100);
});

test("a won dispute restores a redeemed gift balance exactly once", async ({
    mocks,
    sessionToken,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const user = await env.DB.prepare("SELECT id FROM user LIMIT 1").first<{
        id: string;
    }>();
    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");
    await env.DB.prepare("UPDATE user SET pack_balance = 100 WHERE id = ?")
        .bind(user.id)
        .run();

    const giftId = "gift_dispute_once";
    const paymentIntentId = "pi_gift_dispute_once";
    const pollenAmount = 20;
    const paidAmountCents = await insertRedeemedGift({
        giftId,
        paymentIntentId,
        userId: user.id,
        pollenAmount,
    });
    const dispute = {
        id: "dp_gift_won",
        object: "dispute",
        amount: paidAmountCents,
        currency: "usd",
        payment_intent: paymentIntentId,
    };

    for (const eventId of ["evt_gift_dispute", "evt_gift_dispute_retry"]) {
        const response = await postSignedStripeWebhook({
            id: eventId,
            type: "charge.dispute.created",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { ...dispute, status: "needs_response" } },
        });
        expect(response.status).toBe(200);
    }
    const disputedBalance = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(user.id)
        .first<{ packBalance: number }>();
    expect(disputedBalance?.packBalance).toBe(100 - pollenAmount);

    for (const eventId of [
        "evt_gift_dispute_won",
        "evt_gift_dispute_won_retry",
    ]) {
        const response = await postSignedStripeWebhook({
            id: eventId,
            type: "charge.dispute.closed",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { ...dispute, status: "won" } },
        });
        expect(response.status).toBe(200);
    }
    const staleCreatedResponse = await postSignedStripeWebhook({
        id: "evt_gift_dispute_created_stale",
        type: "charge.dispute.created",
        created: 1,
        livemode: false,
        data: { object: { ...dispute, status: "needs_response" } },
    });
    expect(staleCreatedResponse.status).toBe(200);

    const gift = await env.DB.prepare(
        `SELECT status, status_before_dispute AS statusBeforeDispute,
                balance_reversed AS balanceReversed
         FROM pollen_gift_code WHERE id = ?`,
    )
        .bind(giftId)
        .first<{
            status: string;
            statusBeforeDispute: string | null;
            balanceReversed: number;
        }>();
    expect(gift).toEqual({
        status: "redeemed",
        statusBeforeDispute: null,
        balanceReversed: 0,
    });
    const restoredBalance = await env.DB.prepare(
        "SELECT pack_balance AS packBalance FROM user WHERE id = ?",
    )
        .bind(user.id)
        .first<{ packBalance: number }>();
    expect(restoredBalance?.packBalance).toBe(100);
});
