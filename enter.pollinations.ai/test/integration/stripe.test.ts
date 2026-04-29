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

test.for(
    checkoutAmounts,
)("%s should only be accessible when authenticated via session cookie", async (route, {
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird", "stripe");
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

test("GET /api/stripe/billing/countries returns cached country options", async () => {
    const response = await SELF.fetch(`${base}/billing/countries`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
        "public, max-age=86400, immutable",
    );

    const data = (await response.json()) as {
        countries: {
            code: string;
            name: string;
            taxIdType: string | null;
            taxIdLabel: string;
        }[];
    };
    expect(data.countries.length).toBeGreaterThan(200);
    expect(
        data.countries.find((country) => country.code === "AU"),
    ).toMatchObject({
        name: "Australia",
        taxIdType: "au_abn",
        taxIdLabel: "ABN",
    });
    expect(
        data.countries.find((country) => country.code === "FR"),
    ).toMatchObject({
        taxIdType: "eu_vat",
        taxIdLabel: "VAT number",
    });
    expect(
        data.countries.find((country) => country.code === "AF"),
    ).toMatchObject({
        taxIdType: null,
        taxIdLabel: "Tax ID",
    });
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

test("GET /api/stripe/billing creates a stable customer and ignores old customer invoices", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    mocks.stripe.state.customers.push(
        mockCustomer("cus_old_checkout", "test@example.com"),
    );
    mocks.stripe.state.invoices.push(
        mockInvoice("in_old_checkout", "cus_old_checkout", 2_000, 1_000),
    );

    const response = await SELF.fetch(`${base}/billing`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        invoices: { id: string }[];
    };
    expect(data.invoices.map((invoice) => invoice.id)).not.toContain(
        "in_old_checkout",
    );
    expect(mocks.stripe.state.customers).toHaveLength(2);
    expect(
        mocks.stripe.state.requests.filter(
            (request) => request.path === "/v1/customers/search",
        ),
    ).toHaveLength(0);
    expect(
        mocks.stripe.state.requests.filter(
            (request) => request.path === "/v1/invoices",
        ),
    ).toHaveLength(1);
});

test("GET /api/stripe/billing handles concurrent first customer creation", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const [firstResponse, secondResponse] = await Promise.all([
        SELF.fetch(`${base}/billing`, {
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        }),
        SELF.fetch(`${base}/billing`, {
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        }),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mocks.stripe.state.customers).toHaveLength(1);

    const createRequests = mocks.stripe.state.requests.filter(
        (request) =>
            request.method === "POST" && request.path === "/v1/customers",
    );
    expect(createRequests.length).toBeGreaterThan(0);
    expect(
        createRequests.every(
            (request) =>
                request.idempotencyKey &&
                request.idempotencyKey === createRequests[0].idempotencyKey,
        ),
    ).toBe(true);
});

test("GET /api/stripe/checkout/:amount passes the stable customer to Checkout", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/checkout/10`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
        redirect: "manual",
    });

    expect(response.status).toBe(302);
    const checkoutRequest = mocks.stripe.state.requests.find(
        (request) => request.path === "/v1/checkout/sessions",
    );
    expect(checkoutRequest?.body.customer).toBe("cus_mock_1");
    expect(
        checkoutRequest?.body["payment_intent_data[setup_future_usage]"],
    ).toBeUndefined();
    expect(
        checkoutRequest?.body["payment_intent_data[metadata][userId]"],
    ).toBeTruthy();
});

test("PATCH /api/stripe/billing/profile updates customer details and replaces immutable tax IDs", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    await SELF.fetch(`${base}/billing`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });

    const firstResponse = await SELF.fetch(`${base}/billing/profile`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify(billingProfilePayload({ taxId: "DE222222222" })),
    });
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as {
        profile: { taxId: { verificationStatus: string } };
    };
    expect(first.profile.taxId.verificationStatus).toBe("pending");
    expect(mocks.stripe.state.taxIds).toHaveLength(1);

    const secondResponse = await SELF.fetch(`${base}/billing/profile`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify(billingProfilePayload({ taxId: "DE000000000" })),
    });
    expect(secondResponse.status).toBe(200);
    const second = (await secondResponse.json()) as {
        profile: { taxId: { value: string; verificationStatus: string } };
    };
    expect(second.profile.taxId.value).toBe("DE000000000");
    expect(second.profile.taxId.verificationStatus).toBe("verified");
    expect(mocks.stripe.state.taxIds).toHaveLength(1);
    expect(mocks.stripe.state.taxIds[0].value).toBe("DE000000000");
    expect(
        mocks.stripe.state.requests.some((request) =>
            request.path.includes("/tax_ids/txi_mock_1"),
        ),
    ).toBe(true);
});

test("PATCH /api/stripe/billing/profile returns field errors for Stripe address validation", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    mocks.stripe.state.invalidAddressCountry = "US";

    const response = await SELF.fetch(`${base}/billing/profile`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify(
            billingProfilePayload({
                country: "US",
                taxId: "12-3456789",
            }),
        ),
    });

    expect(response.status).toBe(400);
    const data = (await response.json()) as {
        fieldErrors: Record<string, string>;
    };
    expect(data.fieldErrors.country).toBeTruthy();
});

test("PATCH /api/stripe/billing/profile rejects oversized bodies", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/billing/profile`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            cookie: `better-auth.session_token=${sessionToken}`,
        },
        body: JSON.stringify({
            ...billingProfilePayload(),
            name: "x".repeat(17_000),
        }),
    });

    expect(response.status).toBe(413);
});

test("GET /api/stripe/billing makes the only saved card default", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    await SELF.fetch(`${base}/billing`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    mocks.stripe.state.paymentMethods.push(
        mockPaymentMethod("pm_only", "cus_mock_1"),
    );

    const response = await SELF.fetch(`${base}/billing`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
        cards: { id: string; isDefault: boolean }[];
    };
    expect(data.cards).toHaveLength(1);
    expect(data.cards[0]).toMatchObject({
        id: "pm_only",
        isDefault: true,
    });
    expect(
        mocks.stripe.state.customers[0].invoice_settings.default_payment_method,
    ).toBe("pm_only");
});

test("payment method default and delete endpoints verify Stripe ownership", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    await SELF.fetch(`${base}/billing`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    mocks.stripe.state.paymentMethods.push(
        mockPaymentMethod("pm_user", "cus_mock_1"),
        mockPaymentMethod("pm_other", "cus_other"),
    );

    const defaultResponse = await SELF.fetch(
        `${base}/payment-methods/pm_user/default`,
        {
            method: "PATCH",
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(defaultResponse.status).toBe(200);
    expect(
        mocks.stripe.state.customers[0].invoice_settings.default_payment_method,
    ).toBe("pm_user");

    const forbiddenDefault = await SELF.fetch(
        `${base}/payment-methods/pm_other/default`,
        {
            method: "PATCH",
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(forbiddenDefault.status).toBe(403);

    const deleteResponse = await SELF.fetch(`${base}/payment-methods/pm_user`, {
        method: "DELETE",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(deleteResponse.status).toBe(204);
    expect(
        mocks.stripe.state.paymentMethods.find(
            (method) => method.id === "pm_user",
        )?.customer,
    ).toBeNull();
});

test("POST /api/stripe/payment-methods/setup creates a setup Checkout session", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");

    const response = await SELF.fetch(`${base}/payment-methods/setup`, {
        method: "POST",
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { url: string };
    expect(data.url).toContain("checkout.stripe.test");
    expect(mocks.stripe.state.checkoutSessions[0].mode).toBe("setup");
    expect(mocks.stripe.state.checkoutSessions[0].customer).toBe("cus_mock_1");
    expect(
        mocks.stripe.state.requests.find(
            (request) => request.path === "/v1/checkout/sessions",
        )?.body["payment_method_types[0]"],
    ).toBe("card");
});

test("GET /api/stripe/billing paginates invoices", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    mocks.stripe.state.customers.push(
        mockCustomer("cus_existing", "other@example.com"),
    );
    mocks.stripe.state.invoices.push(
        ...Array.from({ length: 25 }, (_, index) =>
            mockInvoice(`in_${index}`, "cus_existing", 10_000 - index, 1000),
        ),
    );

    const db = drizzle(env.DB);
    const [user] = await db
        .select({ id: userTable.id })
        .from(userTable)
        .limit(1);
    await db
        .update(userTable)
        .set({ stripeCustomerId: "cus_existing" })
        .where(eq(userTable.id, user.id));

    const firstResponse = await SELF.fetch(`${base}/billing`, {
        headers: { cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(firstResponse.status).toBe(200);
    const first = (await firstResponse.json()) as {
        invoices: { id: string }[];
        hasMoreInvoices: boolean;
        invoiceCursor: string;
    };
    expect(first.invoices).toHaveLength(8);
    expect(first.hasMoreInvoices).toBe(true);
    expect(
        mocks.stripe.state.requests.filter(
            (request) => request.path === "/v1/invoices",
        ),
    ).toHaveLength(1);

    const secondResponse = await SELF.fetch(
        `${base}/billing?invoice_cursor=${encodeURIComponent(first.invoiceCursor)}`,
        {
            headers: { cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(secondResponse.status).toBe(200);
    const second = (await secondResponse.json()) as {
        invoices: { id: string }[];
        hasMoreInvoices: boolean;
    };
    expect(second.invoices).toHaveLength(8);
    expect(second.hasMoreInvoices).toBe(true);
    expect(
        mocks.stripe.state.requests.filter(
            (request) => request.path === "/v1/invoices",
        ),
    ).toHaveLength(2);
});

test("POST /api/webhooks/stripe setup sessions set the default payment method", async ({
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    mocks.stripe.state.customers.push(
        mockCustomer("cus_setup", "test@example.com"),
    );
    mocks.stripe.state.paymentMethods.push(
        mockPaymentMethod("pm_setup", "cus_setup"),
    );
    mocks.stripe.state.setupIntents.push({
        id: "seti_setup",
        object: "setup_intent",
        payment_method: "pm_setup",
    });

    const payload = JSON.stringify({
        id: "evt_test_setup_checkout",
        type: "checkout.session.completed",
        livemode: false,
        data: {
            object: {
                id: "cs_test_setup",
                object: "checkout.session",
                mode: "setup",
                customer: "cus_setup",
                setup_intent: "seti_setup",
                metadata: { userId: "user_123" },
            },
        },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");

    const response = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": `t=${timestamp},v1=${signature}`,
            },
            body: payload,
        },
    );

    expect(response.status).toBe(200);
    expect(
        mocks.stripe.state.customers[0].invoice_settings.default_payment_method,
    ).toBe("pm_setup");
});

test("POST /api/webhooks/stripe setup sessions do not replace an existing default payment method", async ({
    mocks,
}) => {
    await mocks.enable("stripe", "tinybird");
    mocks.stripe.state.customers.push({
        ...mockCustomer("cus_setup", "test@example.com"),
        invoice_settings: { default_payment_method: "pm_existing" },
    });
    mocks.stripe.state.paymentMethods.push(
        mockPaymentMethod("pm_existing", "cus_setup"),
        mockPaymentMethod("pm_setup", "cus_setup"),
    );
    mocks.stripe.state.setupIntents.push({
        id: "seti_setup",
        object: "setup_intent",
        payment_method: "pm_setup",
    });

    const payload = JSON.stringify({
        id: "evt_test_setup_checkout_existing_default",
        type: "checkout.session.completed",
        livemode: false,
        data: {
            object: {
                id: "cs_test_setup",
                object: "checkout.session",
                mode: "setup",
                customer: "cus_setup",
                setup_intent: "seti_setup",
                metadata: { userId: "user_123" },
            },
        },
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");

    const response = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": `t=${timestamp},v1=${signature}`,
            },
            body: payload,
        },
    );

    expect(response.status).toBe(200);
    expect(
        mocks.stripe.state.customers[0].invoice_settings.default_payment_method,
    ).toBe("pm_existing");
    expect(
        mocks.stripe.state.requests.some(
            (request) =>
                request.method === "POST" &&
                request.path === "/v1/customers/cus_setup",
        ),
    ).toBe(false);
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

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET)
        .update(`${timestamp}.${payload}`, "utf8")
        .digest("hex");

    const response = await SELF.fetch(
        "http://localhost:3000/api/webhooks/stripe",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "stripe-signature": `t=${timestamp},v1=${signature}`,
                cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: payload,
        },
    );

    expect(response.status).toBe(200);

    const [updatedUser] = await db
        .select({ packBalance: userTable.packBalance })
        .from(userTable)
        .where(eq(userTable.id, user.id))
        .limit(1);

    expect(updatedUser?.packBalance).toBe(10);
});

function mockCustomer(id: string, email: string) {
    return {
        id,
        object: "customer" as const,
        email,
        name: "Test User",
        individual_name: "Test User",
        business_name: null,
        metadata: {},
        address: null,
        invoice_settings: { default_payment_method: null },
        deleted: false as const,
    };
}

function mockPaymentMethod(id: string, customer: string) {
    return {
        id,
        object: "payment_method" as const,
        type: "card" as const,
        customer,
        card: {
            brand: "visa",
            last4: "4242",
            exp_month: 12,
            exp_year: 2030,
        },
    };
}

function mockInvoice(
    id: string,
    customer: string,
    created: number,
    total: number,
) {
    return {
        id,
        object: "invoice" as const,
        customer,
        number: id.toUpperCase(),
        created,
        status: "paid",
        amount_due: total,
        amount_paid: total,
        total,
        currency: "usd",
        hosted_invoice_url: `https://invoice.stripe.test/${id}`,
        invoice_pdf: `https://invoice.stripe.test/${id}.pdf`,
    };
}

function billingProfilePayload(options?: { country?: string; taxId?: string }) {
    return {
        accountType: "company",
        name: "Test Contact",
        businessName: "Test Company",
        address: {
            line1: "Main Street 1",
            line2: "",
            city: "Tallinn",
            state: "",
            postalCode: "10145",
            country: options?.country ?? "DE",
        },
        taxId: { value: options?.taxId ?? "DE222222222" },
    };
}
