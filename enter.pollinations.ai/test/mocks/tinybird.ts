import { Hono } from "hono";
import type { SelectGenerationEvent } from "@/db/schema/event.ts";
import { createHonoMockHandler, type MockAPI } from "./fetch.ts";

type TinybirdGenerationEvent = Omit<
    SelectGenerationEvent,
    | "eventStatus"
    | "polarDeliveryAttempts"
    | "polarDeliveredAt"
    | "tinybirdDeliveryAttempts"
    | "tinybirdDeliveredAt"
    | "createdAt"
    | "updatedAt"
>;

export type MockTinybirdState = {
    events: TinybirdGenerationEvent[];
};

export function createMockTinybird(): MockAPI<MockTinybirdState> {
    const state: MockTinybirdState = {
        events: [],
    };

    const tinybirdAPI = new Hono().post("/v0/events", async (c) => {
        const eventName = c.req.query("name");
        if (eventName !== "generation_event") {
            throw new Error(
                "Failed to ingest mock tinybird events: wrong event name",
            );
        }
        const events: TinybirdGenerationEvent[] = parseNdjson(
            await c.req.text(),
        );
        // simulate failure if id starts with "simulate_error"
        if (
            events.find((event) => event.id.includes("simulate_tinybird_error"))
        ) {
            throw new Error(
                "Failed to ingest mock tinybird events: simulated error",
            );
        }
        state.events.push(...events);
        return c.json(
            {
                successful_rows: events.length,
                quarantined_rows: 0,
            },
            200,
        );
    });

    const handlerMap = {
        "localhost:7181": createHonoMockHandler(tinybirdAPI),
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

function parseNdjson(input: string): any[] {
    return input.split("\n").map((line) => JSON.parse(line));
}
