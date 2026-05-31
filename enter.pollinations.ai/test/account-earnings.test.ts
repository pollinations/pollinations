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
    request_count: 5,
    base_price_pollen: 0.4,
    earned_pollen: 0.1,
    earned_paid_pollen: 0.06,
    earned_reward_pollen: 0.04,
    charged_pollen: 0.5,
    markup_rate: 0.25,
    unique_user_count: 0,
    ...overrides,
});

test("GET /api/account/earnings returns base, earned, and charged pollen in JSON", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow(),
        earningsRow({
            date: "",
            unique_user_count: 3,
        }),
        earningsRow({
            date: "",
            app_key_id: "",
            app_name: "",
            unique_user_count: 3,
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

    const expectAllFields = {
        base_price_pollen: 0.4,
        earned_pollen: 0.1,
        earned_paid_pollen: 0.06,
        earned_reward_pollen: 0.04,
        charged_pollen: 0.5,
        markup_rate: 0.25,
    };

    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]).toMatchObject(expectAllFields);
    expect(body.perApp).toHaveLength(1);
    expect(body.perApp[0]).toMatchObject(expectAllFields);
    expect(body.global).toMatchObject(expectAllFields);
});

test("GET /api/account/earnings CSV emits base, earned, and charged pollen columns", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow({
            date: "2026-04-14",
            base_price_pollen: 0.4,
            earned_pollen: 0.1,
            earned_paid_pollen: 0.06,
            earned_reward_pollen: 0.04,
            charged_pollen: 0.5,
            markup_rate: 0.25,
        }),
        earningsRow({
            date: "2026-04-15",
            base_price_pollen: 0.8,
            earned_pollen: 0.2,
            earned_paid_pollen: 0.2,
            earned_reward_pollen: 0,
            charged_pollen: 1,
            markup_rate: 0.25,
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
        "date,app_key_id,app_name,request_count,base_price_pollen,earned_pollen,earned_paid_pollen,earned_reward_pollen,charged_pollen,markup_rate",
    );
    expect(rows[0]).toBe(
        "2026-04-14,key_byop_app_1,BYOP App,5,0.4,0.1,0.06,0.04,0.5,0.25",
    );
    expect(rows[1]).toBe(
        "2026-04-15,key_byop_app_1,BYOP App,5,0.8,0.2,0.2,0,1,0.25",
    );
});
