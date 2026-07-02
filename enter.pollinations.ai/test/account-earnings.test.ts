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
    unique_users: 0,
    ...overrides,
});

test("GET /api/account/earnings returns entity rollups and additive money totals in JSON", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow(),
        earningsRow({
            date: "",
            requests: 5,
            baseline_price: 0.4,
            pollen_earned: 0.1,
            paid_earned: 0.08,
            tier_earned: 0.02,
            cost_usd: 0.5,
            unique_users: 3,
        }),
        earningsRow({
            date: "",
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
            unique_users: 4,
        }),
        earningsRow({
            date: "",
            entity_id: "",
            entity_name: "",
            source: "byop_markup",
            requests: 5,
            baseline_price: 0.4,
            pollen_earned: 0.1,
            paid_earned: 0.08,
            tier_earned: 0.02,
            cost_usd: 0.5,
            unique_users: 3,
        }),
        earningsRow({
            date: "",
            entity_id: "",
            entity_name: "",
            source: "community_model",
            requests: 7,
            baseline_price: 0.4,
            pollen_earned: 0.3,
            paid_earned: 0.12,
            tier_earned: 0.18,
            cost_usd: 0.4,
            reward_rate: 0.75,
            unique_users: 4,
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
        total: Record<string, unknown>;
    };

    expect(body.daily).toHaveLength(1);
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
    expect(body.perEntity).toHaveLength(2);
    expect(body.perEntity[0]).toMatchObject({
        source: "community_model",
        pollen_earned: 0.3,
    });
    expect(Number(body.total.pollen_earned)).toBeCloseTo(0.4);
    expect(Number(body.total.paid_earned)).toBeCloseTo(0.2);
    expect(Number(body.total.tier_earned)).toBeCloseTo(0.2);
    expect(body.total).not.toHaveProperty("requests");
    expect(body.total).not.toHaveProperty("unique_users");
    expect(body.total).not.toHaveProperty("reward_rate");
    expect(body).not.toHaveProperty("global");
    expect(body).not.toHaveProperty("bySource");

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_earnings_chart.json"),
    );
    expect(earningsCalls).toHaveLength(1);
});

test("GET /api/account/earnings derives totals from entity rollups when source rollups are absent", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow({
            date: "",
            entity_id: "key_byop_app_1",
            entity_name: "BYOP App",
            source: "byop_markup",
            pollen_earned: 0.1,
            paid_earned: 0.08,
            tier_earned: 0.02,
        }),
        earningsRow({
            date: "",
            entity_id: "owner/model",
            entity_name: "Community Model",
            source: "community_model",
            pollen_earned: 0.3,
            paid_earned: 0.12,
            tier_earned: 0.18,
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings?days=30",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
        total: Record<string, unknown>;
    };

    expect(body).not.toHaveProperty("bySource");
    expect(Number(body.total.pollen_earned)).toBeCloseTo(0.4);
    expect(Number(body.total.paid_earned)).toBeCloseTo(0.2);
    expect(Number(body.total.tier_earned)).toBeCloseTo(0.2);
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

test("GET /api/account/earnings/transactions emits detailed earnings CSV", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsTransactionsResponse = [
        {
            cursor_event_id: "event-1",
            timestamp: "2026-04-14 12:10:00",
            type: "generate.text",
            source: "byop_markup",
            entity_id: "key_byop_app_1",
            entity_name: "BYOP App",
            app_key_id: "key_byop_app_1",
            app_name: "BYOP App",
            payer_user_id: "user_1",
            model: "openai-fast",
            meter_source: "tier",
            baseline_price: 0.4,
            pollen_earned: 0.1,
            cost_usd: 0.5,
            markup_rate: 0.25,
            response_time_ms: 123,
        },
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings/transactions?days=30&format=csv&limit=50000",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");

    const csv = await response.text();
    const [header, ...rows] = csv.split("\n");

    expect(header).toBe(
        "timestamp,type,source,entity_id,entity_name,app_key_id,app_name,payer_user_id,model,meter_source,baseline_price,pollen_earned,cost_usd,markup_rate,response_time_ms",
    );
    expect(rows[0]).toBe(
        "2026-04-14 12:10:00,generate.text,byop_markup,key_byop_app_1,BYOP App,key_byop_app_1,BYOP App,user_1,openai-fast,tier,0.4,0.1,0.5,0.25,123",
    );

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_earnings_transactions.json"),
    );
    expect(earningsCalls).toHaveLength(1);
    expect(earningsCalls[0].query.limit).toBe("50000");
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
            type: "generate.text",
            source: "community_model",
            entity_id: "owner/model",
            entity_name: "Community Model",
            app_key_id: "",
            app_name: "",
            payer_user_id: "user_1",
            model: "owner/model",
            meter_source: "pack",
            baseline_price: 0.4,
            pollen_earned: 0.1,
            cost_usd: 0.4,
            markup_rate: 0,
            response_time_ms: 123,
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
        source: "community_model",
        entity_id: "owner/model",
        entity_name: "Community Model",
        app_key_id: "",
        app_name: "",
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
