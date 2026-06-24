import { Hono } from "hono";
import type { TinybirdEvent } from "../../schemas/generation-event.ts";
import { createHonoMockHandler, type MockAPI } from "./fetch.ts";

type TinybirdGenerationEvent = Omit<
    TinybirdEvent,
    | "eventStatus"
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
    stripeEvents: Record<string, unknown>[];
    dailyResponse: UsageRow[];
    usageResponse: UsageRow[];
    earningsResponse: UsageRow[];
    appDirectoryResponse: UsageRow[];
    paidAppSpendResponse: UsageRow[];
    modelModalitiesResponse: UsageRow[];
    questUsageResponse: UsageRow[];
    pipeCalls: PipeCall[];
};

export function createMockTinybird(): MockAPI<MockTinybirdState> {
    const state: MockTinybirdState = {
        events: [],
        errorEvents: [],
        stripeEvents: [],
        dailyResponse: [],
        usageResponse: [],
        earningsResponse: [],
        appDirectoryResponse: [],
        paidAppSpendResponse: [],
        modelModalitiesResponse: [],
        questUsageResponse: [],
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
            } else if (eventName === "stripe_event") {
                state.stripeEvents.push(...rows);
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
        .get("/v0/pipes/developer_earnings.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.earningsResponse }, 200);
        })
        .get("/v0/pipes/app_directory_public.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.appDirectoryResponse }, 200);
        })
        .get("/v0/pipes/quest_paid_app_spend.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.paidAppSpendResponse }, 200);
        })
        .get("/v0/pipes/quest_model_modalities.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.modelModalitiesResponse }, 200);
        })
        .get("/v0/pipes/quest_usage_summary.json", (c) => {
            state.pipeCalls.push({ url: c.req.url, query: c.req.query() });
            return c.json({ data: state.questUsageResponse }, 200);
        });

    const handlerMap = {
        "localhost:7181": createHonoMockHandler(tinybirdAPI),
    };

    const reset = () => {
        state.events = [];
        state.errorEvents = [];
        state.stripeEvents = [];
        state.dailyResponse = [];
        state.usageResponse = [];
        state.earningsResponse = [];
        state.appDirectoryResponse = [];
        state.paidAppSpendResponse = [];
        state.modelModalitiesResponse = [];
        state.questUsageResponse = [];
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
