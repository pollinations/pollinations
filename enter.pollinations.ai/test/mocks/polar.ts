import { Hono } from "hono";
import { createHonoMockHandler, type MockAPI } from "./fetch.ts";
import { SelectGenerationEvent } from "@/db/schema/event.ts";

export type MockPolarState = {
    events: SelectGenerationEvent[];
};

export function createMockPolar(): MockAPI<MockPolarState> {
    const state: MockPolarState = {
        events: [],
    };

    const polarAPI = new Hono()
        .get("/v1/customers", (c) => {
            return c.json({
                items: [],
                pagination: {
                    total_count: 0,
                    max_page: 0,
                },
            });
        })
        .post("/v1/customers", async (c) => {
            const body = await c.req.json();
            return c.json(createMockCustomer(body), 201);
        })
        .get("/v1/customers/external/:id/state", async (c) => {
            const id = c.req.param("id");
            const balance = id === "customer_without_balance" ? 0 : 100;
            return c.json(createMockCustomerState(id, { balance }), 200);
        })
        .get("/v1/events", async (c) => {
            return c.json({
                items: state.events,
                pagination: {
                    total_count: state.events.length,
                    max_page: 1,
                },
            });
        })
        .post("/v1/events/ingest", async (c) => {
            const body: { events: SelectGenerationEvent[] } =
                await c.req.json();
            state.events.push(...body.events);
            return c.json({ inserted: body.events.length });
        })
        .post("/v1/checkouts", async (c) => {
            return c.json(mockCheckoutSession, 201);
        })
        .post("/v1/customer-sessions", async (c) => {
            return c.json(mockCustomerSession, 201);
        });

    const handlerMap = {
        "sandbox-api.polar.sh": createHonoMockHandler(polarAPI),
    };

    const reset = () => {
        state.events = [];
    };

    return {
        state,
        reset,
        handlerMap,
    };
}

function createMockMeter(balance: number, creditedUnits: number = 10) {
    return {
        id: "test-meter-id-1234",
        created_at: "2025-09-25T16:46:18.720Z",
        modified_at: "2025-09-25T16:46:18.739Z",
        meter_id: "test-meter-id-5678",
        consumed_units: creditedUnits - balance,
        credited_units: creditedUnits,
        balance,
    };
}

function createMockCustomerState(
    id: string,
    options: {
        balance?: number;
        creditedUnits?: number;
    },
) {
    const balance = options.balance || 10;
    const creditedUnits = Math.max(balance, options.creditedUnits || 10);
    return {
        id,
        created_at: "2025-09-25T16:43:59.533Z",
        modified_at: "2025-09-25T16:46:15.017Z",
        metadata: {},
        external_id: "test-external-id-1234",
        email: "test@example.com",
        email_verified: false,
        name: "Test User",
        billing_address: {
            line1: null,
            line2: null,
            postal_code: null,
            city: null,
            state: null,
            country: "US",
        },
        tax_id: null,
        organization_id: "test-org-id-1234",
        deleted_at: null,
        active_subscriptions: [],
        granted_benefits: [
            {
                id: "test-benefit-grant-id-1234",
                created_at: "2025-09-25T16:46:18.478Z",
                modified_at: "2025-09-25T16:46:18.488Z",
                granted_at: "2025-09-25T16:46:18.488Z",
                benefit_id: "test-benefit-id-1234",
                benefit_type: "meter_credit",
                benefit_metadata: {},
                properties: {},
            },
        ],
        active_meters: [createMockMeter(balance, creditedUnits)],
        avatar_url:
            "https://www.gravatar.com/avatar/test-avatar-hash?d=404",
    };
}

function createMockCustomer(body: any) {
    return {
        id: "test-customer-id-1234",
        external_id: body.external_id || "",
        name: body.name,
        email: body.email,
        modified_at: null,
        metadata: {},
        email_verified: false,
        billing_address: null,
        tax_id: null,
        organization_id: "test-org-id-1234",
        avatar_url: "",
        created_at: "2025-08-12T23:10:46.485361Z",
        deleted_at: null,
    };
}

const mockCustomerSession = {
    created_at: "2025-10-26T00:00:44.221Z",
    modified_at: null,
    id: "test-session-id-1234",
    token: "test-session-token-1234",
    expires_at: "2025-10-26T01:00:44.221Z",
    customer_portal_url:
        "https://sandbox.polar.sh/test-org/portal?customer_session_token=test-session-token-1234&email=test%40example.com",
    customer_id: "test-customer-id-5678",
    customer: {
        id: "test-customer-id-5678",
        created_at: "2025-09-25T22:26:48.506Z",
        modified_at: "2025-09-25T23:36:19.958Z",
        metadata: {},
        external_id: "test-external-id-5678",
        email: "test@example.com",
        email_verified: false,
        name: "Test User",
        billing_address: {
            line1: null,
            line2: null,
            postal_code: null,
            city: null,
            state: null,
            country: "US",
        },
        tax_id: null,
        organization_id: "test-org-id-1234",
        deleted_at: null,
        avatar_url:
            "https://www.gravatar.com/avatar/test-avatar-hash?d=404",
    },
};

const mockCheckoutSession = {
    created_at: "2025-10-26T00:15:41.768Z",
    modified_at: null,
    id: "test-checkout-id-1234",
    custom_field_data: {},
    payment_processor: "stripe",
    status: "open",
    client_secret: "test-client-secret-1234",
    url: "https://sandbox.polar.sh/checkout/test-checkout-id-1234",
    expires_at: "2025-10-26T01:15:41.768Z",
    success_url: "http://localhost:3000/",
    embed_origin: null,
    amount: 1000,
    discount_amount: 0,
    net_amount: 1000,
    tax_amount: 0,
    total_amount: 1000,
    currency: "usd",
    product_id: "test-product-id-1234",
    product_price_id: "test-price-id-1234",
    discount_id: null,
    allow_discount_codes: true,
    require_billing_address: false,
    is_discount_applicable: true,
    is_free_product_price: false,
    is_payment_required: true,
    is_payment_setup_required: false,
    is_payment_form_required: true,
    customer_id: "test-customer-id-5678",
    is_business_customer: false,
    customer_name: "Test User",
    customer_email: "test@example.com",
    customer_ip_address: null,
    customer_billing_name: null,
    customer_billing_address: {
        line1: null,
        line2: null,
        postal_code: null,
        city: null,
        state: null,
        country: "US",
    },
    customer_tax_id: null,
    payment_processor_metadata: {
        publishable_key:
            "pk_test_1234567890abcdefghijklmnopqrstuvwxyz",
        customer_session_client_secret:
            "test-customer-session-secret-1234",
    },
    billing_address_fields: {
        country: "required",
        state: "disabled",
        city: "disabled",
        postal_code: "disabled",
        line1: "disabled",
        line2: "disabled",
    },
    metadata: {},
    external_customer_id: "test-external-id-5678",
    customer_external_id: "test-external-id-5678",
    products: [
        {
            created_at: "2025-08-28T16:18:57.365Z",
            modified_at: "2025-08-28T16:18:57.869Z",
            id: "test-product-id-1234",
            name: "Pollen Bundle Small",
            description: null,
            recurring_interval: null,
            is_recurring: false,
            is_archived: false,
            organization_id: "test-org-id-1234",
            prices: [
                {
                    created_at: "2025-08-28T16:18:57.370Z",
                    modified_at: "2025-08-28T16:18:57.876Z",
                    id: "test-price-id-1234",
                    amount_type: "fixed",
                    is_archived: false,
                    product_id: "test-product-id-1234",
                    type: "one_time",
                    recurring_interval: null,
                    price_currency: "usd",
                    price_amount: 1000,
                },
            ],
            benefits: [],
            medias: [],
        },
    ],
    product: {
        created_at: "2025-08-28T16:18:57.365Z",
        modified_at: "2025-08-28T16:18:57.869Z",
        id: "test-product-id-1234",
        name: "Pollen Bundle Small",
        description: null,
        recurring_interval: null,
        is_recurring: false,
        is_archived: false,
        organization_id: "test-org-id-1234",
        prices: [
            {
                created_at: "2025-08-28T16:18:57.370Z",
                modified_at: "2025-08-28T16:18:57.876Z",
                id: "test-price-id-1234",
                amount_type: "fixed",
                is_archived: false,
                product_id: "test-product-id-1234",
                type: "one_time",
                recurring_interval: null,
                price_currency: "usd",
                price_amount: 1000,
            },
        ],
        benefits: [],
        medias: [],
    },
    product_price: {
        created_at: "2025-08-28T16:18:57.370Z",
        modified_at: "2025-08-28T16:18:57.876Z",
        id: "test-price-id-1234",
        amount_type: "fixed",
        is_archived: false,
        product_id: "test-product-id-1234",
        type: "one_time",
        recurring_interval: null,
        price_currency: "usd",
        price_amount: 1000,
    },
    discount: null,
    subscription_id: null,
    attached_custom_fields: [],
    customer_metadata: {},
};
