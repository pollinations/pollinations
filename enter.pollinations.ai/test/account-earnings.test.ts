import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const authHeaders = (sessionToken: string) => ({
    Cookie: `better-auth.session_token=${sessionToken}`,
});

const earningsRow = (overrides: Record<string, unknown> = {}) => ({
    date: "2026-04-14",
    app_key_id: "key_byop_app_1",
    app_name: "BYOP App",
    requests: 5,
    paid_requests: 3,
    tier_requests: 2,
    baseline_price: 0.4,
    pollen_earned: 0.1,
    paid_earned: 0.06,
    tier_earned: 0.04,
    cost_usd: 0.5,
    markup_rate: 0.25,
    unique_users: 0,
    ...overrides,
});

test("GET /api/account/earnings returns baseline_price, pollen_earned, and cost_usd in JSON", async ({
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
            cost_usd: 0.5,
            unique_users: 3,
        }),
        earningsRow({
            date: "",
            app_key_id: "",
            app_name: "",
            requests: 5,
            baseline_price: 0.4,
            pollen_earned: 0.1,
            cost_usd: 0.5,
            unique_users: 3,
        }),
    ];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings?days=30",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
        daily: Record<string, number>[];
        perApp: Record<string, number>[];
        global: Record<string, number> | null;
    };

    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]).toMatchObject({
        paid_requests: 3,
        tier_requests: 2,
        baseline_price: 0.4,
        pollen_earned: 0.1,
        paid_earned: 0.06,
        tier_earned: 0.04,
        cost_usd: 0.5,
        markup_rate: 0.25,
    });
    expect(body.perApp).toHaveLength(1);
    expect(body.perApp[0]).toMatchObject({
        baseline_price: 0.4,
        pollen_earned: 0.1,
        cost_usd: 0.5,
    });
    expect(body.global).toMatchObject({
        baseline_price: 0.4,
        pollen_earned: 0.1,
        cost_usd: 0.5,
    });

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_app_earnings_chart.json"),
    );
    expect(earningsCalls).toHaveLength(1);
});

test("GET /api/account/earnings emits daily earnings CSV", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [earningsRow()];

    const response = await SELF.fetch(
        "http://localhost:3000/api/account/earnings?days=30&format=csv",
        { headers: authHeaders(sessionToken) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv");

    const csv = await response.text();
    const [header, ...rows] = csv.split("\n");

    expect(header).toBe(
        "date,app_key_id,app_name,requests,baseline_price,pollen_earned,cost_usd,markup_rate",
    );
    expect(rows[0]).toBe(
        "2026-04-14,key_byop_app_1,BYOP App,5,0.4,0.1,0.5,0.25",
    );

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_app_earnings_chart.json"),
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
        "timestamp,type,app_key_id,app_name,payer_user_id,model,meter_source,baseline_price,pollen_earned,cost_usd,markup_rate,response_time_ms",
    );
    expect(rows[0]).toBe(
        "2026-04-14 12:10:00,generate.text,key_byop_app_1,BYOP App,user_1,openai-fast,tier,0.4,0.1,0.5,0.25,123",
    );

    const earningsCalls = mocks.tinybird.state.pipeCalls.filter((call) =>
        call.url.includes("activity_app_earnings_transactions.json"),
    );
    expect(earningsCalls).toHaveLength(1);
    expect(earningsCalls[0].query.limit).toBe("50000");
});

test("GET /api/account/earnings?format=csv neutralizes app name formulas", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow({
            app_name: '=HYPERLINK("https://example.test","click")',
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
