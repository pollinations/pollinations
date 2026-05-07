import assert from "node:assert/strict";
import test from "node:test";
import { fetchMtd } from "../lib/providers/openrouter.mjs";

test("OpenRouter wrapper computes MTD from account usage delta", async (t) => {
    const oldKey = process.env.OPENROUTER_MANAGEMENT_API_KEY;
    process.env.OPENROUTER_MANAGEMENT_API_KEY = "sk-or-mgmt-test";
    t.after(() => {
        if (oldKey === undefined) {
            delete process.env.OPENROUTER_MANAGEMENT_API_KEY;
        } else {
            process.env.OPENROUTER_MANAGEMENT_API_KEY = oldKey;
        }
    });

    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        assert.equal(url, "https://openrouter.ai/api/v1/credits");
        assert.equal(init.headers.Authorization, "Bearer sk-or-mgmt-test");
        return Response.json({
            data: {
                total_credits: 3000,
                total_usage: 125.5,
            },
        });
    };
    t.after(() => {
        globalThis.fetch = oldFetch;
    });

    const pool = {
        month_open_as_of: "2026-05",
        month_open_usage_usd: 100,
    };

    const result = await fetchMtd("2026-05", pool);

    assert.deepEqual(result, {
        mtd_total_usd: 25.5,
        mtd_credit_usd: 25.5,
        mtd_cash_usd: 0,
        records: 1,
        as_of: new Date().toISOString().slice(0, 10),
        live_balance: true,
    });
    assert.equal(pool.total_credits_usd, 3000);
    assert.equal(pool.total_usage_usd, 125.5);
    assert.equal(pool.current_balance_usd, 2874.5);
});
