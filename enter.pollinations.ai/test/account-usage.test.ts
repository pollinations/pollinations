import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

async function createUsageApiKey(sessionToken: string) {
    const createResponse = await SELF.fetch(
        "http://localhost:3000/api/account/keys",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(sessionToken),
            },
            body: JSON.stringify({ name: "usage-read-key" }),
        },
    );
    expect(createResponse.status).toBe(200);
    const created = (await createResponse.json()) as {
        id: string;
        key: string;
    };

    const updateResponse = await SELF.fetch(
        `http://localhost:3000/api/api-keys/${created.id}/update`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(sessionToken),
            },
            body: JSON.stringify({
                accountPermissions: ["usage"],
            }),
        },
    );
    expect(updateResponse.status).toBe(200);
    return created.key;
}

test("GET /api/account/usage/daily forwards api_key_ids filter to the pipe", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.dailyResponse = [
        {
            date: "2026-04-14",
            api_key_id: "key_abc123",
            api_key: "debug-usage-fixture",
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
    const unfilteredBody = (await unfiltered.json()) as {
        usage: Array<Record<string, unknown>>;
    };
    expect(unfilteredBody.usage).toHaveLength(1);
    expect(unfilteredBody.usage[0].api_key_id).toBe("key_abc123");
    expect(unfilteredBody.usage[0].api_key).toBe("debug-usage-fixture");

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
        call.url.includes("activity_usage_chart.json"),
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

test("GET /api/account/usage/daily?format=csv includes API key columns", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.dailyResponse = [
        {
            date: "2026-04-14",
            api_key_id: "key_abc123",
            api_key: "debug-usage-fixture",
            model: "openai-fast",
            meter_source: "tier",
            requests: 3,
            cost_usd: 10,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage/daily?days=30&format=csv",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");

    const csv = await response.text();
    const [header, ...rows] = csv.split("\n");

    expect(header).toBe(
        "date,api_key_id,api_key,model,meter_source,requests,cost_usd",
    );
    expect(rows[0]).toBe(
        "2026-04-14,key_abc123,debug-usage-fixture,openai-fast,tier,3,10",
    );
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
        call.url.includes("activity_usage_chart.json"),
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
        call.url.includes("activity_usage_chart.json"),
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

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const futurePeriod = tomorrow.toISOString().slice(0, 10);
    const future = await SELF.fetch(
        `http://localhost:3000/api/account/usage/daily?granularity=day&period=${futurePeriod}`,
        { headers: authHeaders(sessionToken) },
    );
    expect(future.status).toBe(400);
});

test("GET /api/account/usage forwards stable cursor and returns event cursor", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.usageResponse = [
        {
            cursor_event_id: "event-2",
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
            input_audio_seconds: 0,
            input_image_tokens: 0,
            output_text_tokens: 20,
            output_reasoning_tokens: 0,
            output_audio_tokens: 0,
            output_audio_seconds: 0,
            output_image_tokens: 0,
            output_video_seconds: 0,
            cost_usd: 1,
            response_time_ms: 123,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage?days=30&limit=25&before=2026-04-14%2012%3A10%3A00&before_event_id=event-1",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        usage: Array<Record<string, unknown>>;
    };
    expect(body.usage[0].cursor_event_id).toBe("event-2");
    expect(body.usage[0].api_key_id).toBe("key_abc123");

    const usageCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_usage_transactions.json"),
    );
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0].query.before).toBe("2026-04-14 12:10:00");
    expect(usageCalls[0].query.before_event_id).toBe("event-1");
});

test("GET /api/account/usage accepts account usage permission", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");
    mocks.tinybird.state.usageResponse = [
        {
            cursor_event_id: "event-admin",
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
            input_audio_seconds: 0,
            input_image_tokens: 0,
            output_text_tokens: 20,
            output_reasoning_tokens: 0,
            output_audio_tokens: 0,
            output_audio_seconds: 0,
            output_image_tokens: 0,
            output_video_seconds: 0,
            cost_usd: 1,
            response_time_ms: 123,
        },
    ];

    const usageKey = await createUsageApiKey(sessionToken);
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage?days=30&limit=1",
        {
            headers: {
                authorization: `Bearer ${usageKey}`,
            },
        },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        usage: Array<Record<string, unknown>>;
    };
    expect(body.usage[0].cursor_event_id).toBe("event-admin");
});

test("GET /api/account/usage forwards table filters to the pipe", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage?days=30&limit=15&api_key_ids=key_b,key_a,key_a&models=gpt-b,gpt-a,gpt-a",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);

    const usageCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_usage_transactions.json"),
    );
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0].query.limit).toBe("15");
    expect(usageCalls[0].query.api_key_ids).toBe("key_a,key_b");
    expect(usageCalls[0].query.models).toBe("gpt-a,gpt-b");
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
            input_audio_seconds: 0,
            input_image_tokens: 0,
            output_text_tokens: 20,
            output_reasoning_tokens: 0,
            output_audio_tokens: 0,
            output_audio_seconds: 0,
            output_image_tokens: 0,
            output_video_seconds: 0,
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
    expect(lines[0]).not.toContain("cursor_event_id");
    expect(lines[1]).toContain("2026-04-14 12:10:00");
    expect(lines[1]).toContain("alpha");

    const usageCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_usage_transactions.json"),
    );
    expect(usageCalls).toHaveLength(1);
    expect(usageCalls[0].query.limit).toBe("50000");
});

test("GET /api/account/usage?format=csv neutralizes spreadsheet formulas", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.usageResponse = [
        {
            cursor_event_id: "event-1",
            timestamp: "2026-04-14 12:10:00",
            type: "generate.text",
            model: "=1+1",
            api_key_id: "key_abc123",
            api_key: "+SUM(1,1)",
            api_key_type: "secret",
            meter_source: "tier",
            input_text_tokens: 10,
            input_cached_tokens: 0,
            input_audio_tokens: 0,
            input_audio_seconds: 0,
            input_image_tokens: 0,
            output_text_tokens: 20,
            output_reasoning_tokens: 0,
            output_audio_tokens: 0,
            output_audio_seconds: 0,
            output_image_tokens: 0,
            output_video_seconds: 0,
            cost_usd: 1,
            response_time_ms: 123,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/usage?format=csv&days=30",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);
    const csv = await response.text();
    const lines = csv.trim().split("\n");
    expect(lines[1]).toContain(",'=1+1,");
    expect(lines[1]).toContain(`"'+SUM(1,1)"`);
});
