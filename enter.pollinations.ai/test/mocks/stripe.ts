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
    individual_name?: string | null;
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

type StripeTaxId = {
    id: string;
    object: "tax_id";
    customer: string;
    type: string;
    value: string;
    country: string;
    verification: {
        status: "pending" | "verified" | "unverified";
        verified_address: string | null;
        verified_name: string | null;
    };
};

type StripeInvoice = {
    id: string;
    object: "invoice";
    customer: string;
    number: string;
    created: number;
    status: string;
    amount_due: number;
    amount_paid: number;
    total: number;
    currency: string;
    hosted_invoice_url: string;
    invoice_pdf: string;
};

type StripeSetupIntent = {
    id: string;
    object: "setup_intent";
    payment_method: string | null;
};

type StripeCheckoutSession = {
    id: string;
    object: "checkout.session";
    mode: string;
    customer: string | null;
    url: string;
    setup_intent?: string | null;
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
    taxIds: StripeTaxId[];
    invoices: StripeInvoice[];
    setupIntents: StripeSetupIntent[];
    checkoutSessions: StripeCheckoutSession[];
    requests: StripeRequest[];
    customerCreateByIdempotencyKey: Record<string, string>;
    invalidAddressCountry: string | null;
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
                individual_name: form.get("individual_name") || null,
                business_name: form.get("business_name") || null,
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
        .get("/v1/customers/search", (c) => {
            recordRequest(c, state);
            const query = c.req.query("query") ?? "";
            const emailMatch = query.match(/email:'((?:\\'|[^'])*)'/);
            const email = emailMatch?.[1]?.replace(/\\'/g, "'") ?? "";
            const data = state.customers.filter(
                (customer) => customer.email === email,
            );
            return c.json({
                object: "search_result",
                data,
                has_more: false,
                url: "/v1/customers/search",
            });
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

            if (
                state.invalidAddressCountry &&
                form.get("address[country]") === state.invalidAddressCountry
            ) {
                return c.json(
                    {
                        error: {
                            type: "invalid_request_error",
                            message: "Invalid customer tax location.",
                            param: "address[country]",
                        },
                    },
                    400,
                );
            }

            customer.email = form.get("email") ?? customer.email;
            customer.name = form.get("name") ?? customer.name;
            customer.individual_name =
                form.get("individual_name") ?? customer.individual_name;
            customer.business_name =
                form.get("business_name") ?? customer.business_name;
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

            const address = parseAddress(form);
            if (address) customer.address = address;

            return c.json(customer);
        })
        .get("/v1/customers/:id/payment_methods", (c) => {
            recordRequest(c, state);
            const customerId = c.req.param("id");
            return c.json({
                object: "list",
                data: state.paymentMethods.filter(
                    (method) => method.customer === customerId,
                ),
                has_more: false,
                url: `/v1/customers/${customerId}/payment_methods`,
            });
        })
        .get("/v1/customers/:id/tax_ids", (c) => {
            recordRequest(c, state);
            const customerId = c.req.param("id");
            return c.json({
                object: "list",
                data: state.taxIds.filter(
                    (taxId) => taxId.customer === customerId,
                ),
                has_more: false,
                url: `/v1/customers/${customerId}/tax_ids`,
            });
        })
        .post("/v1/customers/:id/tax_ids", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const customerId = c.req.param("id");
            const taxId: StripeTaxId = {
                id: `txi_mock_${state.taxIds.length + 1}`,
                object: "tax_id",
                customer: customerId,
                type: form.get("type") ?? "eu_vat",
                value: form.get("value") ?? "",
                country: customerCountryFromTaxType(form.get("type") ?? ""),
                verification: {
                    status: verificationStatusForValue(form.get("value") ?? ""),
                    verified_address: null,
                    verified_name: null,
                },
            };
            state.taxIds.push(taxId);
            return c.json(taxId);
        })
        .delete("/v1/customers/:customerId/tax_ids/:taxId", (c) => {
            recordRequest(c, state);
            state.taxIds = state.taxIds.filter(
                (taxId) => taxId.id !== c.req.param("taxId"),
            );
            return c.json({
                id: c.req.param("taxId"),
                object: "tax_id",
                deleted: true,
            });
        })
        .get("/v1/invoices", (c) => {
            recordRequest(c, state);
            const customer = c.req.query("customer");
            const limit = Number(c.req.query("limit") ?? 10);
            const startingAfter = c.req.query("starting_after");
            const all = state.invoices
                .filter((invoice) => invoice.customer === customer)
                .sort((a, b) => b.created - a.created);
            const startIndex = startingAfter
                ? all.findIndex((invoice) => invoice.id === startingAfter) + 1
                : 0;
            const data = all.slice(startIndex, startIndex + limit);

            return c.json({
                object: "list",
                data,
                has_more: startIndex + limit < all.length,
                url: "/v1/invoices",
            });
        })
        .post("/v1/checkout/sessions", async (c) => {
            const form = await parseForm(c.req.raw);
            recordRequest(c, state, form);
            const mode = form.get("mode") ?? "payment";
            const session: StripeCheckoutSession = {
                id: `cs_mock_${state.checkoutSessions.length + 1}`,
                object: "checkout.session",
                mode,
                customer: form.get("customer"),
                url: `https://checkout.stripe.test/${state.checkoutSessions.length + 1}`,
                setup_intent:
                    mode === "setup"
                        ? `seti_mock_${state.setupIntents.length + 1}`
                        : null,
            };
            if (session.setup_intent) {
                state.setupIntents.push({
                    id: session.setup_intent,
                    object: "setup_intent",
                    payment_method: null,
                });
            }
            state.checkoutSessions.push(session);
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
        .post("/v1/payment_methods/:id/detach", (c) => {
            recordRequest(c, state);
            const method = state.paymentMethods.find(
                (paymentMethod) => paymentMethod.id === c.req.param("id"),
            );
            if (!method) return stripeNotFound(c);
            method.customer = null;
            return c.json(method);
        })
        .get("/v1/setup_intents/:id", (c) => {
            recordRequest(c, state);
            const setupIntent = state.setupIntents.find(
                (intent) => intent.id === c.req.param("id"),
            );
            if (!setupIntent) return stripeNotFound(c);
            return c.json(setupIntent);
        });

    return {
        state,
        reset: () => Object.assign(state, createInitialState()),
        handlerMap: {
            "api.stripe.com": createHonoMockHandler(stripeAPI),
        },
    };
}

function createInitialState(): MockStripeState {
    return {
        customers: [],
        paymentMethods: [],
        taxIds: [],
        invoices: [],
        setupIntents: [],
        checkoutSessions: [],
        requests: [],
        customerCreateByIdempotencyKey: {},
        invalidAddressCountry: null,
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

function parseAddress(form: URLSearchParams): StripeCustomer["address"] | null {
    const address = {
        line1: form.get("address[line1]"),
        line2: form.get("address[line2]"),
        city: form.get("address[city]"),
        state: form.get("address[state]"),
        postal_code: form.get("address[postal_code]"),
        country: form.get("address[country]"),
    };
    return Object.values(address).some((value) => value != null)
        ? address
        : null;
}

function findCustomer(
    state: MockStripeState,
    id: string,
): StripeCustomer | undefined {
    return state.customers.find((customer) => customer.id === id);
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

function verificationStatusForValue(
    value: string,
): StripeTaxId["verification"]["status"] {
    if (value.includes("000000000")) return "verified";
    if (value.includes("111111111")) return "unverified";
    return "pending";
}

function customerCountryFromTaxType(type: string): string {
    if (type === "gb_vat") return "GB";
    if (type === "us_ein") return "US";
    if (type === "ch_vat") return "CH";
    if (type === "no_vat") return "NO";
    return "DE";
}
