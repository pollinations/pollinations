import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

const futureUtcDayPeriod = () => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + 7);
    return date.toISOString().slice(0, 10);
};

test("GET /api/account/usage/daily forwards api_key_ids filter to the pipe", async ({
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

    const filteredSingle = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30&api_key_ids=key_abc123",
        { headers: authHeaders(sessionToken) },
    );
    expect(filteredSingle.status).toBe(200);

    const filteredMulti = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30&api_key_ids=key_def456,key_abc123",
        { headers: authHeaders(sessionToken) },
    );
    expect(filteredMulti.status).toBe(200);

    const dailyCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("user_usage_daily_filtered.json"),
    );
    expect(dailyCalls).toHaveLength(3);
    expect(dailyCalls[0].query.api_key_ids).toBeUndefined();
    expect(dailyCalls[0].query.grain).toBe("day");
    expect(dailyCalls[1].query.api_key_ids).toBe("key_abc123");
    // Multi-key filter is sorted and deduped before forwarding
    expect(dailyCalls[2].query.api_key_ids).toBe("key_abc123,key_def456");
    expect(dailyCalls[0].query.since).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(dailyCalls[0].query.until).toMatch(/^\d{4}-\d{2}-\d{2}/);
});

test("GET /api/account/usage/daily maps selected periods to exact windows", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const day = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?granularity=day&period=2026-04-24",
        { headers: authHeaders(sessionToken) },
    );
    expect(day.status).toBe(200);

    const week = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?granularity=week&period=2026-W17",
        { headers: authHeaders(sessionToken) },
    );
    expect(week.status).toBe(200);

    const month = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?granularity=month&period=2026-04",
        { headers: authHeaders(sessionToken) },
    );
    expect(month.status).toBe(200);

    const dailyCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("user_usage_daily_filtered.json"),
    );
    expect(dailyCalls).toHaveLength(3);
    expect(dailyCalls[0].query.since).toBe("2026-04-24 00:00:00");
    expect(dailyCalls[0].query.until).toBe("2026-04-25 00:00:00");
    expect(dailyCalls[0].query.grain).toBe("hour");
    expect(dailyCalls[1].query.since).toBe("2026-04-20 00:00:00");
    expect(dailyCalls[1].query.until).toBe("2026-04-27 00:00:00");
    expect(dailyCalls[1].query.grain).toBe("day");
    expect(dailyCalls[2].query.since).toBe("2026-04-01 00:00:00");
    expect(dailyCalls[2].query.until).toBe("2026-05-01 00:00:00");
    expect(dailyCalls[2].query.grain).toBe("day");
});

test("GET /api/account/usage/daily derives pipe grain from selected period", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const day = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?granularity=day&period=2026-04-24",
        { headers: authHeaders(sessionToken) },
    );
    expect(day.status).toBe(200);

    const monthWithIgnoredGrain = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?granularity=month&period=2026-04&grain=hour",
        { headers: authHeaders(sessionToken) },
    );
    expect(monthWithIgnoredGrain.status).toBe(200);

    const dailyCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("user_usage_daily_filtered.json"),
    );
    expect(dailyCalls).toHaveLength(2);
    expect(dailyCalls[0].query.grain).toBe("hour");
    expect(dailyCalls[1].query.grain).toBe("day");
});

test("GET /api/account/usage/daily rejects periods outside supported bounds", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const beforeUsage = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?granularity=day&period=2025-12-31",
        { headers: authHeaders(sessionToken) },
    );
    expect(beforeUsage.status).toBe(400);

    const futurePeriod = futureUtcDayPeriod();
    const future = await SELF.fetch(
        `http://localhost:3000/api/account/usage/daily?granularity=day&period=${futurePeriod}`,
        { headers: authHeaders(sessionToken) },
    );
    expect(future.status).toBe(400);
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
            api_key_id: "key_abc123",
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
