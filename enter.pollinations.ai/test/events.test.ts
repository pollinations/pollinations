import { env } from "cloudflare:test";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
    sendToTinybird,
} from "@shared/events.ts";
import {
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { exponentialBackoffDelay } from "@shared/util.ts";
import { afterEach, expect, vi } from "vitest";
import { test } from "./fixtures.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

test("usageToEventParams preserves fractional seconds for video and audio durations", () => {
    // LTX-2 produces durations of the form N + 1/24 (8n+1 frames at 24fps);
    // ElevenLabs Music / Whisper-style STT produce non-integer second counts.
    const params = usageToEventParams({
        completionVideoSeconds: 5.041666666666667,
        promptAudioSeconds: 12.5,
        completionAudioSeconds: 7.25,
    });

    expect(params.tokenCountCompletionVideoSeconds).toBe(5.041666666666667);
    expect(params.tokenCountPromptAudioSeconds).toBe(12.5);
    expect(params.tokenCountCompletionAudioSeconds).toBe(7.25);
});

test("sendErrorEventToTinybird sends structured error events", async ({
    log,
    mocks,
}) => {
    await mocks.enable("tinybird");

    await sendErrorEventToTinybird(
        {
            timestamp: new Date().toISOString(),
            kind: "server_error",
            severity: "error",
            request_id: "req_123",
            route_path: "/image/test",
            method: "POST",
            status: 502,
            error_code: "BAD_GATEWAY",
            error_class: "UpstreamError",
            message: "Backend timeout",
            stack: "Error: Backend timeout",
        },
        getTinybirdDatasourceIngestUrl(env.TINYBIRD_INGEST_URL, "error_event"),
        env.TINYBIRD_INGEST_TOKEN,
        log,
    );

    expect(mocks.tinybird.state.errorEvents).toHaveLength(1);
    expect(mocks.tinybird.state.errorEvents[0]).toMatchObject({
        route_path: "/image/test",
        status: 502,
        kind: "server_error",
    });
});

test("sendToTinybird does not retry failed responses", async ({ log }) => {
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("unavailable", { status: 503 }));

    await sendToTinybird(
        { id: "evt_single_attempt" } as TinybirdEvent,
        "https://api.tinybird.co/v0/events?name=generation_event_v2",
        "test-token",
        log,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("sendToTinybird does not retry network errors", async ({ log }) => {
    const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("connection lost"));

    await sendToTinybird(
        { id: "evt_single_attempt" } as TinybirdEvent,
        "https://api.tinybird.co/v0/events?name=generation_event_v2",
        "test-token",
        log,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("Exponential backoff delay", async () => {
    const backoffConfig = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0,
    };
    expect(exponentialBackoffDelay(1, backoffConfig)).toBe(100);
    expect(exponentialBackoffDelay(3, backoffConfig)).toBeGreaterThan(100);
    expect(exponentialBackoffDelay(3, backoffConfig)).toBeLessThan(10000);
    expect(exponentialBackoffDelay(5, backoffConfig)).toBe(10000);
    // Jitter must never push the delay outside [minDelay, maxDelay]:
    // the bounds are a contract callers rely on, not just a starting point.
    const backoffConfigWithJitter = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0.1,
    };
    for (let i = 0; i < 200; i++) {
        for (const attempt of [1, 3, 5]) {
            const delay = exponentialBackoffDelay(
                attempt,
                backoffConfigWithJitter,
            );
            expect(delay).toBeGreaterThanOrEqual(100);
            expect(delay).toBeLessThanOrEqual(10000);
        }
    }
    // Jitter still spreads retries out, so it is not simply pinned.
    const firstAttemptDelays = new Set(
        Array.from(
            { length: 50 },
            () => exponentialBackoffDelay(1, backoffConfigWithJitter),
        ),
    );
    expect(firstAttemptDelays.size).toBeGreaterThan(1);
});
