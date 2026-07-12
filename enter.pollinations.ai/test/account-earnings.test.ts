import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

const earningsRow = (overrides: Record<string, unknown> = {}) => ({
    date: "2026-04-14",
    entity_id: "key_byop_app_1",
    entity_name: "BYOP App",
    source: "byop_markup",
    requests: 5,
    paid_requests: 3,
    tier_requests: 2,
    baseline_price: 0.4,
    pollen_earned: 0.1,
    paid_earned: 0.08,
    tier_earned: 0.02,
    cost_usd: 0.5,
    reward_rate: 0.25,
    ...overrides,
});

test("GET /api/account/earnings returns daily buckets and derived entity rollups", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow(),
        earningsRow({
            date: "2026-04-15",
            requests: 15,
            baseline_price: 0.8,
            pollen_earned: 0.3,
            paid_earned: 0.24,
            tier_earned: 0.06,
            cost_usd: 1.1,
            reward_rate: 0.45,
        }),
        earningsRow({
            entity_id: "owner/model",
            entity_name: "Community Model",
            source: "community_model",
            requests: 7,
            baseline_price: 0.4,
            pollen_earned: 0.3,
            paid_earned: 0.12,
            tier_earned: 0.18,
            cost_usd: 0.4,
            reward_rate: 0.75,
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings?days=30",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
        daily: Record<string, unknown>[];
        perEntity: Record<string, unknown>[];
    };

    expect(body.daily).toHaveLength(3);
    expect(body.daily[0]).toMatchObject({
        paid_requests: 3,
        tier_requests: 2,
        baseline_price: 0.4,
        pollen_earned: 0.1,
        paid_earned: 0.08,
        tier_earned: 0.02,
        cost_usd: 0.5,
        reward_rate: 0.25,
    });
    // perEntity is derived in the worker from the daily buckets, sorted by
    // pollen_earned descending.
    expect(body.perEntity).toHaveLength(2);
    expect(body.perEntity[0]).toMatchObject({
        date: "",
        source: "byop_markup",
        entity_id: "key_byop_app_1",
        entity_name: "BYOP App",
        requests: 20,
        paid_requests: 6,
        tier_requests: 4,
    });
    expect(Number(body.perEntity[0].pollen_earned)).toBeCloseTo(0.4);
    expect(Number(body.perEntity[0].paid_earned)).toBeCloseTo(0.32);
    expect(Number(body.perEntity[0].tier_earned)).toBeCloseTo(0.08);
    expect(Number(body.perEntity[0].baseline_price)).toBeCloseTo(1.2);
    expect(Number(body.perEntity[0].cost_usd)).toBeCloseTo(1.6);
    // Request-weighted average: (0.25*5 + 0.45*15) / 20
    expect(Number(body.perEntity[0].reward_rate)).toBeCloseTo(0.4);
    expect(body.perEntity[1]).toMatchObject({
        source: "community_model",
        entity_id: "owner/model",
        pollen_earned: 0.3,
        reward_rate: 0.75,
    });
    expect(body).not.toHaveProperty("total");
    expect(body).not.toHaveProperty("bySource");
    expect(body.perEntity[0]).not.toHaveProperty("unique_users");

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_earnings_chart.json"),
    );
    expect(earningsCalls).toHaveLength(1);
});

test("GET /api/account/earnings emits daily earnings CSV", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow({
            date: "2026-04-14",
            baseline_price: 0.4,
            pollen_earned: 0.1,
            paid_earned: 0.08,
            tier_earned: 0.02,
            cost_usd: 0.5,
            reward_rate: 0.25,
        }),
        earningsRow({
            date: "2026-04-15",
            baseline_price: 0.8,
            pollen_earned: 0.2,
            paid_earned: 0.12,
            tier_earned: 0.08,
            cost_usd: 1,
            reward_rate: 0.25,
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings?days=30&format=csv",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");

    const csv = await response.text();
    const [header, ...rows] = csv.split("\n");

    expect(header).toBe(
        "date,source,entity_id,entity_name,requests,baseline_price,pollen_earned,paid_earned,tier_earned,cost_usd,reward_rate",
    );
    expect(rows[0]).toBe(
        "2026-04-14,byop_markup,key_byop_app_1,BYOP App,5,0.4,0.1,0.08,0.02,0.5,0.25",
    );
    expect(rows[1]).toBe(
        "2026-04-15,byop_markup,key_byop_app_1,BYOP App,5,0.8,0.2,0.12,0.08,1,0.25",
    );

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_earnings_chart.json"),
    );
    expect(earningsCalls).toHaveLength(1);
});

test("GET /api/account/earnings/transactions returns trimmed feed rows", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsTransactionsResponse = [
        {
            cursor_event_id: "event-1",
            timestamp: "2026-04-14 12:10:00",
            entity_name: "BYOP App",
            model: "openai-fast",
            meter_source: "tier",
            pollen_earned: 0.1,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings/transactions?days=30&limit=50",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
        transactions: Record<string, unknown>[];
        count: number;
    };

    expect(body.count).toBe(1);
    expect(body.transactions[0]).toEqual({
        cursor_event_id: "event-1",
        timestamp: "2026-04-14 12:10:00",
        entity_name: "BYOP App",
        model: "openai-fast",
        meter_source: "tier",
        pollen_earned: 0.1,
    });

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_earnings_transactions.json"),
    );
    expect(earningsCalls).toHaveLength(1);
    expect(earningsCalls[0].query.limit).toBe("50");
    expect(earningsCalls[0].query.before).toBeUndefined();
    expect(earningsCalls[0].query.before_event_id).toBeUndefined();
});

test("GET /api/account/earnings/transactions returns community model rewards", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsTransactionsResponse = [
        {
            cursor_event_id: "event-model-1",
            timestamp: "2026-04-14 12:10:00",
            entity_name: "Community Model",
            model: "owner/model",
            meter_source: "pack",
            pollen_earned: 0.1,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings/transactions?days=30&limit=10",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
        transactions: Record<string, unknown>[];
    };

    expect(body).not.toHaveProperty("has_more");
    expect(body.transactions[0]).toMatchObject({
        entity_name: "Community Model",
        model: "owner/model",
        meter_source: "pack",
        pollen_earned: 0.1,
    });

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_earnings_transactions.json"),
    );
    expect(earningsCalls).toHaveLength(1);
    expect(earningsCalls[0].query.limit).toBe("10");
});

test("GET /api/account/earnings?format=csv neutralizes app name formulas", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow({
            entity_name: '=HYPERLINK("https://example.test","click")',
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings?days=30&format=csv",
        { headers: authHeaders(sessionToken) },
    );

    expect(response.status).toBe(200);
    const csv = await response.text();
    const [, row] = csv.split("\n");

    expect(row).toContain(`"'=HYPERLINK(""https://example.test"",""click"")"`);
});
