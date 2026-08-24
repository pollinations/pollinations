import assert from "node:assert/strict";
import test from "node:test";
import {
    checkTinybirdContract,
    REQUIRED_PIPES,
} from "./check-tinybird-contract.mjs";

test("accepts only when every required pipe returns a data array", async () => {
    const requested = [];
    await checkTinybirdContract({
        api: "https://tinybird.test",
        token: "redacted",
        fetchImpl: async (url, options) => {
            requested.push({ url, options });
            return Response.json({ data: [] });
        },
    });

    assert.deepEqual(
        requested.map(({ url }) => url),
        REQUIRED_PIPES.map(
            (pipe) => `https://tinybird.test/v0/pipes/${pipe}.json`,
        ),
    );
    assert.ok(
        requested.every(
            ({ options }) =>
                options.headers.Authorization === "Bearer redacted",
        ),
    );
});

test("blocks deployment when a pipe is absent or malformed", async () => {
    await assert.rejects(
        checkTinybirdContract({
            api: "https://tinybird.test",
            token: "redacted",
            fetchImpl: async (url) => {
                if (url.includes("op_forecast_api")) {
                    return new Response(null, { status: 404 });
                }
                if (url.includes("op_pollen_api")) {
                    return Response.json({ rows: [] });
                }
                return Response.json({ data: [] });
            },
        }),
        /op_pollen_api: invalid shape; op_forecast_api: HTTP 404/,
    );
});
