import { Hono } from "hono";
import type { SelectGenerationEvent } from "../../schemas/generation-event.ts";
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
    errorEvents: Record<string, unknown>[];
    dailyResponse: UsageRow[];
    usageResponse: UsageRow[];
    appsResponse: UsageRow[];
    pipeCalls: PipeCall[];
};

export function createMockTinybird(): MockAPI<MockTinybirdState> {
    const state: MockTinybirdState = {
        events: [],
        errorEvents: [],
        dailyResponse: [],
        usageResponse: [],
        appsResponse: [],
        pipeCalls: [],
    };

    const tinybirdAPI = new Hono()
        .post("/v0/events", async (c) => {
            const eventName = c.req.query("name");
            const body = await c.req.text();

            if (eventName === "generation_event") {
                const events = parseNdjson<TinybirdGenerationEvent>(body);
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
                return c.json(
                    { successful_rows: events.length, quarantined_rows: 0 },
                    200,
                );
            }

            const rows = parseNdjson<Record<string, unknown>>(body);

            if (eventName === "error_event") {
                state.errorEvents.push(...rows);
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
        })
        .get("/v0/pipes/user_apps.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.appsResponse }, 200);
        });

    const handlerMap = {
        "localhost:7181": createHonoMockHandler(tinybirdAPI),
    };

    const reset = () => {
        state.events = [];
        state.errorEvents = [];
        state.dailyResponse = [];
        state.usageResponse = [];
        state.appsResponse = [];
        state.pipeCalls = [];
    };

    return { state, reset, handlerMap };
}

function parseNdjson<T>(input: string): T[] {
    return input
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as T);
}
