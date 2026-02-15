import { Hono } from "hono";
import { createHonoMockHandler, type MockAPI } from "./fetch.ts";
import { PolarEvent } from "@/events.ts";

export type MockPolarState = {
    events: PolarEvent[];
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
        .get("/v1/customer-meters", async (c) => {
            const externalCustomerId = c.req.query("external_customer_id");
            return c.json({
                items: createMockCustomerMeters(externalCustomerId || ""),
                pagination: {
                    total_count: 2,
                    max_page: 1,
                },
            });
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
            const body: { events: PolarEvent[] } = await c.req.json();
            if (
                body.events.find((event) =>
                    event.metadata.eventId.includes("simulate_polar_error"),
                )
            ) {
                throw new Error(
                    "Failed to ingest mock polar events: simulated error",
                );
            }
            state.events.push(...body.events);
            return c.json({ inserted: body.events.length });
        })
        .post("/v1/checkouts", async (c) => {
            return c.json(mockCheckoutSession, 201);
        })
        .post("/v1/customer-sessions", async (c) => {
            return c.json(mockCustomerSession, 201);
        })
        .get("/v1/products", async (c) => {
            return c.json(
                {
                    items: mockPackProducts,
                    pagination: {
                        total_count: mockPackProducts.length,
                        max_page: 1,
                    },
                },
                200,
            );
        });

    const handlerMap = {
        "sandbox-api.polar.sh": createHonoMockHandler(polarAPI),
        "api.polar.sh": createHonoMockHandler(polarAPI),
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
        avatar_url: "https://www.gravatar.com/avatar/test-avatar-hash?d=404",
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
    return_url: "http://localhost:3000/",
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
        avatar_url: "https://www.gravatar.com/avatar/test-avatar-hash?d=404",
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
    return_url: "http://localhost:3000/",
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
        publishable_key: "pk_test_1234567890abcdefghijklmnopqrstuvwxyz",
        customer_session_client_secret: "test-customer-session-secret-1234",
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
    organization_id: "test-org-id-1234",
    active_trial_interval: "month",
    active_trial_interval_count: 0,
    trial_end: null,
    trial_interval: "month",
    trial_interval_count: 0,
    allow_trial: false,
    prices: {},
    products: [
        {
            created_at: "2025-08-28T16:18:57.365Z",
            modified_at: "2025-08-28T16:18:57.869Z",
            id: "test-product-id-1234",
            name: "Pollen Bundle Small",
            description: null,
            recurring_interval: null,
            recurring_interval_count: 0,
            trial_interval: "month",
            trial_interval_count: 0,
            is_recurring: false,
            is_archived: false,
            organization_id: "test-org-id-1234",
            allow_trial: false,
            prices: [
                {
                    created_at: "2025-08-28T16:18:57.370Z",
                    modified_at: "2025-08-28T16:18:57.876Z",
                    id: "test-price-id-1234",
                    source: "catalog",
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
        recurring_interval_count: 0,
        trial_interval: "month",
        trial_interval_count: 0,
        is_recurring: false,
        is_archived: false,
        organization_id: "test-org-id-1234",
        allow_trial: false,
        prices: [
            {
                created_at: "2025-08-28T16:18:57.370Z",
                modified_at: "2025-08-28T16:18:57.876Z",
                id: "test-price-id-1234",
                source: "catalog",
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
        source: "catalog",
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

function createMockCustomerMeters(externalCustomerId: string) {
    return [
        {
            id: "test-meter-balance-id-1",
            created_at: "2025-11-06T21:09:03.383Z",
            modified_at: "2025-11-07T21:37:00.582Z",
            customer_id: "test-customer-id-1234",
            meter_id: "test-meter-id-pack",
            consumed_units: 431.1552567399807,
            credited_units: 705,
            balance: 10,
            customer: {
                id: "test-customer-id-1234",
                created_at: "2025-11-04T12:42:09.692Z",
                modified_at: "2025-11-07T21:37:00.586Z",
                metadata: {},
                external_id: externalCustomerId,
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
            meter: {
                metadata: { slug: "v1:meter:pack", priority: 100 },
                created_at: "2025-11-06T20:02:13.163Z",
                modified_at: "2025-11-07T21:35:10.825Z",
                id: "test-meter-id-pack",
                name: "Usage (pack)",
                filter: {
                    conjunction: "and",
                    clauses: [
                        {
                            conjunction: "or",
                            clauses: [
                                {
                                    property: "name",
                                    operator: "eq",
                                    value: "generate.text",
                                },
                                {
                                    property: "name",
                                    operator: "eq",
                                    value: "generate.image",
                                },
                            ],
                        },
                        {
                            property: "selectedMeterSlug",
                            operator: "eq",
                            value: "v1:meter:pack",
                        },
                    ],
                },
                aggregation: { func: "sum", property: "totalPrice" },
                organization_id: "test-org-id-1234",
                archived_at: null,
            },
        },
        {
            id: "test-meter-balance-id-2",
            created_at: "2025-11-06T22:31:34.828Z",
            modified_at: "2025-11-07T16:07:00.687Z",
            customer_id: "test-customer-id-1234",
            meter_id: "test-meter-id-tier",
            consumed_units: 5.0,
            credited_units: 100,
            balance: 10.0,
            customer: {
                id: "test-customer-id-1234",
                created_at: "2025-11-04T12:42:09.692Z",
                modified_at: "2025-11-07T21:37:00.586Z",
                metadata: {},
                external_id: externalCustomerId,
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
            meter: {
                metadata: { slug: "v1:meter:tier", priority: 200 },
                created_at: "2025-11-06T20:00:14.214Z",
                modified_at: "2025-11-07T21:35:11.035Z",
                id: "test-meter-id-tier",
                name: "Usage (tier)",
                filter: {
                    conjunction: "and",
                    clauses: [
                        {
                            conjunction: "or",
                            clauses: [
                                {
                                    property: "name",
                                    operator: "eq",
                                    value: "generate.text",
                                },
                                {
                                    property: "name",
                                    operator: "eq",
                                    value: "generate.image",
                                },
                            ],
                        },
                        {
                            property: "selectedMeterSlug",
                            operator: "eq",
                            value: "v1:meter:tier",
                        },
                    ],
                },
                aggregation: { func: "sum", property: "totalPrice" },
                organization_id: "test-org-id-1234",
                archived_at: null,
            },
        },
    ];
}

const mockPackProducts = [
    {
        "id": "a34a0c8d-fc8f-4dd2-b53a-ddd91428d3cb",
        "created_at": "2025-11-15T00:15:45.806Z",
        "modified_at": "2025-11-15T00:15:46.176Z",
        "trial_interval": null,
        "trial_interval_count": null,
        "name": "🐝 5 pollen + 5 FREE",
        "description":
            "We're still in beta, and we want to thank you for trying our services!\nThe product isn't perfect yet, so for now you get twice the Pollen with every pollen you buy.\nWe hope it helps you create more, explore more, and tell us what feels off.\n\nIf you want to share feedback, ideas, or bugs, come hang out with us on Discord — we're listening. 💬 https://discord.gg/pollinations-ai-885844321461485618",
        "recurring_interval": null,
        "recurring_interval_count": null,
        "is_recurring": false,
        "is_archived": false,
        "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
        "metadata": {
            "slug": "v1:product:pack:5x2",
        },
        "prices": [
            {
                "created_at": "2025-11-15T00:15:45.811Z",
                "modified_at": "2025-11-15T00:15:46.181Z",
                "id": "a6151520-171f-4f73-8343-647ebce9f2e4",
                "source": "catalog",
                "amount_type": "fixed",
                "is_archived": false,
                "product_id": "a34a0c8d-fc8f-4dd2-b53a-ddd91428d3cb",
                "type": "one_time",
                "recurring_interval": null,
                "price_currency": "usd",
                "price_amount": 500,
            },
        ],
        "benefits": [
            {
                "id": "9d816b11-0323-4b0c-b44b-10e52b6817b8",
                "created_at": "2025-11-15T00:05:33.522Z",
                "modified_at": null,
                "type": "meter_credit",
                "description": "5x2 pollen",
                "selectable": true,
                "deletable": true,
                "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
                "metadata": {},
                "properties": {
                    "units": 10,
                    "rollover": true,
                    "meter_id": "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
                },
            },
        ],
        "medias": [],
        "attached_custom_fields": [],
    },
    {
        "id": "c7f8d94c-d55d-4744-85bf-8d3a7ffca92f",
        "created_at": "2025-11-15T00:13:49.448Z",
        "modified_at": "2025-11-15T00:13:49.811Z",
        "trial_interval": null,
        "trial_interval_count": null,
        "name": "🐝 50 pollen + 50 FREE",
        "description":
            "We're still in beta, and we want to thank you for trying our services!\nThe product isn't perfect yet, so for now you get twice the Pollen with every pollen you buy.\nWe hope it helps you create more, explore more, and tell us what feels off.\n\nIf you want to share feedback, ideas, or bugs, come hang out with us on Discord — we're listening. 💬 https://discord.gg/pollinations-ai-885844321461485618",
        "recurring_interval": null,
        "recurring_interval_count": null,
        "is_recurring": false,
        "is_archived": false,
        "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
        "metadata": {
            "slug": "v1:product:pack:50x2",
        },
        "prices": [
            {
                "created_at": "2025-11-15T00:13:49.456Z",
                "modified_at": "2025-11-15T00:13:49.819Z",
                "id": "cec04e58-29cc-4900-97f4-cc91c134d381",
                "source": "catalog",
                "amount_type": "fixed",
                "is_archived": false,
                "product_id": "c7f8d94c-d55d-4744-85bf-8d3a7ffca92f",
                "type": "one_time",
                "recurring_interval": null,
                "price_currency": "usd",
                "price_amount": 5000,
            },
        ],
        "benefits": [
            {
                "id": "694c0ddd-027a-4384-b6fe-adba1460cf64",
                "created_at": "2025-11-15T00:08:11.045Z",
                "modified_at": null,
                "type": "meter_credit",
                "description": "50x2 pollen",
                "selectable": true,
                "deletable": true,
                "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
                "metadata": {},
                "properties": {
                    "units": 100,
                    "rollover": true,
                    "meter_id": "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
                },
            },
        ],
        "medias": [],
        "attached_custom_fields": [],
    },
    {
        "id": "97cddb45-634f-4384-9e41-2fabca3c4fbf",
        "created_at": "2025-11-15T00:12:55.703Z",
        "modified_at": "2025-11-15T00:12:56.087Z",
        "trial_interval": null,
        "trial_interval_count": null,
        "name": "🐝 20 pollen + 20 FREE",
        "description":
            "We're still in beta, and we want to thank you for trying our services!\nThe product isn't perfect yet, so for now you get twice the Pollen with every pollen you buy.\nWe hope it helps you create more, explore more, and tell us what feels off.\n\nIf you want to share feedback, ideas, or bugs, come hang out with us on Discord — we're listening. 💬 https://discord.gg/pollinations-ai-885844321461485618",
        "recurring_interval": null,
        "recurring_interval_count": null,
        "is_recurring": false,
        "is_archived": false,
        "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
        "metadata": {
            "slug": "v1:product:pack:20x2",
        },
        "prices": [
            {
                "created_at": "2025-11-15T00:12:55.708Z",
                "modified_at": "2025-11-15T00:12:56.091Z",
                "id": "472f813f-7c8c-488f-a79e-2ee55d778b6d",
                "source": "catalog",
                "amount_type": "fixed",
                "is_archived": false,
                "product_id": "97cddb45-634f-4384-9e41-2fabca3c4fbf",
                "type": "one_time",
                "recurring_interval": null,
                "price_currency": "usd",
                "price_amount": 2000,
            },
        ],
        "benefits": [
            {
                "id": "0724b49e-09d7-4d3d-9dfe-54394e93e8a1",
                "created_at": "2025-11-15T00:07:24.646Z",
                "modified_at": null,
                "type": "meter_credit",
                "description": "20x2 pollen",
                "selectable": true,
                "deletable": true,
                "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
                "metadata": {},
                "properties": {
                    "units": 40,
                    "rollover": true,
                    "meter_id": "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
                },
            },
        ],
        "medias": [],
        "attached_custom_fields": [],
    },
    {
        "id": "164ad1b8-6c4a-414e-9096-c9ca8608dfe3",
        "created_at": "2025-11-15T00:11:44.088Z",
        "modified_at": "2025-11-15T00:11:44.447Z",
        "trial_interval": null,
        "trial_interval_count": null,
        "name": "🐝 10 pollen + 10 FREE",
        "description":
            "We're still in beta, and we want to thank you for trying our services!\nThe product isn't perfect yet, so for now you get twice the Pollen with every pollen you buy.\nWe hope it helps you create more, explore more, and tell us what feels off.\n\nIf you want to share feedback, ideas, or bugs, come hang out with us on Discord — we're listening. 💬 https://discord.gg/pollinations-ai-885844321461485618",
        "recurring_interval": null,
        "recurring_interval_count": null,
        "is_recurring": false,
        "is_archived": false,
        "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
        "metadata": {
            "slug": "v1:product:pack:10x2",
        },
        "prices": [
            {
                "created_at": "2025-11-15T00:11:44.093Z",
                "modified_at": "2025-11-15T00:11:44.453Z",
                "id": "e06f9bf9-8743-4d8b-bf0f-5ae5b7a1a0e6",
                "source": "catalog",
                "amount_type": "fixed",
                "is_archived": false,
                "product_id": "164ad1b8-6c4a-414e-9096-c9ca8608dfe3",
                "type": "one_time",
                "recurring_interval": null,
                "price_currency": "usd",
                "price_amount": 1000,
            },
        ],
        "benefits": [
            {
                "id": "57792a58-bf5d-4609-bd27-3f05d3ae7592",
                "created_at": "2025-11-15T00:07:04.972Z",
                "modified_at": "2025-11-15T00:07:38.177Z",
                "type": "meter_credit",
                "description": "10x2 pollen",
                "selectable": true,
                "deletable": true,
                "organization_id": "1b7f21f3-286c-4801-b1b9-7e69583d09fd",
                "metadata": {},
                "properties": {
                    "units": 20,
                    "rollover": true,
                    "meter_id": "9bd156bb-2f2e-4e25-b1c0-1308c076c365",
                },
            },
        ],
        "medias": [],
        "attached_custom_fields": [],
    },
];
