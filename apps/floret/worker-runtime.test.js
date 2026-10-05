import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createFetchMock, Miniflare } from "miniflare";

// Exercise the bundled Worker, real catalog DO and installed E2B SDK in workerd.
// Only remote HTTP services are replaced; no Floret code or SDK is mocked.
test("the bundled Worker authenticates before E2B and preserves control API failures", async () => {
    const mock = createFetchMock();
    mock.disableNetConnect();
    mock.get("https://enter.pollinations.ai")
        .intercept({ path: "/api/account/key", method: "GET" })
        .reply(200, { valid: true })
        .persist();
    mock.get("https://gen.pollinations.ai")
        .intercept({ path: "/models", method: "GET" })
        .reply(200, [
            {
                name: "test",
                category: "text",
                capabilities: ["chat"],
                pricing: { currency: "pollen", prompt: "0", completion: "0" },
            },
        ])
        .persist();
    const mf = new Miniflare({
        modules: [
            {
                type: "ESModule",
                path: fileURLToPath(
                    new URL("./temp/worker/worker.js", import.meta.url),
                ),
            },
        ],
        compatibilityDate: "2026-01-01",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: {
            FLORET_CATALOG: { className: "FloretCatalog", useSQLite: true },
        },
        fetchMock: mock,
        cf: false,
    });
    try {
        assert.deepEqual(
            await (await mf.dispatchFetch("https://floret.test/health")).json(),
            { status: "ok" },
        );
        assert.equal(
            (
                await mf.dispatchFetch(
                    "https://floret.test/v1/chat/completions",
                    { method: "POST" },
                )
            ).status,
            401,
        );
        let creates = 0;
        for (const status of [401, 402, 403, 429, 503]) {
            mock.get("https://gen.pollinations.ai")
                .intercept({ path: "/alpha/e2b/v2/sandboxes", method: "POST" })
                .reply(() => {
                    creates++;
                    return {
                        statusCode: status,
                        data: JSON.stringify({
                            code: status,
                            message: "sandbox rejected",
                        }),
                        responseOptions: {
                            headers: { "Content-Type": "application/json" },
                        },
                    };
                });
            const response = await mf.dispatchFetch(
                "https://floret.test/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer sk_existing",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "floret",
                        messages: [{ role: "user", content: "hi" }],
                    }),
                },
            );
            assert.equal(response.status, status);
        }
        assert.equal(creates, 5, "No duplicate VM purchases or create retries");
        mock.assertNoPendingInterceptors();
    } finally {
        await mf.dispose();
    }
});
