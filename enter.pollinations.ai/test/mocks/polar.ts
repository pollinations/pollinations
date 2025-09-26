import { Hono, HonoRequest } from "hono";
import type { MockHandlerMap } from "./fetch";
import { trimTrailingSlash } from "hono/trailing-slash";
import { createHonoMockHandler } from "./fetch";
import { SelectGenerationEvent } from "@/db/schema/event";
import { createMiddleware } from "hono/factory";

export type MockPolarState = {
    events: SelectGenerationEvent[];
};

export type MockAPI<TState> = {
    state: TState;
    handlerMap: MockHandlerMap;
    reset: () => void;
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
            const mockCustomer = {
                id: "fd5ea6ef-8df3-42da-99e3-9c02268c9e79",
                external_id: body.external_id || "",
                name: body.name,
                email: body.email,
                modified_at: null,
                metadata: {},
                email_verified: false,
                billing_address: null,
                tax_id: null,
                organization_id: "a9afc1b7-9439-45e1-af9b-d2bf4b972887",
                avatar_url: "",
                created_at: "2025-08-12T23:10:46.485361Z",
                deleted_at: null,
            };
            return c.json(mockCustomer, 201);
        })
        .get("/v1/customers/external/:id/state", async (c) => {
            console.log("GOT REQUEST");
            const id = c.req.param("id");
            const balance = id === "customer_without_balance" ? 0 : 100;
            return c.json(createMockCustomerState(id, { balance }), 200);
        })
        .post("/v1/events/ingest", async (c) => {
            const body: { events: SelectGenerationEvent[] } =
                await c.req.json();
            state.events.push(...body.events);
            return c.json({ inserted: body.events.length });
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
        id: "811451de-8494-4826-a278-67fc87ca8ebd",
        created_at: "2025-09-25T16:46:18.720Z",
        modified_at: "2025-09-25T16:46:18.739Z",
        meter_id: "776f38e7-d0a1-434f-90ef-6f31d66639d9",
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
        external_id: "VViqoCNewxFTneCGgg7OnWIMFVDVU9D2",
        email: "test@example.com",
        email_verified: false,
        name: "Test",
        billing_address: {
            line1: null,
            line2: null,
            postal_code: null,
            city: null,
            state: null,
            country: "AW",
        },
        tax_id: null,
        organization_id: "a9afc1b7-9439-45e1-af9b-d2bf4b972887",
        deleted_at: null,
        active_subscriptions: [],
        granted_benefits: [
            {
                id: "11ae1ab5-4749-42dc-af1e-388d86ce0e93",
                created_at: "2025-09-25T16:46:18.478Z",
                modified_at: "2025-09-25T16:46:18.488Z",
                granted_at: "2025-09-25T16:46:18.488Z",
                benefit_id: "f548982b-dd10-4eaf-ae01-840224134f5f",
                benefit_type: "meter_credit",
                benefit_metadata: {},
                properties: {},
            },
        ],
        active_meters: [createMockMeter(balance, creditedUnits)],
        avatar_url:
            "https://www.gravatar.com/avatar/ef38c6fd3fa2c2a4da5b80c6a2a852515bc23b0148ad1d722ca02aca1625604a?d=404",
    };
}
