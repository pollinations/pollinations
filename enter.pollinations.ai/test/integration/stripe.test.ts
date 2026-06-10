import { env, SELF } from "cloudflare:test";
import { createHmac } from "node:crypto";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getPollenPackByAmount } from "@shared/pollen-packs.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect } from "vitest";
import { test } from "../fixtures.ts";
import { mockCardPaymentMethod, mockCustomer } from "../mocks/stripe.ts";

const base = "http://localhost:3000/api/stripe";
const stripeWebhookUrl = "http://localhost:3000/api/webhooks/stripe";
const stripePmcId = "pmc_1SrYT96O03AauPe8ijLy6sZU";
const checkoutAmounts = [
    "/checkout/p2",
    "/checkout/p5",
    "/checkout/p10",
    "/checkout/p20",
    "/checkout/p50",
    "/checkout/p100",
];

function signStripeWebhookPayload(payload: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");
    return `t=${timestamp},v1=${signature}`;
}

function expectUsdPriceData(
    body: Record<string, string> | undefined,
    amountUsd: number,
    expectedName?: string,
): void {
    expect(body?.["line_items[0][price]"]).toBeUndefined();
    expect(body?.["line_items[0][price_data][currency]"]).toBe("usd");
    expect(body?.["line_items[0][price_data][unit_amount]"]).toBe(
        String(amountUsd * 100),
    );
    expect(body?.["line_items[0][price_data][tax_behavior]"]).toBe("inclusive");
    if (expectedName) {
        expect(body?.["line_items[0][price_data][product_data][name]"]).toBe(
            expectedName,
        );
    }
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
    completedAt = null,
    createdAt = Date.now(),
    updatedAt = createdAt,
}: {
    id?: string;
    userId: string;
    invoiceId: string | null;
    status?: string;
    amountUsd?: number;
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
            status,
            created_at,
            updated_at,
            completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
        .bind(
            id,
            userId,
            invoiceId,
            amountUsd,
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
    await mocks.enable("stripe", "tinybird");
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
    expect(sessionCookieResponse.status).toBe(302);
});

test("GET /api/stripe/products returns pack list", async () => {
    const response = await SELF.fetch(`${base}/products`);
    expect(response.status).toBe(200);

    const data = (await response.json()) as {
        packs: {
            packKey: string;
            amount: number;
            description: string;
        }[];
    };
    expect(data.packs).toHaveLength(6);
    expect(data.packs.map((p) => p.packKey)).toEqual([
        "p2",
        "p5",
        "p10",
        "p20",
        "p50",
        "p100",
    ]);
    expect(data.packs.map((p) => p.amount)).toEqual([2, 5, 10, 20, 50, 100]);
});

test("GET /api/stripe/checkout/:packKey returns 400 for invalid pack keys", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    for (const path of ["/checkout/invalid", "/checkout/10"]) {
        const response = await SELF.fetch(`${base}${path}`, {
            method: "GET",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        });
        expect(response.status).toBe(400);
        const data = (await response.json()) as { error: string };
        expect(data.error).toBe("Invalid pack");
    }
});

test("GET /api/stripe/checkout/:packKey reuses the stable Stripe customer", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/checkout/p10`, {
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
        stripePmcId,
    );
    expect(checkoutRequest?.body["customer_update[address]"]).toBe("auto");
});

test("GET /api/stripe/checkout/p10 sets pack identity in session metadata", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/checkout/p10`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
        redirect: "manual",
    });
    expect(response.status).toBe(302);

    const body = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    )?.body;
    expect(body).toBeTruthy();

    // No cf-ipcountry header → USD default cohort. Checkout stays USD-native
    // and Adaptive Pricing may localize presentment where supported.
    expectUsdPriceData(body, 10);
    expect(body?.["adaptive_pricing[enabled]"]).toBe("true");

    // Session metadata carries the pack identity so the webhook can look up
    // the pack's fixed USD amount to credit. cohort identifies which routing
    // branch was taken.
    expect(body?.["metadata[packKey]"]).toBe("p10");
    expect(body?.["metadata[cohort]"]).toBe("USD");

    // payment_intent metadata mirrors session metadata for Stripe dashboard
    // inspection and reconciliation.
    expect(body?.["payment_intent_data[metadata][packKey]"]).toBe("p10");
});

test("GET /api/stripe/checkout/p2 uses the plain Pollen label", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/checkout/p2`, {
        method: "GET",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
        redirect: "manual",
    });
    expect(response.status).toBe(302);

    const body = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    )?.body;
    expect(body).toBeTruthy();

    // No cf-ipcountry header → USD default cohort.
    expectUsdPriceData(body, 2, "🪷 2 Pollen");
    expect(body?.["adaptive_pricing[enabled]"]).toBe("true");

    expect(body?.["metadata[packKey]"]).toBe("p2");
    expect(body?.["metadata[cohort]"]).toBe("USD");
    expect(body?.["payment_intent_data[metadata][packKey]"]).toBe("p2");
});

// Cohort routing: cf-ipcountry determines analytics metadata. Checkout sends
// USD price_data and leaves presentment localization to Stripe AP. Each cohort
// label must round-trip header → handler → echoed metadata[cohort], holding the
// USD-native price_data, AP-on, and buy-pollen PMC contract constant.
test.for([
    { country: "BR", cohort: "BR", pack: "p5", amountUsd: 5 },
    { country: "NL", cohort: "EU_CORE", pack: "p10", amountUsd: 10 },
    { country: "CN", cohort: "APAC_ALIPAY", pack: "p20", amountUsd: 20 },
    { country: "IN", cohort: "INDIA", pack: "p10", amountUsd: 10 },
    { country: "GB", cohort: "UK", pack: "p5", amountUsd: 5 },
])("cohort $cohort: cf-ipcountry=$country → USD price_data + AP on + buy-pollen PMC", async ({
    country,
    cohort,
    pack,
    amountUsd,
}, { sessionToken, mocks }) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/checkout/${pack}`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
            "cf-ipcountry": country,
        },
        redirect: "manual",
    });
    expect(response.status).toBe(302);

    const body = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    )?.body;
    expect(body).toBeTruthy();

    expectUsdPriceData(body, amountUsd);
    expect(body?.["adaptive_pricing[enabled]"]).toBe("true");
    expect(body?.payment_method_configuration).toBe(stripePmcId);
    expect(body?.["metadata[cohort]"]).toBe(cohort);
});

test("cohort MO spoof regression: cf-ipcountry=MO → USD default (NOT APAC_ALIPAY)", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    // The 5,000-charge live audit showed 99.8% of MO billing-country charges
    // were US-issued cards. MO must drop to USD default.
    const response = await SELF.fetch(`${base}/checkout/p5`, {
        method: "GET",
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
            "cf-ipcountry": "MO",
        },
        redirect: "manual",
    });
    expect(response.status).toBe(302);

    const body = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    )?.body;
    expect(body).toBeTruthy();

    expectUsdPriceData(body, 5);
    expect(body?.["adaptive_pricing[enabled]"]).toBe("true");
    expect(body?.payment_method_configuration).toBe(stripePmcId);
    expect(body?.["metadata[cohort]"]).toBe("USD");
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
    const pack = getPollenPackByAmount(10);
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
    expect(afterWebhook?.packBalance).toBe(11);

    const duplicateResponse = await postSignedStripeWebhook(
        createAutoTopUpInvoiceEvent("invoice.paid", "in_mock_1", user.id),
    );
    expect(duplicateResponse.status).toBe(200);

    const afterDuplicate = await env.DB.prepare(
        `SELECT pack_balance AS packBalance FROM user WHERE id = ?`,
    )
        .bind(user.id)
        .first<{ packBalance: number | null }>();
    expect(afterDuplicate?.packBalance).toBe(11);
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

    expect(updatedUser?.packBalance).toBe(11);
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

    expect(updatedUser?.packBalance).toBe(11);
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

    expect(updatedUser?.packBalance).toBe(11);
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
    expect(updatedUser?.packBalance).toBe(11);
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

// SCA recovery is verified end-to-end against the Stripe sandbox (see
// STAGING_AUTO_TOPUP_TEST_PLAN.md S6/S7). The unit-test path can't easily
// simulate the new `invoice.payments.data[0].payment.payment_intent`
// expansion that the live Stripe API requires.

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

    expect(updatedUser?.packBalance).toBe(11);
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

test("POST /api/webhooks/stripe does not credit sessions without pack metadata", async ({
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

    const [updatedUser] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);

    expect(updatedUser?.packBalance).toBe(0);

    const processedEvent = await env.DB.prepare(
        `SELECT COUNT(*) AS count
        FROM stripe_checkout_credits
        WHERE session_id = 'cs_test_legacy_checkout'`,
    ).first<{ count: number }>();
    expect(processedEvent?.count).toBe(0);
});

test("POST /api/webhooks/stripe emits paid checkout.session.completed to Tinybird", async ({
    sessionToken,
    mocks,
}) => {
    void sessionToken;
    await mocks.enable("tinybird");

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);

    expect(user).toBeTruthy();
    if (!user) throw new Error("Expected seeded test user");

    const pack = getPollenPackByAmount(10);
    expect(pack).toBeDefined();
    if (!pack) throw new Error("Expected $10 pollen pack");

    const response = await postSignedStripeWebhook({
        id: "evt_test_checkout_paid_emit",
        type: "checkout.session.completed",
        livemode: false,
        data: {
            object: {
                id: "cs_test_checkout_paid_emit",
                object: "checkout.session",
                metadata: { userId: user.id, packKey: pack.packKey },
                payment_status: "paid",
                amount_subtotal: pack.amountUsd * 100,
                amount_total: pack.amountUsd * 100,
                currency: "usd",
                customer_email: "buyer@example.com",
                payment_method_types: ["card", "link"],
            },
        },
    });
    expect(response.status).toBe(200);

    expect(mocks.tinybird.state.stripeEvents).toHaveLength(1);
    expect(mocks.tinybird.state.stripeEvents[0]).toMatchObject({
        event_id: "evt_test_checkout_paid_emit",
        event_type: "checkout.session.completed",
        session_id: "cs_test_checkout_paid_emit",
        amount_cents: pack.amountUsd * 100,
        currency: "usd",
        payment_status: "paid",
        payment_method: "unknown",
        payment_methods_offered: "card,link",
        customer_email: "buyer@example.com",
        livemode: 0,
    });
});

test("POST /api/webhooks/stripe charge.succeeded enriches Tinybird with card issuer and Radar score", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");

    const chargeEvent = {
        id: "evt_test_charge_succeeded",
        type: "charge.succeeded",
        livemode: false,
        data: {
            object: {
                id: "ch_test_charge_succeeded",
                object: "charge",
                amount: 1000,
                currency: "usd",
                status: "succeeded",
                billing_details: { email: "buyer@example.com" },
                payment_method_details: {
                    type: "card",
                    card: { brand: "visa", country: "CZ", network: "visa" },
                },
                outcome: { risk_level: "normal", risk_score: 21 },
            },
        },
    };

    const response = await postSignedStripeWebhook(chargeEvent);
    expect(response.status).toBe(200);

    expect(mocks.tinybird.state.stripeEvents).toHaveLength(1);
    expect(mocks.tinybird.state.stripeEvents[0]).toMatchObject({
        event_type: "charge.succeeded",
        event_id: "evt_test_charge_succeeded",
        session_id: "ch_test_charge_succeeded",
        amount_cents: 1000,
        currency: "usd",
        card_country: "CZ",
        card_brand: "visa",
        card_network: "visa",
        risk_level: "normal",
        risk_score: 21,
        payment_method_raw: "card",
        livemode: 0,
    });
});

test("POST /api/webhooks/stripe charge.succeeded does not write to D1 (Tinybird-only analytics)", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");

    const before = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM stripe_checkout_credits",
    ).first<{ count: number }>();

    const response = await postSignedStripeWebhook({
        id: "evt_test_charge_no_d1",
        type: "charge.succeeded",
        livemode: false,
        data: {
            object: {
                id: "ch_test_charge_no_d1",
                object: "charge",
                amount: 500,
                currency: "usd",
                status: "succeeded",
                payment_method_details: {
                    type: "card",
                    card: { brand: "visa", country: "US", network: "visa" },
                },
                outcome: { risk_level: "normal", risk_score: 5 },
            },
        },
    });
    expect(response.status).toBe(200);

    const after = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM stripe_checkout_credits",
    ).first<{ count: number }>();
    expect(after?.count).toBe(before?.count);
});

test("POST /api/webhooks/stripe emits checkout.session.async_payment_failed to Tinybird", async ({
    mocks,
}) => {
    await mocks.enable("tinybird");

    // Delayed-payment methods (BR Pix, EU SEPA) surface failure via
    // checkout.session.async_payment_failed — exercise the dedicated handler.
    const failedEvent = {
        id: "evt_test_async_failed",
        type: "checkout.session.async_payment_failed",
        livemode: false,
        data: {
            object: {
                id: "cs_test_async_failed",
                object: "checkout.session",
                amount_total: 429,
                currency: "eur",
                payment_status: "unpaid",
                payment_method_types: ["sepa_debit"],
                metadata: { userId: "u_test" },
                customer_email: "buyer@example.com",
            },
        },
    };

    const response = await postSignedStripeWebhook(failedEvent);
    expect(response.status).toBe(200);

    expect(mocks.tinybird.state.stripeEvents).toHaveLength(1);
    expect(mocks.tinybird.state.stripeEvents[0]).toMatchObject({
        event_id: "evt_test_async_failed",
        event_type: "checkout.session.async_payment_failed",
        currency: "eur",
        payment_status: "unpaid",
        payment_methods_offered: "sepa_debit",
    });
});

// Sibling of expectUsdPriceData — asserts native-EUR price_data + AP omitted.
function expectEurPriceData(
    body: Record<string, string> | undefined,
    eurCents: number,
): void {
    expect(body?.["line_items[0][price]"]).toBeUndefined();
    expect(body?.["line_items[0][price_data][currency]"]).toBe("eur");
    expect(body?.["line_items[0][price_data][unit_amount]"]).toBe(
        String(eurCents),
    );
    expect(body?.["line_items[0][price_data][tax_behavior]"]).toBe("inclusive");
    expect(body?.["adaptive_pricing[enabled]"]).toBeUndefined(); // native EUR ⇒ no AP
}

describe("EUR checkout branch (flag on)", () => {
    // String vars in wrangler are passed as value copies to each fetch handler —
    // mutating the cloudflare:test `env` object does not propagate to the worker.
    // Instead we use a KV key as a runtime toggle that IS shared across the
    // test/worker boundary (service bindings are live references). The route
    // checks KV key "eur-checkout-enabled" = "true" as an override of the env var.
    beforeEach(async () => {
        await env.KV.put("eur-checkout-enabled", "true");
        // Pre-seed the daily rate so getEurMidRate returns 1.155 with NO outbound
        // ECB fetch — deterministic: $5 / 1.155 = €4.33 = 433 cents.
        await env.KV.put("fx:eur-usd:current", "1.155");
    });
    afterEach(async () => {
        await env.KV.delete("eur-checkout-enabled");
        await env.KV.delete("fx:eur-usd:current");
    });

    test("EU_CORE (DE) → native EUR price_data, no adaptive pricing", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const response = await SELF.fetch(`${base}/checkout/p5`, {
            method: "GET",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
                "cf-ipcountry": "DE",
            },
            redirect: "manual",
        });
        expect(response.status).toBe(302);
        const body = mocks.stripe.state.requests.find(
            (r) => r.path === "/v1/checkout/sessions",
        )?.body;
        expect(body).toBeTruthy();
        expectEurPriceData(body, 433); // $5 / 1.155
        expect(body?.["metadata[cohort]"]).toBe("EU_CORE");
        expect(body?.payment_method_configuration).toBe(stripePmcId);
    });

    test("non-EU (US) → still USD + AP even with flag on", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const response = await SELF.fetch(`${base}/checkout/p5`, {
            method: "GET",
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
                "cf-ipcountry": "US",
            },
            redirect: "manual",
        });
        expect(response.status).toBe(302);
        const body = mocks.stripe.state.requests.find(
            (r) => r.path === "/v1/checkout/sessions",
        )?.body;
        expectUsdPriceData(body, 5);
        expect(body?.["adaptive_pricing[enabled]"]).toBe("true");
    });
});
