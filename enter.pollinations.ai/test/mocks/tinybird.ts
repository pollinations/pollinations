import { Hono } from "hono";
import { trimTrailingSlash } from "hono/trailing-slash";
import type { MockHandlerMap } from "./fetch";
import { createHonoMockHandler } from "./fetch";
import { SelectGenerationEvent } from "@/db/schema/event";

type TinybirdGenerationEvent = Omit<
    SelectGenerationEvent,
    | "id"
    | "eventStatus"
    | "eventProcessingId"
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

export type MockAPI<TState> = {
    state: TState;
    handlerMap: MockHandlerMap;
    reset: () => void;
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
