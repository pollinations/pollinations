import assert from "node:assert/strict";
import test from "node:test";
import { fetchMtd } from "../lib/providers/deepinfra.mjs";

test("Deep Infra treats live spend as prepaid credit burn, not cash", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.DEEPINFRA_API_KEY;
    process.env.DEEPINFRA_API_KEY = "test-key";

    const seenUrls = [];
    globalThis.fetch = async (url) => {
        seenUrls.push(String(url));
        if (String(url).startsWith("https://api.deepinfra.com/v1/me")) {
            return Response.json({
                checklist: {
                    stripe_balance: 360,
                },
            });
        }
        if (String(url).startsWith("https://api.deepinfra.com/payment/usage")) {
            return Response.json({
                months: [
                    {
                        period: "2026-05",
                        total_cost: 12.34,
                        items: [{ model: { model_name: "test" } }],
                    },
                ],
            });
        }
        throw new Error(`unexpected url: ${url}`);
    };

    try {
        const pool = { provider: "deepinfra", kind: "payg" };
        const result = await fetchMtd("2026-05", pool);

        assert.deepEqual(result, {
            mtd_total_usd: 12.34,
            mtd_credit_usd: 12.34,
            mtd_cash_usd: 0,
            records: 1,
            as_of: new Date().toISOString().slice(0, 10),
            live_balance: true,
        });
        assert.equal(pool.kind, "credit");
        assert.equal(pool.current_balance_usd, 360);
        assert.equal(pool.mtd_cash_usd, 0);
        assert.ok(
            seenUrls.some((url) =>
                url.startsWith("https://api.deepinfra.com/v1/me"),
            ),
        );
    } finally {
        globalThis.fetch = originalFetch;
        if (originalKey === undefined) {
            delete process.env.DEEPINFRA_API_KEY;
        } else {
            process.env.DEEPINFRA_API_KEY = originalKey;
        }
    }
});
