import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

test("GET /api/account/usage/daily forwards api_key_name filter to the pipe", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.dailyResponse = [
        {
            date: "2026-04-14",
            model: "openai-fast",
            meter_source: "tier",
            requests: 3,
            cost_usd: 10,
        },
    ];

    const unfiltered = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30",
        { headers: authHeaders(sessionToken) },
    );
    expect(unfiltered.status).toBe(200);
    const unfilteredBody = (await unfiltered.json()) as { usage: unknown[] };
    expect(unfilteredBody.usage).toHaveLength(1);

    const filtered = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30&api_key_name=alpha",
        { headers: authHeaders(sessionToken) },
    );
    expect(filtered.status).toBe(200);

    const dailyCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("user_usage_daily_filtered.json"),
    );
    expect(dailyCalls).toHaveLength(2);
    expect(dailyCalls[0].query.api_key_name).toBeUndefined();
    expect(dailyCalls[1].query.api_key_name).toBe("alpha");
    expect(dailyCalls[0].query.since).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(dailyCalls[0].query.until).toMatch(/^\d{4}-\d{2}-\d{2}/);
});

test("GET /api/account/usage?format=csv renders rows and sets filename from limit", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.usageResponse = [
        {
            cursor_event_id: "event-1",
            timestamp: "2026-04-14 12:10:00",
            type: "generate.text",
            model: "openai-fast",
            api_key: "alpha",
            api_key_type: "secret",
            meter_source: "tier",
            input_text_tokens: 10,
            input_cached_tokens: 0,
            input_audio_tokens: 0,
            input_image_tokens: 0,
            output_text_tokens: 20,
            output_reasoning_tokens: 0,
            output_audio_tokens: 0,
            output_image_tokens: 0,
            cost_usd: 1,
            response_time_ms: 123,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage?format=csv&days=30&limit=50000",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toContain(
        "latest-1-rows-30d",
    );

    const csv = await response.text();
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("timestamp,type,model");
    expect(lines[1]).toContain("2026-04-14 12:10:00");
    expect(lines[1]).toContain("alpha");

    const usageCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("user_usage.json"),
    );
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0].query.limit).toBe("50000");
});
