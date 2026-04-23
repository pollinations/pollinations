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

type UsageRow = Record<string, unknown>;

type PipeCall = {
    url: string;
    query: Record<string, string>;
};

export type MockTinybirdState = {
    events: TinybirdGenerationEvent[];
    dailyResponse: UsageRow[];
    usageResponse: UsageRow[];
    pipeCalls: PipeCall[];
};

export function createMockTinybird(): MockAPI<MockTinybirdState> {
    const state: MockTinybirdState = {
        events: [],
        dailyResponse: [],
        usageResponse: [],
        pipeCalls: [],
    };

    const tinybirdAPI = new Hono()
        .post("/v0/events", async (c) => {
            const eventName = c.req.query("name");
            const body = await c.req.text();
            const rows = parseNdjson(body);

            if (eventName === "generation_event") {
                const events: TinybirdGenerationEvent[] = rows;
                if (
                    events.find((event) =>
                        event.id.includes("simulate_tinybird_error"),
                    )
                ) {
                    throw new Error(
                        "Failed to ingest mock tinybird events: simulated error",
                    );
                }
                state.events.push(...events);
            }

            return c.json(
                { successful_rows: rows.length, quarantined_rows: 0 },
                200,
            );
        })
        .get("/v0/pipes/user_usage.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.usageResponse }, 200);
        })
        .get("/v0/pipes/user_usage_daily_filtered.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.dailyResponse }, 200);
        });

    const handlerMap = {
        "localhost:7181": createHonoMockHandler(tinybirdAPI),
    };

    const reset = () => {
        state.events = [];
        state.dailyResponse = [];
        state.usageResponse = [];
        state.pipeCalls = [];
    };

    return { state, reset, handlerMap };
}

function parseNdjson(input: string): unknown[] {
    return input
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
}
