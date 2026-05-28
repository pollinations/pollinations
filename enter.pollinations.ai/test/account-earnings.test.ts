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
    pollen_baseline: 0.4,
    pollen_earned: 0.1,
    pollen_spent: 0.5,
    markup_rate: 0.25,
    unique_users: 0,
    ...overrides,
});

test("GET /api/account/earnings returns pollen_baseline and pollen_spent in JSON", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow(),
        earningsRow({
            date: "",
            unique_users: 3,
        }),
        earningsRow({
            date: "",
            app_key_id: "",
            app_name: "",
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

    const expectAllFields = {
        pollen_baseline: 0.4,
        pollen_earned: 0.1,
        pollen_spent: 0.5,
        markup_rate: 0.25,
    };

    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]).toMatchObject(expectAllFields);
    expect(body.perApp).toHaveLength(1);
    expect(body.perApp[0]).toMatchObject(expectAllFields);
    expect(body.global).toMatchObject(expectAllFields);
});

test("GET /api/account/earnings CSV emits pollen_baseline and pollen_spent columns", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("tinybird");

    mocks.tinybird.state.earningsResponse = [
        earningsRow({
            date: "2026-04-14",
            pollen_baseline: 0.4,
            pollen_earned: 0.1,
            pollen_spent: 0.5,
            markup_rate: 0.25,
        }),
        earningsRow({
            date: "2026-04-15",
            pollen_baseline: 0.8,
            pollen_earned: 0.2,
            pollen_spent: 1,
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
        "date,app_key_id,app_name,requests,pollen_baseline,pollen_earned,pollen_spent,markup_rate",
    );
    expect(rows[0]).toBe(
        "2026-04-14,key_byop_app_1,BYOP App,5,0.4,0.1,0.5,0.25",
    );
    expect(rows[1]).toBe("2026-04-15,key_byop_app_1,BYOP App,5,0.8,0.2,1,0.25");
});
