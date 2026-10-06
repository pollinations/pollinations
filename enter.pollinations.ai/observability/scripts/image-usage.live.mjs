// Run with an existing staging operator TB_TOKEN:
// node --experimental-strip-types --test observability/scripts/image-usage.live.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sendToTinybird } from "../../../shared/events.ts";

const host = "https://api.europe-west2.gcp.tinybird.co";
async function request(path, params = {}) {
    const response = await fetch(
        `${host}${path}?${new URLSearchParams(params)}`,
        {
            headers: { Authorization: `Bearer ${process.env.TB_TOKEN}` },
        },
    );
    assert.equal(response.status, 200, await response.clone().text());
    return response;
}
async function sql(q) {
    const result = await (
        await request("/v0/sql", { q: `${q} FORMAT JSON` })
    ).json();
    assert.equal(result.error, undefined);
    return result.data;
}

test("fractional image usage survives ingestion, Activity exports and hourly sums", async () => {
    assert.ok(process.env.TB_TOKEN, "Set an existing staging TB_TOKEN");
    const workspace = await (await request("/v1/workspace")).json();
    assert.equal(
        workspace.name,
        "pollinations_enter_staging",
        "This test writes staging fixtures only",
    );
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const units = [
        [0.9216, 2.0736],
        [0, 0.311296],
        [4, 1],
    ];
    for (const [index, [prompt, completion]] of units.entries()) {
        await sendToTinybird(
            {
                id: `${id}-${index}`,
                requestId: id,
                requestPath: "/image/test",
                startTime: timestamp,
                endTime: timestamp,
                environment: "debug-prod-copy",
                eventType: "generate.image",
                userId: id,
                resolvedModelRequested: id,
                responseStatus: 200,
                isBilledUsage: true,
                isFinal: true,
                tokenCountPromptImage: prompt,
                tokenCountCompletionImage: completion,
                totalPrice: 0.1,
            },
            `${host}/v0/events?name=generation_event_v2`,
            process.env.TB_TOKEN,
            {
                error: (message, details) =>
                    assert.fail(`${message}: ${JSON.stringify(details)}`),
            },
        );
    }
    let rows = [];
    for (let attempt = 0; attempt < 20; attempt++) {
        rows = await sql(
            `SELECT event_id, usage_prompt_image_units AS prompt, usage_completion_image_units AS completion, total_price FROM generation_event_v2 WHERE start_time >= now() - INTERVAL 1 HOUR AND request_id = '${id}' ORDER BY event_id`,
        );
        if (rows.length === units.length) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.deepEqual(
        rows.map((row) => [row.prompt, row.completion]),
        units,
    );
    assert.ok(rows.every((row) => row.total_price === 0.1));
    const quarantine = await sql(
        `SELECT count() AS n FROM generation_event_v2_quarantine WHERE request_id = '${id}'`,
    );
    assert.equal(quarantine[0].n, 0);
    const activity = await (
        await request("/v0/pipes/activity_usage_transactions.json", {
            user_id: id,
        })
    ).json();
    assert.equal(activity.data.length, units.length);
    for (const [index, expected] of units.entries()) {
        const row = activity.data.find(
            (row) => row.cursor_event_id === `${id}-${index}`,
        );
        assert.deepEqual(
            [row.input_image_tokens, row.output_image_tokens],
            expected,
        );
        assert.equal(row.cost_usd, 0.1);
    }
    const csv = await (
        await request("/v0/pipes/activity_usage_transactions.csv", {
            user_id: id,
        })
    ).text();
    assert.match(csv, /0\.9216/);
    assert.match(csv, /2\.0736/);
    assert.match(csv, /0\.311296/);
    const hourly = await sql(
        `SELECT sumMerge(prompt_image_units) AS prompt, sumMerge(completion_image_units) AS completion, sumMerge(gross_consumption) AS price FROM generation_usage_hourly WHERE hour >= toStartOfHour(now() - INTERVAL 1 HOUR) AND model = '${id}'`,
    );
    assert.ok(Math.abs(hourly[0].prompt - 4.9216) < 1e-9);
    assert.ok(Math.abs(hourly[0].completion - 3.384896) < 1e-9);
    assert.ok(Math.abs(hourly[0].price - 0.3) < 1e-9);
});
