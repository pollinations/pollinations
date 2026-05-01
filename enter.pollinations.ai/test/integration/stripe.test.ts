import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "../fixtures.ts";
import { mockCardPaymentMethod, mockCustomer } from "../mocks/stripe.ts";

const base = "http://localhost:3000/api/stripe";
const stripeWebhookUrl = "http://localhost:3000/api/webhooks/stripe";
const checkoutAmounts = [
    "/checkout/2",
    "/checkout/5",
    "/checkout/10",
    "/checkout/20",
    "/checkout/50",
    "/checkout/100",
];

function signStripeWebhookPayload(payload: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");
    return `t=${timestamp},v1=${signature}`;
}

function createAutoTopUpInvoiceEvent(
    type:
        | "invoice.paid"
        | "invoice.payment_failed"
        | "invoice.payment_action_required",
    invoiceId: string,
    userId: string,
    invoiceOverrides: Record<string, unknown> = {},
) {
    return {
        id: `evt_${type.replaceAll(".", "_")}_${invoiceId}`,
        type,
        livemode: false,
        data: {
            object: {
                id: invoiceId,
                object: "invoice",
                customer: "cus_webhook",
                status: type === "invoice.paid" ? "paid" : "open",
                amount_due: 1000,
                amount_paid: type === "invoice.paid" ? 1000 : 0,
                currency: "usd",
                metadata: {
                    pollinations_user_id: userId,
                    pollinations_purpose: "auto_top_up",
                    packAmount: "10",
                },
                ...invoiceOverrides,
            },
        },
    };
}

async function postSignedStripeWebhook(
    payloadObject: Record<string, unknown>,
    sessionToken?: string,
): Promise<Response> {
    const payload = JSON.stringify(payloadObject);
    return SELF.fetch(stripeWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "stripe-signature": signStripeWebhookPayload(payload),
            ...(sessionToken
                ? { cookie: `better-auth.session_token=${sessionToken}` }
                : {}),
        },
        body: payload,
    });
}

test.for(
    checkoutAmounts,
)("%s should only be accessible when authenticated via session cookie", async (route, {
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
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
        2.5, 7, 15, 30, 80, 200,
    ]);
});

test("GET /api/stripe/checkout/invalid returns 400 for invalid amount", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird");
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

test("GET /api/stripe/checkout/:amount reuses the stable Stripe customer", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const response = await SELF.fetch(`${base}/checkout/10`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("checkout.stripe.test");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({
            id: userTable.id,
            stripeCustomerId: userTable.stripeCustomerId,
        })
        .from(userTable)
        .limit(1);

    expect(user?.stripeCustomerId).toBe("cus_mock_1");
    const checkoutRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    );
    expect(checkoutRequest?.body.customer).toBe("cus_mock_1");
    expect(checkoutRequest?.body["customer_update[address]"]).toBe("auto");
});

test("POST /api/stripe/billing/portal creates a Stripe Portal session", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const response = await SELF.fetch(`${base}/billing/portal`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ flow: "payment_method_update" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { url: string };
    expect(data.url).toContain("billing.stripe.test");

    const portalRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/billing_portal/sessions",
    );
    expect(portalRequest?.body.customer).toBe("cus_mock_1");
    expect(portalRequest?.body.configuration).toBe("bpc_mock_1");
    expect(portalRequest?.body["flow_data[type]"]).toBe(
        "payment_method_update",
    );

    const portalConfiguration = mocks.stripe.state.portalConfigurations[0];
    expect(portalConfiguration).toMatchObject({
        id: "bpc_mock_1",
        metadata: {
            pollinations_portal: "billing_details_v1",
        },
        business_profile: {
            headline:
                "Manage your payment methods, billing details, and invoices.",
        },
        features: {
            customer_update: {
                enabled: true,
                allowed_updates: ["name", "address", "tax_id"],
            },
            invoice_history: {
                enabled: true,
            },
            payment_method_update: {
                enabled: true,
            },
        },
    });
});

test("POST /api/stripe/billing/portal updates existing Stripe Portal headline", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    mocks.stripe.state.portalConfigurations.push({
        id: "bpc_existing",
        object: "billing_portal.configuration",
        active: true,
        is_default: false,
        metadata: {
            pollinations_portal: "billing_details_v1",
        },
        name: "Pollinations Billing Portal",
        default_return_url: null,
        business_profile: {
            headline: null,
        },
        features: {
            customer_update: {
                enabled: true,
                allowed_updates: ["name", "address", "tax_id"],
            },
            invoice_history: {
                enabled: true,
            },
            payment_method_update: {
                enabled: true,
            },
        },
    });

    const response = await SELF.fetch(`${base}/billing/portal`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ flow: "default" }),
    });

    expect(response.status).toBe(200);
    const portalRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/billing_portal/sessions",
    );
    expect(portalRequest?.body.configuration).toBe("bpc_existing");

    const updateRequest = mocks.stripe.state.requests.find(
        (request) =>
            request.path === "/v1/billing_portal/configurations/bpc_existing",
    );
    expect(updateRequest?.body["business_profile[headline]"]).toBe(
        "Manage your payment methods, billing details, and invoices.",
    );
    expect(mocks.stripe.state.portalConfigurations[0].business_profile).toEqual(
        {
            headline:
                "Manage your payment methods, billing details, and invoices.",
        },
    );
});

test("GET /api/stripe/billing returns default card billing address", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_billing_details");
    customer.business_name = "Analytical Engines Ltd";
    customer.name = null;
    customer.email = null;
    customer.address = null;
    customer.invoice_settings.default_payment_method = "pm_billing_details";

    const paymentMethod = mockCardPaymentMethod(
        "pm_billing_details",
        customer.id,
    );
    paymentMethod.billing_details = {
        name: "Ada Lovelace",
        email: "ada@example.com",
        address: {
            line1: "123 Engine Way",
            line2: "Suite 4",
            city: "London",
            state: null,
            postal_code: "EC1A 1BB",
            country: "GB",
        },
    };

    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(paymentMethod);

    await db
        .update(userTable)
        .set({ stripeCustomerId: customer.id })
        .where(eq(userTable.id, user.id));

    const response = await SELF.fetch(`${base}/billing`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        paymentMethod: { hasDefault: boolean };
        billingDetails: {
            name: string | null;
            email: string | null;
            line1: string | null;
            line2: string | null;
            city: string | null;
            state: string | null;
            postalCode: string | null;
            country: string | null;
        } | null;
    };
    expect(data.paymentMethod.hasDefault).toBe(true);
    expect(data.billingDetails).toEqual({
        name: "Analytical Engines Ltd",
        email: "ada@example.com",
        line1: "123 Engine Way",
        line2: "Suite 4",
        city: "London",
        state: null,
        postalCode: "EC1A 1BB",
        country: "GB",
    });
});

test("GET /api/stripe/billing disables auto top-up when default card is removed", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_missing_default_card");
    mocks.stripe.state.customers.push(customer);

    await db
        .update(userTable)
        .set({
            stripeCustomerId: customer.id,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
            autoTopUpLastFailure: "Previous failure",
        })
        .where(eq(userTable.id, user.id));

    const response = await SELF.fetch(`${base}/billing`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        autoTopUp: { enabled: boolean; lastFailure: string | null };
        paymentMethod: { hasDefault: boolean };
        billingDetailsComplete: boolean;
    };
    expect(data.autoTopUp.enabled).toBe(false);
    expect(data.autoTopUp.lastFailure).toMatch(/payment method/i);
    expect(data.paymentMethod.hasDefault).toBe(false);
    expect(data.billingDetailsComplete).toBe(true);

    const [updatedUser] = await db
        .select({ autoTopUpEnabled: userTable.autoTopUpEnabled })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(false);
});

test("GET /api/stripe/billing disables auto top-up when billing address is missing", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_missing_billing_address");
    customer.address = null;
    customer.invoice_settings.default_payment_method = "pm_missing_address";

    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_missing_address", customer.id),
    );

    await db
        .update(userTable)
        .set({
            stripeCustomerId: customer.id,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
            autoTopUpLastFailure: "Previous failure",
        })
        .where(eq(userTable.id, user.id));

    const response = await SELF.fetch(`${base}/billing`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        autoTopUp: { enabled: boolean; lastFailure: string | null };
        paymentMethod: { hasDefault: boolean };
        billingDetailsComplete: boolean;
    };
    expect(data.autoTopUp.enabled).toBe(false);
    expect(data.autoTopUp.lastFailure).toMatch(/billing details/i);
    expect(data.paymentMethod.hasDefault).toBe(true);
    expect(data.billingDetailsComplete).toBe(false);

    const [updatedUser] = await db
        .select({ autoTopUpEnabled: userTable.autoTopUpEnabled })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(false);
});

test("PATCH /api/stripe/auto-top-up uses fixed threshold and rejects invalid pack values", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const customThresholdResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            enabled: false,
            thresholdPollen: 37,
            packAmountUsd: 10,
        }),
    });

    expect(customThresholdResponse.status).toBe(200);
    const customThresholdData = (await customThresholdResponse.json()) as {
        autoTopUp: { thresholdPollen: number; packAmountUsd: number };
    };
    expect(customThresholdData.autoTopUp.thresholdPollen).toBe(5);
    expect(customThresholdData.autoTopUp.packAmountUsd).toBe(10);

    const unsupportedPackResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            enabled: false,
            packAmountUsd: 5,
        }),
    });

    expect(unsupportedPackResponse.status).toBe(400);
    const unsupportedPackData = (await unsupportedPackResponse.json()) as {
        error: string;
    };
    expect(unsupportedPackData.error).toBe("Invalid auto top-up pack amount.");
});

test("PATCH /api/stripe/auto-top-up requires a default card before enabling", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const response = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            enabled: true,
            packAmountUsd: 10,
        }),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("default payment method");
});

test("PATCH /api/stripe/auto-top-up does not charge immediately when balance is below threshold", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_enable_only");
    customer.invoice_settings.default_payment_method = "pm_card";
    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_card", customer.id),
    );

    await db
        .update(userTable)
        .set({
            packBalance: 1,
            stripeCustomerId: customer.id,
            autoTopUpEnabled: false,
            autoTopUpAmountUsd: 100,
        })
        .where(eq(userTable.id, user.id));

    const response = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            enabled: true,
            packAmountUsd: 100,
        }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        autoTopUp: { enabled: boolean; packAmountUsd: number };
    };
    expect(data.autoTopUp.enabled).toBe(true);
    expect(data.autoTopUp.packAmountUsd).toBe(100);

    expect(mocks.stripe.state.invoices).toHaveLength(0);
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === "/v1/invoices",
        ),
    ).toBe(false);

    const [updatedUser] = await db
        .select({
            packBalance: userTable.packBalance,
            autoTopUpEnabled: userTable.autoTopUpEnabled,
        })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.packBalance).toBe(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(true);
});

test("POST /api/stripe/auto-top-up/trigger charges default card and credits pollen", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up");
    customer.invoice_settings.default_payment_method = "pm_card";
    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_card", customer.id),
    );

    await db
        .update(userTable)
        .set({
            packBalance: 1,
            stripeCustomerId: customer.id,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
        })
        .where(eq(userTable.id, user.id));

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ userId: user.id }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        status: string;
        pollenCredited?: number;
    };
    expect(data.status).toBe("credited");
    expect(data.pollenCredited).toBe(15);

    const [updatedUser] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.packBalance).toBe(16);

    const invoiceRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/invoices",
    );
    expect(invoiceRequest?.body.customer).toBe(customer.id);
    expect(invoiceRequest?.body["metadata[pollinations_purpose]"]).toBe(
        "auto_top_up",
    );
});

test("POST /api/stripe/auto-top-up/trigger disables auto top-up when setup is incomplete", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_missing_card");
    mocks.stripe.state.customers.push(customer);

    await db
        .update(userTable)
        .set({
            packBalance: 1,
            stripeCustomerId: customer.id,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
        })
        .where(eq(userTable.id, user.id));

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ userId: user.id }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        status: string;
        reason?: string;
    };
    expect(data).toMatchObject({
        status: "skipped",
        reason: "missing default payment method",
    });

    const [updatedUser] = await db
        .select({ autoTopUpEnabled: userTable.autoTopUpEnabled })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(false);
});

test("POST /api/stripe/auto-top-up/trigger skips during failure cooldown", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "polar", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_cooldown");
    customer.invoice_settings.default_payment_method = "pm_card";
    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_card", customer.id),
    );

    await env.DB.prepare(
        `UPDATE user
            SET pack_balance = 1,
                stripe_customer_id = ?,
                auto_top_up_enabled = 1,
                auto_top_up_amount_usd = 10,
                auto_top_up_last_failure = ?,
                auto_top_up_last_failure_at = ?
            WHERE id = ?`,
    )
        .bind(customer.id, "Previous payment failure", Date.now(), user.id)
        .run();

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({ userId: user.id }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        status: string;
        reason?: string;
    };
    expect(data.status).toBe("skipped");
    expect(data.reason).toContain("failure cooldown");
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === "/v1/invoices",
        ),
    ).toBe(false);
});

test("POST /api/webhooks/stripe does not let payment_failed reopen a paid auto top-up invoice", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const invoiceId = "in_paid_then_failed";
    const now = Date.now();
    await env.DB.prepare(
        `UPDATE user
            SET pack_balance = 16,
                auto_top_up_enabled = 1,
                auto_top_up_amount_usd = 10
            WHERE id = ?`,
    )
        .bind(user.id)
        .run();
    await env.DB.prepare(
        `INSERT INTO stripe_auto_top_up_attempt (
            id,
            user_id,
            stripe_invoice_id,
            amount_usd,
            pollen_grant,
            status,
            created_at,
            updated_at,
            completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            "attempt_paid_then_failed",
            user.id,
            invoiceId,
            10,
            15,
            "paid",
            now,
            now,
            now,
        )
        .run();

    const paymentFailedResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            invoiceId,
            user.id,
        ),
        sessionToken,
    );
    expect(paymentFailedResponse.status).toBe(200);

    const paidRedeliveryResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
        sessionToken,
    );
    expect(paidRedeliveryResponse.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance,
            auto_top_up_last_failure AS autoTopUpLastFailure
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            packBalance: number | null;
            autoTopUpLastFailure: string | null;
        }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.packBalance).toBe(16);
    expect(updatedUser?.autoTopUpLastFailure).toBeNull();
    expect(attempt?.status).toBe("paid");
    expect(attempt?.failureReason).toBeNull();
});

test("POST /api/webhooks/stripe records payment-action-required invoice links", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    const hostedInvoiceUrl = "https://invoice.stripe.test/in_action_required";
    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_action_required",
            "in_action_required",
            user.id,
            { hosted_invoice_url: hostedInvoiceUrl },
        ),
        sessionToken,
    );

    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_last_failure AS autoTopUpLastFailure
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ autoTopUpLastFailure: string | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind("in_action_required")
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.autoTopUpLastFailure).toContain(hostedInvoiceUrl);
    expect(attempt?.status).toBe("requires_action");
    expect(attempt?.failureReason).toContain(hostedInvoiceUrl);
});

test("POST /api/webhooks/stripe does not disable auto top-up after repeated SCA prompts", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    for (const invoiceId of [
        "in_sca_repeat_1",
        "in_sca_repeat_2",
        "in_sca_repeat_3",
    ]) {
        const response = await postSignedStripeWebhook(
            createAutoTopUpInvoiceEvent(
                "invoice.payment_action_required",
                invoiceId,
                user.id,
                {
                    hosted_invoice_url: `https://invoice.stripe.test/${invoiceId}`,
                },
            ),
            sessionToken,
        );
        expect(response.status).toBe(200);
    }

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ autoTopUpEnabled: number | boolean | null }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
});

test("POST /api/webhooks/stripe disables auto top-up after repeated failed invoices", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    for (const invoiceId of [
        "in_failed_repeat_1",
        "in_failed_repeat_2",
        "in_failed_repeat_3",
    ]) {
        const response = await postSignedStripeWebhook(
            createAutoTopUpInvoiceEvent(
                "invoice.payment_failed",
                invoiceId,
                user.id,
            ),
            sessionToken,
        );
        expect(response.status).toBe(200);
    }

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled,
            auto_top_up_last_failure AS autoTopUpLastFailure
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            autoTopUpEnabled: number | boolean | null;
            autoTopUpLastFailure: string | null;
        }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(0);
    expect(updatedUser?.autoTopUpLastFailure).toContain(
        "disabled after 3 consecutive failed charge attempts",
    );
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

test("POST /api/webhooks/stripe credits legacy sessions without packAmount using 2x fallback", async ({
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

    const payload = JSON.stringify({
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
    });

    const response = await SELF.fetch(stripeWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "stripe-signature": signStripeWebhookPayload(payload),
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: payload,
    });

    expect(response.status).toBe(200);

    const [updatedUser] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);

    expect(updatedUser?.packBalance).toBe(10);
});
