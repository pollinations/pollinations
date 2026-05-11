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
    business_name?: string | null;
    metadata: Record<string, string>;
    address: {
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postal_code?: string | null;
        country?: string | null;
    } | null;
    invoice_settings: {
        default_payment_method: string | null;
    };
    deleted?: boolean;
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
    billing_details?: {
        name?: string | null;
        email?: string | null;
        address?: {
            line1?: string | null;
            line2?: string | null;
            city?: string | null;
            state?: string | null;
            postal_code?: string | null;
            country?: string | null;
        } | null;
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
    configuration: string | null;
    url: string;
};

type StripePortalConfiguration = {
    id: string;
    object: "billing_portal.configuration";
    active: boolean;
    is_default: boolean;
    metadata: Record<string, string>;
    name: string | null;
    default_return_url: string | null;
    business_profile: {
        headline: string | null;
    };
    features: {
        customer_update: {
            enabled: boolean;
            allowed_updates: string[];
        };
        invoice_history: {
            enabled: boolean;
        };
        payment_method_update: {
            enabled: boolean;
            payment_method_configuration?: string | null;
        };
    };
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

type StripeInvoicePayment = {
    id: string;
    object: "invoice_payment";
    invoice: string;
    amount_paid: number | null;
    amount_requested: number;
    currency: string;
    is_default: boolean;
    livemode: boolean;
    payment: {
        type: "payment_intent";
        payment_intent: string;
    };
    status: string;
};

type StripePaymentIntent = {
    id: string;
    object: "payment_intent";
    status: string;
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
    portalConfigurations: StripePortalConfiguration[];
    invoices: StripeInvoice[];
    invoicePayments: StripeInvoicePayment[];
    paymentIntents: StripePaymentIntent[];
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
                configuration: form.get("configuration"),
                url: `https://billing.stripe.test/${state.portalSessions.length + 1}`,
            };
            state.portalSessions.push(session);
            return c.json(session);
        })
        .get("/v1/billing_portal/configurations", (c) => {
            recordRequest(c, state);
            const active = c.req.query("active");
            const isDefault = c.req.query("is_default");
            const configurations = state.portalConfigurations.filter(
                (configuration) => {
                    if (active != null) {
                        return configuration.active === (active === "true");
                    }
                    if (isDefault != null) {
                        return (
                            configuration.is_default === (isDefault === "true")
                        );
                    }
                    return true;
                },
            );

            return c.json({
                object: "list",
                url: "/v1/billing_portal/configurations",
                has_more: false,
                data: configurations,
            });
        })
        .post("/v1/billing_portal/configurations", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);

            const configuration = createPortalConfiguration(
                `bpc_mock_${state.portalConfigurations.length + 1}`,
                form,
            );
            state.portalConfigurations.push(configuration);
            return c.json(configuration);
        })
        .post("/v1/billing_portal/configurations/:id", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);

            const configuration = state.portalConfigurations.find(
                (item) => item.id === c.req.param("id"),
            );
            if (!configuration) return stripeNotFound(c);

            applyPortalConfigurationUpdate(configuration, form);
            return c.json(configuration);
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
        .get("/v1/invoices/:id", (c) => {
            recordRequest(c, state);
            const invoice = findInvoice(state, c.req.param("id"));
            if (!invoice) return stripeNotFound(c);
            return c.json(invoice);
        })
        .delete("/v1/invoices/:id", (c) => {
            recordRequest(c, state);
            const invoice = findInvoice(state, c.req.param("id"));
            if (!invoice) return stripeNotFound(c);
            if (invoice.status !== "draft") return stripeInvalidRequest(c);
            state.invoices = state.invoices.filter(
                (item) => item.id !== invoice.id,
            );
            return c.json({
                id: invoice.id,
                object: "invoice",
                deleted: true,
            });
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
        .post("/v1/invoices/:id/void", (c) => {
            recordRequest(c, state);
            const invoice = findInvoice(state, c.req.param("id"));
            if (!invoice) return stripeNotFound(c);
            if (invoice.status !== "open") return stripeInvalidRequest(c);
            invoice.status = "void";
            return c.json(invoice);
        })
        .post("/v1/invoices/:id/pay", (c) => {
            recordRequest(c, state);
            const invoice = findInvoice(state, c.req.param("id"));
            if (!invoice) return stripeNotFound(c);
            invoice.status = "paid";
            invoice.amount_paid = invoice.amount_due;
            const paymentIntent: StripePaymentIntent = {
                id: `pi_mock_${state.paymentIntents.length + 1}`,
                object: "payment_intent",
                status: "succeeded",
            };
            state.paymentIntents.push(paymentIntent);
            state.invoicePayments.push({
                id: `inpay_mock_${state.invoicePayments.length + 1}`,
                object: "invoice_payment",
                invoice: invoice.id,
                amount_paid: invoice.amount_paid,
                amount_requested: invoice.amount_due,
                currency: invoice.currency,
                is_default: true,
                livemode: false,
                payment: {
                    type: "payment_intent",
                    payment_intent: paymentIntent.id,
                },
                status: "paid",
            });
            return c.json(invoice);
        })
        .get("/v1/invoice_payments", (c) => {
            recordRequest(c, state);
            const invoiceId = c.req.query("invoice");
            const data = state.invoicePayments.filter(
                (payment) => !invoiceId || payment.invoice === invoiceId,
            );
            return c.json({
                object: "list",
                url: "/v1/invoice_payments",
                has_more: false,
                data,
            });
        })
        .get("/v1/payment_intents/:id", (c) => {
            recordRequest(c, state);
            const paymentIntent = state.paymentIntents.find(
                (item) => item.id === c.req.param("id"),
            );
            if (!paymentIntent) return stripeNotFound(c);
            return c.json(paymentIntent);
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
        business_name: null,
        metadata: {},
        address: { country: "US", postal_code: "94105" },
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
        billing_details: {
            name: "Test User",
            email: "test@example.com",
            address: null,
        },
    };
}

function createInitialState(): MockStripeState {
    return {
        customers: [],
        paymentMethods: [],
        checkoutSessions: [],
        portalSessions: [],
        portalConfigurations: [],
        invoices: [],
        invoicePayments: [],
        paymentIntents: [],
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

function createPortalConfiguration(
    id: string,
    form: URLSearchParams,
): StripePortalConfiguration {
    return {
        id,
        object: "billing_portal.configuration",
        active: true,
        is_default: false,
        metadata: parseMetadata(form),
        name: form.get("name"),
        default_return_url: form.get("default_return_url"),
        business_profile: parsePortalBusinessProfile(form),
        features: parsePortalConfigurationFeatures(form),
    };
}

function applyPortalConfigurationUpdate(
    configuration: StripePortalConfiguration,
    form: URLSearchParams,
): void {
    configuration.metadata = {
        ...configuration.metadata,
        ...parseMetadata(form),
    };
    configuration.name = form.get("name") ?? configuration.name;
    configuration.default_return_url =
        form.get("default_return_url") ?? configuration.default_return_url;
    configuration.business_profile = parsePortalBusinessProfile(
        form,
        configuration.business_profile,
    );
    configuration.features = parsePortalConfigurationFeatures(
        form,
        configuration.features,
    );
}

function parsePortalBusinessProfile(
    form: URLSearchParams,
    previous?: StripePortalConfiguration["business_profile"],
): StripePortalConfiguration["business_profile"] {
    return {
        headline:
            form.get("business_profile[headline]") ??
            previous?.headline ??
            null,
    };
}

function parsePortalConfigurationFeatures(
    form: URLSearchParams,
    previous?: StripePortalConfiguration["features"],
): StripePortalConfiguration["features"] {
    return {
        customer_update: {
            enabled:
                parseBoolean(form.get("features[customer_update][enabled]")) ??
                previous?.customer_update.enabled ??
                false,
            allowed_updates:
                parseArray(
                    form,
                    "features[customer_update][allowed_updates]",
                ) ??
                previous?.customer_update.allowed_updates ??
                [],
        },
        invoice_history: {
            enabled:
                parseBoolean(form.get("features[invoice_history][enabled]")) ??
                previous?.invoice_history.enabled ??
                false,
        },
        payment_method_update: {
            enabled:
                parseBoolean(
                    form.get("features[payment_method_update][enabled]"),
                ) ??
                previous?.payment_method_update.enabled ??
                false,
            payment_method_configuration:
                form.get(
                    "features[payment_method_update][payment_method_configuration]",
                ) ??
                previous?.payment_method_update.payment_method_configuration ??
                null,
        },
    };
}

function parseArray(
    form: URLSearchParams,
    prefix: string,
): string[] | undefined {
    const values: string[] = [];
    for (const [key, value] of form.entries()) {
        if (key === `${prefix}[]` || key.startsWith(`${prefix}[`)) {
            values.push(value);
        }
    }
    return values.length ? values : undefined;
}

function parseBoolean(value: string | null): boolean | undefined {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
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

function stripeInvalidRequest(c: Context) {
    return c.json(
        {
            error: {
                type: "invalid_request_error",
                message: "Invalid request",
            },
        },
        400,
    );
}
