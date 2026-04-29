import {
    createHonoMockHandler,
    type MockAPI,
} from "@shared/test/mocks/fetch.ts";
import { type Context, Hono } from "hono";

type StripeCustomer = {
    id: string;
    object: "customer";
    email: string | null;
    name: string | null;
    metadata: Record<string, string>;
    address: {
        country?: string | null;
    } | null;
    invoice_settings: {
        default_payment_method: string | null;
    };
    deleted?: false;
};

type StripePaymentMethod = {
    id: string;
    object: "payment_method";
    type: "card";
    customer: string | null;
    card: {
        brand: string;
        last4: string;
        exp_month: number;
        exp_year: number;
    };
};

type StripeCheckoutSession = {
    id: string;
    object: "checkout.session";
    mode: string;
    customer: string | null;
    url: string;
};

type StripePortalSession = {
    id: string;
    object: "billing_portal.session";
    customer: string | null;
    url: string;
};

type StripeInvoice = {
    id: string;
    object: "invoice";
    customer: string | null;
    status: string;
    amount_due: number;
    amount_paid: number;
    currency: string;
    metadata: Record<string, string>;
};

type StripeRequest = {
    method: string;
    path: string;
    body: Record<string, string>;
    idempotencyKey: string | null;
};

export type MockStripeState = {
    customers: StripeCustomer[];
    paymentMethods: StripePaymentMethod[];
    checkoutSessions: StripeCheckoutSession[];
    portalSessions: StripePortalSession[];
    invoices: StripeInvoice[];
    requests: StripeRequest[];
    customerCreateByIdempotencyKey: Record<string, string>;
};

export function createMockStripe(): MockAPI<MockStripeState> {
    const state: MockStripeState = createInitialState();

    const stripeAPI = new Hono()
        .post("/v1/customers", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const idempotencyKey = c.req.header("idempotency-key");

            if (idempotencyKey) {
                const existingId =
                    state.customerCreateByIdempotencyKey[idempotencyKey];
                const existing = state.customers.find(
                    (customer) => customer.id === existingId,
                );
                if (existing) return c.json(existing);
            }

            const customer: StripeCustomer = {
                id: `cus_mock_${state.customers.length + 1}`,
                object: "customer",
                email: form.get("email") || null,
                name: form.get("name") || null,
                metadata: parseMetadata(form),
                address: null,
                invoice_settings: { default_payment_method: null },
                deleted: false,
            };
            state.customers.push(customer);

            if (idempotencyKey) {
                state.customerCreateByIdempotencyKey[idempotencyKey] =
                    customer.id;
            }

            return c.json(customer);
        })
        .get("/v1/customers/:id", (c) => {
            recordRequest(c, state);
            const customer = findCustomer(state, c.req.param("id"));
            if (!customer) return stripeNotFound(c);
            return c.json(customer);
        })
        .post("/v1/customers/:id", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const customer = findCustomer(state, c.req.param("id"));
            if (!customer) return stripeNotFound(c);

            customer.email = form.get("email") ?? customer.email;
            customer.name = form.get("name") ?? customer.name;
            customer.metadata = {
                ...customer.metadata,
                ...parseMetadata(form),
            };
            const defaultPaymentMethod = form.get(
                "invoice_settings[default_payment_method]",
            );
            if (defaultPaymentMethod) {
                customer.invoice_settings.default_payment_method =
                    defaultPaymentMethod;
            }
            const country = form.get("address[country]");
            if (country) customer.address = { country };

            return c.json(customer);
        })
        .post("/v1/checkout/sessions", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const session: StripeCheckoutSession = {
                id: `cs_mock_${state.checkoutSessions.length + 1}`,
                object: "checkout.session",
                mode: form.get("mode") ?? "payment",
                customer: form.get("customer"),
                url: `https://checkout.stripe.test/${state.checkoutSessions.length + 1}`,
            };
            state.checkoutSessions.push(session);
            return c.json(session);
        })
        .post("/v1/billing_portal/sessions", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const session: StripePortalSession = {
                id: `bps_mock_${state.portalSessions.length + 1}`,
                object: "billing_portal.session",
                customer: form.get("customer"),
                url: `https://billing.stripe.test/${state.portalSessions.length + 1}`,
            };
            state.portalSessions.push(session);
            return c.json(session);
        })
        .get("/v1/payment_methods/:id", (c) => {
            recordRequest(c, state);
            const method = state.paymentMethods.find(
                (paymentMethod) => paymentMethod.id === c.req.param("id"),
            );
            if (!method) return stripeNotFound(c);
            return c.json(method);
        })
        .post("/v1/invoices", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const invoice: StripeInvoice = {
                id: `in_mock_${state.invoices.length + 1}`,
                object: "invoice",
                customer: form.get("customer"),
                status: "draft",
                amount_due: 0,
                amount_paid: 0,
                currency: "usd",
                metadata: parseMetadata(form),
            };
            state.invoices.push(invoice);
            return c.json(invoice);
        })
        .post("/v1/invoiceitems", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const invoice = state.invoices.find(
                (item) => item.id === form.get("invoice"),
            );
            if (invoice) {
                invoice.amount_due += Number(form.get("amount") ?? 0);
            }
            return c.json({
                id: "ii_mock_1",
                object: "invoiceitem",
                invoice: form.get("invoice"),
            });
        })
        .post("/v1/invoices/:id/finalize", (c) => {
            recordRequest(c, state);
            const invoice = findInvoice(state, c.req.param("id"));
            if (!invoice) return stripeNotFound(c);
            invoice.status = "open";
            return c.json(invoice);
        })
        .post("/v1/invoices/:id/pay", (c) => {
            recordRequest(c, state);
            const invoice = findInvoice(state, c.req.param("id"));
            if (!invoice) return stripeNotFound(c);
            invoice.status = "paid";
            invoice.amount_paid = invoice.amount_due;
            return c.json(invoice);
        });

    return {
        state,
        reset: () => Object.assign(state, createInitialState()),
        handlerMap: {
            "api.stripe.com": createHonoMockHandler(stripeAPI),
        },
    };
}

export function mockCustomer(
    id: string,
    email = "test@example.com",
): StripeCustomer {
    return {
        id,
        object: "customer",
        email,
        name: "Test User",
        metadata: {},
        address: { country: "US" },
        invoice_settings: { default_payment_method: null },
        deleted: false,
    };
}

export function mockCardPaymentMethod(
    id: string,
    customer: string,
): StripePaymentMethod {
    return {
        id,
        object: "payment_method",
        type: "card",
        customer,
        card: {
            brand: "visa",
            last4: "4242",
            exp_month: 12,
            exp_year: 2030,
        },
    };
}

function createInitialState(): MockStripeState {
    return {
        customers: [],
        paymentMethods: [],
        checkoutSessions: [],
        portalSessions: [],
        invoices: [],
        requests: [],
        customerCreateByIdempotencyKey: {},
    };
}

async function parseForm(request: Request): Promise<URLSearchParams> {
    return new URLSearchParams(await request.text());
}

function recordRequest(
    c: Context,
    state: MockStripeState,
    form?: URLSearchParams,
): void {
    state.requests.push({
        method: c.req.raw.method,
        path: new URL(c.req.url).pathname,
        body: form ? Object.fromEntries(form.entries()) : {},
        idempotencyKey: c.req.header("idempotency-key") ?? null,
    });
}

function parseMetadata(form: URLSearchParams): Record<string, string> {
    const metadata: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
        const match = key.match(/^metadata\[([^\]]+)\]$/);
        if (match?.[1]) metadata[match[1]] = value;
    }
    return metadata;
}

function findCustomer(
    state: MockStripeState,
    id: string,
): StripeCustomer | undefined {
    return state.customers.find((customer) => customer.id === id);
}

function findInvoice(
    state: MockStripeState,
    id: string,
): StripeInvoice | undefined {
    return state.invoices.find((invoice) => invoice.id === id);
}

function stripeNotFound(c: Context) {
    return c.json(
        {
            error: {
                type: "invalid_request_error",
                message: "No such object",
            },
        },
        404,
    );
}
