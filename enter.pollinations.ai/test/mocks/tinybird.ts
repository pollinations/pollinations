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

    const tinybirdAPI = new Hono()
        .post("/v0/events", async (c) => {
            const eventName = c.req.query("name");
            const body = await c.req.text();
            const rows = parseNdjson(body);

            // Only track generation_event in state (other event types are accepted silently)
            if (eventName === "generation_event") {
                const events: TinybirdGenerationEvent[] = rows;
                // simulate failure if id starts with "simulate_error"
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
                {
                    successful_rows: rows.length,
                    quarantined_rows: 0,
                },
                200,
            );
        })
        .get("/v0/pipes/user_usage.json", async (c) => {
            const userId = c.req.query("user_id") || "";
            const limit = Number(c.req.query("limit") || "100");
            const before = c.req.query("before");
            const beforeEventId = c.req.query("before_event_id");
            const since = c.req.query("since");
            const until = c.req.query("until");

            const rows = state.events
                .filter((event) => isBilledUsage(event, userId))
                .filter((event) => isWithinRange(event, since, until))
                .sort(compareEventsNewestFirst)
                .filter((event) => isBeforeCursor(event, before, beforeEventId))
                .slice(0, limit)
                .map((event) => ({
                    timestamp: formatTimestamp(event.startTime),
                    cursor_event_id: event.id,
                    type: event.eventType,
                    model: event.modelUsed ?? null,
                    api_key: event.apiKeyName ?? null,
                    api_key_type: event.apiKeyType ?? null,
                    meter_source: getMeterSource(event.selectedMeterSlug),
                    input_text_tokens: event.tokenCountPromptText ?? 0,
                    input_cached_tokens: event.tokenCountPromptCached ?? 0,
                    input_audio_tokens: event.tokenCountPromptAudio ?? 0,
                    input_image_tokens: event.tokenCountPromptImage ?? 0,
                    output_text_tokens: event.tokenCountCompletionText ?? 0,
                    output_reasoning_tokens:
                        event.tokenCountCompletionReasoning ?? 0,
                    output_audio_tokens: event.tokenCountCompletionAudio ?? 0,
                    output_image_tokens: event.tokenCountCompletionImage ?? 0,
                    cost_usd: Number(event.totalPrice ?? 0),
                    response_time_ms: event.responseTime ?? null,
                }));

            return c.json({ data: rows }, 200);
        })
        .get("/v0/pipes/user_usage_daily_filtered.json", async (c) => {
            const rows = aggregateDailyUsage(
                state.events,
                c.req.query("user_id") || "",
                c.req.query("since"),
                c.req.query("until"),
                c.req.query("api_key_name"),
            );
            return c.json({ data: rows }, 200);
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

function parseNdjson(input: string): unknown[] {
    return input
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line));
}

function isBilledUsage(
    event: TinybirdGenerationEvent,
    userId: string,
): boolean {
    return event.userId === userId && Number(event.totalPrice ?? 0) > 0;
}

function parseDateTime(value?: string | Date | null): number {
    if (!value) return Number.NaN;
    if (value instanceof Date) return value.getTime();
    return new Date(
        value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
    ).getTime();
}

function isWithinRange(
    event: TinybirdGenerationEvent,
    since?: string | null,
    until?: string | null,
): boolean {
    const eventTime = parseDateTime(event.startTime);
    if (since && eventTime < parseDateTime(since)) {
        return false;
    }
    if (until && eventTime >= parseDateTime(until)) {
        return false;
    }
    return true;
}

function compareEventsNewestFirst(
    left: TinybirdGenerationEvent,
    right: TinybirdGenerationEvent,
): number {
    const timeDiff =
        parseDateTime(right.startTime) - parseDateTime(left.startTime);
    if (timeDiff !== 0) return timeDiff;
    return right.id.localeCompare(left.id);
}

function isBeforeCursor(
    event: TinybirdGenerationEvent,
    before?: string | null,
    beforeEventId?: string | null,
): boolean {
    if (!before) return true;

    const eventTime = parseDateTime(event.startTime);
    const beforeTime = parseDateTime(before);
    if (eventTime < beforeTime) return true;
    if (eventTime > beforeTime) return false;
    if (!beforeEventId) return false;
    return event.id < beforeEventId;
}

function formatTimestamp(value: string | Date): string {
    return new Date(value).toISOString().slice(0, 19).replace("T", " ");
}

function getMeterSource(selectedMeterSlug?: string | null): string | null {
    if (!selectedMeterSlug) return null;
    const parts = selectedMeterSlug.split(":");
    return parts.at(-1) || null;
}

function aggregateDailyUsage(
    events: TinybirdGenerationEvent[],
    userId: string,
    since?: string | null,
    until?: string | null,
    apiKeyName?: string | null,
) {
    const buckets = new Map<
        string,
        {
            date: string;
            model: string | null;
            meter_source: string | null;
            requests: number;
            cost_usd: number;
        }
    >();

    for (const event of events) {
        if (
            !isBilledUsage(event, userId) ||
            !isWithinRange(event, since, until)
        ) {
            continue;
        }
        if (apiKeyName && event.apiKeyName !== apiKeyName) {
            continue;
        }

        const date = new Date(event.startTime).toISOString().slice(0, 10);
        const model = event.resolvedModelRequested ?? null;
        const meterSource = getMeterSource(event.selectedMeterSlug);
        const key = [date, model ?? "", meterSource ?? ""].join("|");

        const current = buckets.get(key) || {
            date,
            model,
            meter_source: meterSource,
            requests: 0,
            cost_usd: 0,
        };
        current.requests += 1;
        current.cost_usd += Number(event.totalPrice ?? 0);
        buckets.set(key, current);
    }

    return Array.from(buckets.values()).sort((left, right) => {
        if (left.date !== right.date) {
            return right.date.localeCompare(left.date);
        }
        return right.requests - left.requests;
    });
}
