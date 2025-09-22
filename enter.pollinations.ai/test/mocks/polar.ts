import { Hono } from "hono";
import { appendTrailingSlash } from "hono/trailing-slash";
import type { MockHandlerMap } from "./fetch";
import { createHonoMockHandler } from "./fetch";
import { SelectPolarEvent } from "@/db/schema/event";

export type MockPolarState = {
    events: SelectPolarEvent[];
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

    const polarAPI = new Hono();
    polarAPI.use("*", appendTrailingSlash());
    polarAPI.get("/v1/customers/", (c) => {
        return c.json({
            items: [],
            pagination: {
                total_count: 0,
                max_page: 0,
            },
        });
    });
    polarAPI.post("/v1/customers/", async (c) => {
        const body = await c.req.json();
        const mockCustomer = {
            id: "fd5ea6ef-8df3-42da-99e3-9c02268c9e79",
            external_id: body.external_id,
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
    });
    polarAPI.post("/v1/events/ingest", async (c) => {
        const body: { events: SelectPolarEvent[] } = await c.req.json();
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
