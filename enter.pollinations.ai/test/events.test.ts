import { env } from "cloudflare:test";
import {
    getTinybirdDatasourceIngestUrl,
    sendErrorEventToTinybird,
} from "@shared/events.ts";
import { usageToEventParams } from "@shared/schemas/generation-event.ts";
import { exponentialBackoffDelay } from "@shared/util.ts";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

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
    const backoffConfigWithJitter = {
        minDelay: 100,
        maxDelay: 10000,
        maxAttempts: 5,
        jitter: 0.1,
    };
    expect(
        exponentialBackoffDelay(1, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(100 - 100 * 0.1);
    expect(
        exponentialBackoffDelay(1, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(100 + 100 * 0.1);
    expect(
        exponentialBackoffDelay(3, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(100 - 100 * 0.1);
    expect(
        exponentialBackoffDelay(3, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(10000 + 10000 * 0.1);
    expect(
        exponentialBackoffDelay(5, backoffConfigWithJitter),
    ).toBeGreaterThanOrEqual(10000 - 10000 * 0.1);
    expect(
        exponentialBackoffDelay(5, backoffConfigWithJitter),
    ).toBeLessThanOrEqual(10000 + 10000 * 0.1);
});
