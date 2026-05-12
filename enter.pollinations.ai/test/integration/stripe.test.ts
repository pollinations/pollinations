import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { getPollenPack } from "@/pollen-packs.ts";
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
        | "invoice.payment_succeeded"
        | "invoice.payment_failed"
        | "invoice.voided"
        | "invoice.marked_uncollectible",
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
                status: getInvoiceStatusForEvent(type),
                amount_due: 1000,
                amount_paid:
                    type === "invoice.paid" ||
                    type === "invoice.payment_succeeded"
                        ? 1000
                        : 0,
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

function getInvoiceStatusForEvent(type: string): string {
    if (type === "invoice.paid" || type === "invoice.payment_succeeded") {
        return "paid";
    }
    if (type === "invoice.voided") return "void";
    if (type === "invoice.marked_uncollectible") return "uncollectible";
    return "open";
}

async function insertAutoTopUpAttempt({
    id = crypto.randomUUID(),
    userId,
    invoiceId,
    status = "pending",
    amountUsd = 10,
    pollenGrant = 15,
    completedAt = null,
    createdAt = Date.now(),
    updatedAt = createdAt,
}: {
    id?: string;
    userId: string;
    invoiceId: string | null;
    status?: string;
    amountUsd?: number;
    pollenGrant?: number;
    completedAt?: number | null;
    createdAt?: number;
    updatedAt?: number;
}) {
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
            id,
            userId,
            invoiceId,
            amountUsd,
            pollenGrant,
            status,
            createdAt,
            updatedAt,
            completedAt,
        )
        .run();
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
        2.5, 7, 15, 30, 80, 200,
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

test("GET /api/stripe/checkout/:amount reuses the stable Stripe customer", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

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
    expect(checkoutRequest?.body.payment_method_configuration).toBe(
        "pmc_1TUpoC6O03AauPe8gaFzZxyM",
    );
    expect(checkoutRequest?.body["customer_update[address]"]).toBe("auto");
});

test("POST /api/stripe/billing/portal creates a Stripe Portal session", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/billing/portal`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { url: string };
    expect(data.url).toContain("billing.stripe.test");

    const portalRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/billing_portal/sessions",
    );
    expect(portalRequest?.body.customer).toBe("cus_mock_1");
    expect(portalRequest?.body.configuration).toBe("bpc_mock_1");

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
                payment_method_configuration: "pmc_1TUpob6O03AauPe8EgmA4mvg",
            },
        },
    });
});

test("POST /api/stripe/billing/portal updates existing Stripe Portal headline", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

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
    expect(
        updateRequest?.body[
            "features[payment_method_update][payment_method_configuration]"
        ],
    ).toBe("pmc_1TUpob6O03AauPe8EgmA4mvg");
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
    await mocks.enable("stripe", "tinybird");

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

test("GET /api/stripe/billing derives disabled auto top-up when default card is removed", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

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
        autoTopUp: { enabled: boolean };
        paymentMethod: { hasDefault: boolean };
        billingDetailsComplete: boolean;
    };
    expect(data.autoTopUp.enabled).toBe(false);
    expect(data.paymentMethod.hasDefault).toBe(false);
    expect(data.billingDetailsComplete).toBe(true);

    const [updatedUser] = await db
        .select({ autoTopUpEnabled: userTable.autoTopUpEnabled })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(true);
});

test("GET /api/stripe/billing derives disabled auto top-up when billing address is missing", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

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
        autoTopUp: { enabled: boolean };
        paymentMethod: { hasDefault: boolean };
        billingDetailsComplete: boolean;
    };
    expect(data.autoTopUp.enabled).toBe(false);
    expect(data.paymentMethod.hasDefault).toBe(true);
    expect(data.billingDetailsComplete).toBe(false);

    const [updatedUser] = await db
        .select({ autoTopUpEnabled: userTable.autoTopUpEnabled })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(true);
});

test("GET /api/stripe/billing shows pending auto top-up invoice payment link", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_pending_invoice");
    customer.invoice_settings.default_payment_method = "pm_card";
    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_card", customer.id),
    );

    await db
        .update(userTable)
        .set({
            stripeCustomerId: customer.id,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
        })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_pending_payment_link";
    const hostedInvoiceUrl =
        "https://invoice.stripe.com/i/acct_test/pending_payment";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: customer.id,
        status: "open",
        amount_due: 1000,
        amount_paid: 0,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
        hosted_invoice_url: hostedInvoiceUrl,
    });

    const response = await SELF.fetch(`${base}/billing`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        autoTopUp: {
            enabled: boolean;
            lastIssue: {
                kind: string;
                invoiceUrl?: string;
            } | null;
        };
    };
    expect(data.autoTopUp.enabled).toBe(true);
    expect(data.autoTopUp.lastIssue).toMatchObject({
        kind: "pending_payment",
        invoiceUrl: hostedInvoiceUrl,
    });
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === `/v1/invoices/${invoiceId}`,
        ),
    ).toBe(true);
});

test("PATCH /api/stripe/auto-top-up uses fixed threshold and rejects invalid pack values", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

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
    expect(customThresholdData.autoTopUp.packAmountUsd).toBe(20);

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);
    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_range");
    customer.invoice_settings.default_payment_method = "pm_card_range";
    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_card_range", customer.id),
    );
    await db
        .update(userTable)
        .set({ stripeCustomerId: customer.id })
        .where(eq(userTable.id, user.id));

    const unsupportedPackResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            enabled: true,
            packAmountUsd: 2,
        }),
    });

    expect(unsupportedPackResponse.status).toBe(400);
    const unsupportedPackData = (await unsupportedPackResponse.json()) as {
        error: string;
    };
    expect(unsupportedPackData.error).toBe("Invalid auto top-up pack amount.");
});

test("PATCH /api/stripe/auto-top-up validates request shape", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    const headers = {
        "Content-Type": "application/json",
        cookie: `better-auth.session_token=${sessionToken}`,
    };

    const malformedResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers,
        body: "{",
    });
    expect(malformedResponse.status).toBe(400);

    const missingEnabledResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
    });
    expect(missingEnabledResponse.status).toBe(400);
    await expect(missingEnabledResponse.json()).resolves.toEqual({
        error: "enabled must be boolean",
    });

    const stringEnabledResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: "true", packAmountUsd: 10 }),
    });
    expect(stringEnabledResponse.status).toBe(400);

    const missingPackResponse = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: true }),
    });
    expect(missingPackResponse.status).toBe(400);
    await expect(missingPackResponse.json()).resolves.toEqual({
        error: "packAmountUsd must be a finite number",
    });
});

test("PATCH /api/stripe/auto-top-up keeps configured pack when disabling", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await env.DB.prepare(
        `UPDATE user
            SET auto_top_up_enabled = 1,
                auto_top_up_amount_usd = 10
            WHERE id = ?`,
    )
        .bind(user.id)
        .run();

    const response = await SELF.fetch(`${base}/auto-top-up`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            enabled: false,
        }),
    });

    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled,
            auto_top_up_amount_usd AS autoTopUpAmountUsd
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            autoTopUpEnabled: number | boolean | null;
            autoTopUpAmountUsd: number | null;
        }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(0);
    expect(updatedUser?.autoTopUpAmountUsd).toBe(10);
});

test("PATCH /api/stripe/auto-top-up requires a default card before enabling", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

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
    await mocks.enable("stripe", "tinybird");

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

test("POST /api/stripe/auto-top-up/trigger creates and pays auto top-up invoice", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");
    const pack = getPollenPack("10");
    expect(pack).toBeDefined();
    if (!pack) throw new Error("Expected $10 pollen pack");

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
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        status: string;
        invoiceId?: string;
    };
    expect(data.status).toBe("created");
    expect(data.invoiceId).toBe("in_mock_1");

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            packBalance: number | null;
        }>();
    expect(updatedUser?.packBalance).toBe(1);

    const attempt = await env.DB.prepare(
        `SELECT status, completed_at AS completedAt
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind("in_mock_1")
        .first<{ status: string; completedAt: number | null }>();
    expect(attempt?.status).toBe("pending");
    expect(attempt?.completedAt).toBeNull();

    const invoiceRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/invoices",
    );
    const payRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/invoices/in_mock_1/pay",
    );
    expect(invoiceRequest?.body.customer).toBe(customer.id);
    expect(invoiceRequest?.body.auto_advance).toBe("false");
    expect(invoiceRequest?.idempotencyKey).toMatch(
        /^pollinations:auto-top-up:[0-9a-f-]+:invoice$/,
    );
    expect(invoiceRequest?.body["metadata[pollinations_purpose]"]).toBe(
        "auto_top_up",
    );
    expect(payRequest).toBeDefined();
});

test("POST /api/stripe/auto-top-up/trigger followed by webhook credits once", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_inline_then_webhook");
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

    const triggerResponse = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });
    expect(triggerResponse.status).toBe(200);

    const afterTrigger = await env.DB.prepare(
        `SELECT pack_balance AS packBalance FROM user WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    expect(afterTrigger?.packBalance).toBe(1);

    const webhookResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", "in_mock_1", user.id),
    );
    expect(webhookResponse.status).toBe(200);

    const afterWebhook = await env.DB.prepare(
        `SELECT pack_balance AS packBalance FROM user WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    expect(afterWebhook?.packBalance).toBe(16);

    const duplicateResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", "in_mock_1", user.id),
    );
    expect(duplicateResponse.status).toBe(200);

    const afterDuplicate = await env.DB.prepare(
        `SELECT pack_balance AS packBalance FROM user WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    expect(afterDuplicate?.packBalance).toBe(16);
});

test("POST /api/stripe/auto-top-up/trigger disables auto top-up when setup is incomplete", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
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

test("POST /api/stripe/auto-top-up/trigger disables when Stripe customer is deleted", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_deleted");
    customer.deleted = true;
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
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        status: "skipped",
        reason: "deleted Stripe customer",
    });

    const [updatedUser] = await db
        .select({
            autoTopUpEnabled: userTable.autoTopUpEnabled,
        })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(false);
    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "POST" && request.path === "/v1/customers",
        ),
    ).toBe(false);
});

test("POST /api/stripe/auto-top-up/trigger leaves SCA invoices pending", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_sca");
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

    mocks.stripe.state.payBehavior["in_mock_1"] = {
        statusCode: 402,
        error: {
            type: "StripeInvalidRequestError",
            code: "invoice_payment_intent_requires_action",
            message:
                "This payment requires additional user action before it can be completed successfully.",
            payment_intent: { status: "requires_action" },
        },
    };

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        status: "created",
        invoiceId: "in_mock_1",
    });

    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason, completed_at AS completedAt
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind("in_mock_1")
        .first<{
            status: string;
            failureReason: string | null;
            completedAt: number | null;
        }>();
    expect(attempt?.status).toBe("pending");
    expect(attempt?.failureReason).toBeNull();
    expect(attempt?.completedAt).toBeNull();

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance,
            auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            packBalance: number | null;
            autoTopUpEnabled: number | boolean | null;
        }>();
    expect(updatedUser?.packBalance).toBe(1);
    expect(updatedUser?.autoTopUpEnabled).toBe(1);

    const voidedInvoiceCalls = mocks.stripe.state.requests.filter(
        (request) =>
            request.method === "POST" &&
            request.path === "/v1/invoices/in_mock_1/void",
    );
    expect(voidedInvoiceCalls).toHaveLength(0);
});

test("POST /api/stripe/auto-top-up/trigger leaves failed pay attempts pending", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_auth_failed");
    customer.invoice_settings.default_payment_method = "pm_auth_failed";
    mocks.stripe.state.customers.push(customer);
    mocks.stripe.state.paymentMethods.push(
        mockCardPaymentMethod("pm_auth_failed", customer.id),
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

    mocks.stripe.state.payBehavior["in_mock_1"] = {
        statusCode: 402,
        error: {
            type: "StripeCardError",
            code: "payment_intent_authentication_failure",
            message: "The provided payment method has failed authentication.",
        },
    };

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        status: "created",
        invoiceId: "in_mock_1",
    });

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ autoTopUpEnabled: number | boolean | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind("in_mock_1")
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
    expect(attempt?.status).toBe("pending");
    expect(attempt?.failureReason).toBeNull();
    expect(
        mocks.stripe.state.invoices.find(
            (invoice) => invoice.id === "in_mock_1",
        )?.status,
    ).toBe("open");
});

test("POST /api/stripe/auto-top-up/trigger skips during claim window", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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
                auto_top_up_amount_usd = 10
            WHERE id = ?`,
    )
        .bind(customer.id, user.id)
        .run();
    await insertAutoTopUpAttempt({
        id: "attempt_claimed_cooldown",
        userId: user.id,
        invoiceId: null,
        status: "claimed",
    });

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        status: string;
        reason?: string;
    };
    expect(data.status).toBe("skipped");
    expect(data.reason).toContain("attempt_claimed_cooldown");
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === "/v1/invoices",
        ),
    ).toBe(false);
});

test("POST /api/stripe/auto-top-up/trigger expires stale claimed attempts", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const customer = mockCustomer("cus_auto_top_up_stale_claim");
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

    const staleAt = Date.now() - 6 * 60 * 1000;
    await insertAutoTopUpAttempt({
        id: "attempt_stale_claim",
        userId: user.id,
        invoiceId: null,
        status: "claimed",
        createdAt: staleAt,
        updatedAt: staleAt,
    });

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        status: "created",
        invoiceId: "in_mock_1",
    });

    const staleAttempt = await env.DB.prepare(
        `SELECT COUNT(*) AS count
        FROM stripe_auto_top_up_attempt
        WHERE id = ?`,
    )
        .bind("attempt_stale_claim")
        .first<{ count: number }>();
    expect(staleAttempt?.count).toBe(0);
});

test("POST /api/stripe/auto-top-up/trigger voids stale pending invoices", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({
            packBalance: 1,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
        })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_stale_pending";
    const staleAt = Date.now() - 25 * 60 * 60 * 1000;
    await insertAutoTopUpAttempt({
        id: "attempt_stale_pending",
        userId: user.id,
        invoiceId,
        status: "pending",
        createdAt: staleAt,
        updatedAt: staleAt,
    });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "open",
        amount_due: 1000,
        amount_paid: 0,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        status: "skipped",
    });
    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "POST" &&
                request.path === `/v1/invoices/${invoiceId}/void`,
        ),
    ).toBe(true);
    expect(
        mocks.stripe.state.invoices.find((invoice) => invoice.id === invoiceId)
            ?.status,
    ).toBe("void");

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ autoTopUpEnabled: number | boolean | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE id = ?`,
    )
        .bind("attempt_stale_pending")
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failureReason).toContain("invoice expired");
});

test("POST /api/stripe/auto-top-up/trigger credits stale paid pending invoices", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({
            packBalance: 1,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
        })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_stale_paid_pending";
    const staleAt = Date.now() - 25 * 60 * 60 * 1000;
    await insertAutoTopUpAttempt({
        id: "attempt_stale_paid_pending",
        userId: user.id,
        invoiceId,
        status: "pending",
        createdAt: staleAt,
        updatedAt: staleAt,
    });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, environment: env.ENVIRONMENT }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
        status: "skipped",
    });
    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "POST" && request.path === "/v1/invoices",
        ),
    ).toBe(false);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, completed_at AS completedAt
        FROM stripe_auto_top_up_attempt
        WHERE id = ?`,
    )
        .bind("attempt_stale_paid_pending")
        .first<{ status: string; completedAt: number | null }>();

    expect(updatedUser?.packBalance).toBe(16);
    expect(attempt?.status).toBe("paid");
    expect(attempt?.completedAt).toBeTypeOf("number");
});

test("POST /api/stripe/auto-top-up/trigger rejects environment mismatch", async () => {
    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${env.PLN_ENTER_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            userId: "user_test",
            environment: "production",
        }),
    });

    expect(response.status).toBe(401);
    const data = (await response.json()) as { error: string };
    expect(data.error).toBe("Environment mismatch");
});

test.for([
    { name: "missing token", authorization: undefined },
    { name: "empty token", authorization: "Bearer " },
    { name: "wrong token", authorization: "Bearer wrong-token" },
])("POST /api/stripe/auto-top-up/trigger rejects $name", async ({
    authorization,
}) => {
    const headers: Record<string, string> = {};
    if (authorization) headers.Authorization = authorization;

    const response = await SELF.fetch(`${base}/auto-top-up/trigger`, {
        method: "POST",
        headers,
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
        error: "Unauthorized",
    });
});

test("POST /api/webhooks/stripe accepts wrong-mode events without writes", async ({
    sessionToken,
}) => {
    void sessionToken;
    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);
    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ packBalance: 1, autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_wrong_mode";
    const event = {
        ...createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
        livemode: true,
    };

    const response = await postSignedStripeWebhook(event);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });

    const [updatedUser] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);
    expect(updatedUser?.packBalance).toBe(1);

    const attempt = await env.DB.prepare(
        `SELECT COUNT(*) AS count
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ count: number }>();
    expect(attempt?.count).toBe(0);
});

test("POST /api/webhooks/stripe credits paid auto top-up invoice once", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe");
    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ packBalance: 1, autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_paid_once";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });

    const firstResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
    );
    const secondResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            packBalance: number | null;
        }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.packBalance).toBe(16);
    expect(attempt?.status).toBe("paid");
    expect(attempt?.failureReason).toBeNull();
});

test("POST /api/webhooks/stripe credits payment_succeeded auto top-up invoices", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe");
    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ packBalance: 1, autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_payment_succeeded";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_succeeded",
            invoiceId,
            user.id,
        ),
    );

    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string }>();

    expect(updatedUser?.packBalance).toBe(16);
    expect(attempt?.status).toBe("paid");
});

test("POST /api/webhooks/stripe credits once when paid and payment_succeeded both arrive", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe");
    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ packBalance: 1, autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_both_success_events";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });

    const paidResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
    );
    const succeededResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_succeeded",
            invoiceId,
            user.id,
        ),
    );

    expect(paidResponse.status).toBe(200);
    expect(succeededResponse.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    expect(updatedUser?.packBalance).toBe(16);
});

test.for([
    {
        name: "amount",
        invoiceId: "in_amount_mismatch",
        overrides: { amount_paid: 2000 },
        expectedReason: "verification mismatch: amount mismatch",
    },
    {
        name: "currency",
        invoiceId: "in_currency_mismatch",
        overrides: { currency: "eur" },
        expectedReason: "verification mismatch: currency mismatch",
    },
])("POST /api/webhooks/stripe rejects auto top-up invoice with $name mismatch", async ({
    invoiceId,
    overrides,
    expectedReason,
}, { sessionToken }) => {
    void sessionToken;
    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({
            packBalance: 1,
            autoTopUpEnabled: true,
            autoTopUpAmountUsd: 10,
        })
        .where(eq(userTable.id, user.id));
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.paid",
            invoiceId,
            user.id,
            overrides,
        ),
    );
    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
            FROM user
            WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
            FROM stripe_auto_top_up_attempt
            WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.packBalance).toBe(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failureReason).toContain(expectedReason);
});

test("POST /api/webhooks/stripe does not let payment_failed reopen a paid auto top-up invoice", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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
    await insertAutoTopUpAttempt({
        id: "attempt_paid_then_failed",
        userId: user.id,
        invoiceId,
        status: "paid",
        completedAt: now,
    });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const paymentFailedResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            invoiceId,
            user.id,
        ),
    );
    expect(paymentFailedResponse.status).toBe(200);

    const paidRedeliveryResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
    );
    expect(paidRedeliveryResponse.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            packBalance: number | null;
        }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.packBalance).toBe(16);
    expect(attempt?.status).toBe("paid");
    expect(attempt?.failureReason).toBeNull();
});

test("POST /api/webhooks/stripe keeps SCA invoices recoverable after payment failure", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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

    await insertAutoTopUpAttempt({
        userId: user.id,
        invoiceId: "in_failed_retrying",
    });
    mocks.stripe.state.paymentIntents.push({
        id: "pi_requires_action",
        object: "payment_intent",
        status: "requires_action",
    });
    mocks.stripe.state.invoices.push({
        id: "in_failed_retrying",
        object: "invoice",
        customer: "cus_webhook",
        status: "open",
        amount_due: 1000,
        amount_paid: 0,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            "in_failed_retrying",
            user.id,
            { payment_intent: "pi_requires_action" },
        ),
    );
    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            autoTopUpEnabled: number | boolean | null;
        }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason, completed_at AS completedAt
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind("in_failed_retrying")
        .first<{
            status: string;
            failureReason: string | null;
            completedAt: number | null;
        }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
    expect(attempt?.status).toBe("pending");
    expect(attempt?.failureReason).toBeNull();
    expect(attempt?.completedAt).toBeNull();
    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "POST" &&
                request.path === "/v1/invoices/in_failed_retrying/void",
        ),
    ).toBe(false);
    expect(
        mocks.stripe.state.invoices.find(
            (invoice) => invoice.id === "in_failed_retrying",
        )?.status,
    ).toBe("open");
});

test("POST /api/webhooks/stripe fails declined invoices without disabling auto top-up", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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

    const invoiceId = "in_declined_retrying";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });
    mocks.stripe.state.paymentIntents.push({
        id: "pi_requires_payment_method",
        object: "payment_intent",
        status: "requires_payment_method",
    });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "open",
        amount_due: 1000,
        amount_paid: 0,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            invoiceId,
            user.id,
            { payment_intent: "pi_requires_payment_method" },
        ),
    );
    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{
            autoTopUpEnabled: number | boolean | null;
        }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason, completed_at AS completedAt
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{
            status: string;
            failureReason: string | null;
            completedAt: number | null;
        }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failureReason).toContain(
        "Stripe could not charge the default payment method.",
    );
    expect(attempt?.completedAt).toBeTypeOf("number");
    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "POST" &&
                request.path === `/v1/invoices/${invoiceId}/void`,
        ),
    ).toBe(true);
    expect(
        mocks.stripe.state.invoices.find((invoice) => invoice.id === invoiceId)
            ?.status,
    ).toBe("void");
});

test.for([
    { type: "invoice.voided", invoiceId: "in_terminal_voided" },
    {
        type: "invoice.marked_uncollectible",
        invoiceId: "in_terminal_uncollectible",
    },
] as const)("POST /api/webhooks/stripe records $type without disabling auto top-up", async ({
    type,
    invoiceId,
}, { sessionToken }) => {
    void sessionToken;

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

    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(type, invoiceId, user.id),
    );
    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
            FROM user
            WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ autoTopUpEnabled: number | boolean | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
            FROM stripe_auto_top_up_attempt
            WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
    expect(attempt?.status).toBe("failed");
    expect(attempt?.failureReason).toContain(
        "Stripe invoice can no longer be collected.",
    );
});

test("POST /api/webhooks/stripe deletes draft failed auto top-up invoices", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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

    const invoiceId = "in_failed_draft";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "draft",
        amount_due: 1000,
        amount_paid: 0,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            invoiceId,
            user.id,
            { status: "draft" },
        ),
    );
    expect(response.status).toBe(200);

    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "DELETE" &&
                request.path === `/v1/invoices/${invoiceId}`,
        ),
    ).toBe(true);
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === `/v1/invoices/${invoiceId}/void`,
        ),
    ).toBe(false);
    expect(
        mocks.stripe.state.invoices.some((invoice) => invoice.id === invoiceId),
    ).toBe(false);
});

test("POST /api/webhooks/stripe still credits paid invoice after payment_failed race", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    await db
        .update(userTable)
        .set({ packBalance: 1, autoTopUpEnabled: true, autoTopUpAmountUsd: 10 })
        .where(eq(userTable.id, user.id));

    const invoiceId = "in_paid_after_failed_race";
    await insertAutoTopUpAttempt({ userId: user.id, invoiceId });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const failedResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            invoiceId,
            user.id,
        ),
    );
    const paidResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", invoiceId, user.id),
    );

    expect(failedResponse.status).toBe(200);
    expect(paidResponse.status).toBe(200);
    expect(
        mocks.stripe.state.requests.some(
            (request) => request.path === `/v1/invoices/${invoiceId}/void`,
        ),
    ).toBe(false);

    const updatedUser = await env.DB.prepare(
        `SELECT pack_balance AS packBalance
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    const attempt = await env.DB.prepare(
        `SELECT status, failure_reason AS failureReason
        FROM stripe_auto_top_up_attempt
        WHERE stripe_invoice_id = ?`,
    )
        .bind(invoiceId)
        .first<{ status: string; failureReason: string | null }>();

    expect(updatedUser?.packBalance).toBe(16);
    expect(attempt?.status).toBe("paid");
    expect(attempt?.failureReason).toBeNull();
});

test("POST /api/webhooks/stripe payment_failed retry does not disable when attempt already paid", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("stripe", "tinybird");

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

    const invoiceId = "in_paid_then_failed_retry";
    // Attempt is already paid. A late or out-of-order payment_failed delivery
    // must not disable the user.
    await insertAutoTopUpAttempt({
        userId: user.id,
        invoiceId,
        status: "paid",
        completedAt: Date.now() - 60_000,
    });
    mocks.stripe.state.invoices.push({
        id: invoiceId,
        object: "invoice",
        customer: "cus_webhook",
        status: "paid",
        amount_due: 1000,
        amount_paid: 1000,
        currency: "usd",
        metadata: {
            pollinations_user_id: user.id,
            pollinations_purpose: "auto_top_up",
            packAmount: "10",
        },
    });

    const response = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent(
            "invoice.payment_failed",
            invoiceId,
            user.id,
        ),
    );
    expect(response.status).toBe(200);

    const updatedUser = await env.DB.prepare(
        `SELECT auto_top_up_enabled AS autoTopUpEnabled
        FROM user
        WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ autoTopUpEnabled: number | boolean | null }>();

    expect(updatedUser?.autoTopUpEnabled).toBe(1);
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

test("POST /api/webhooks/stripe accepts livemode mismatch without processing", async () => {
    const response = await postSignedStripeWebhook({
        id: "evt_live_mismatch",
        type: "checkout.session.completed",
        livemode: true,
        data: {
            object: {
                id: "cs_live_mismatch",
                object: "checkout.session",
                payment_status: "paid",
            },
        },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });
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

    const duplicatePayload = JSON.stringify({
        ...checkoutEvent,
        id: "evt_test_legacy_checkout_duplicate",
    });
    const duplicateResponse = await SELF.fetch(stripeWebhookUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "stripe-signature": signStripeWebhookPayload(duplicatePayload),
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: duplicatePayload,
    });

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
