import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { Resvg } from "@resvg/resvg-js";
import jsQR from "jsqr";
import worker from "./worker.js";

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "toolbox-test", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://toolbox.internal/"),
            {
                fetch: (input, init) =>
                    worker.fetch(
                        input instanceof Request
                            ? input
                            : new Request(input, init),
                    ),
            },
        ),
    );
    t.after(() => client.close());
    return client;
}
async function call(client, name, args = {}) {
    const result = await client.callTool({ name, arguments: args });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
}
test("private deployment has no public routes or preview URLs", () => {
    const config = JSON.parse(
        readFileSync(
            new URL("./wrangler.jsonc", import.meta.url),
            "utf8",
        ).replace(/^\s*\/\/.*$/gm, ""),
    );
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
});
test("health, unknown paths, and batches", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://toolbox/health"))).status,
        200,
    );
    assert.equal(
        (await worker.fetch(new Request("https://toolbox/mcp"))).status,
        404,
    );
    assert.equal(
        (
            await worker.fetch(
                new Request("https://toolbox/", {
                    method: "POST",
                    body: "[]",
                    headers: { "Content-Type": "application/json" },
                }),
            )
        ).status,
        400,
    );
});
for (const modern of [false, true])
    test(`stateless protocol ${modern ? "modern" : "legacy"}: list and call`, async (t) => {
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map((x) => x.name).sort(),
            [
                "check_contrast",
                "create_qr",
                "inspect_unicode",
                "next_cron_runs",
                "rank_palette",
                "time_convert",
                "time_math",
                "time_now",
            ],
        );
        const now = await call(client, "time_now", {
            timezones: ["Asia/Kathmandu"],
        });
        assert.ok(Math.abs(now.unixMillis - Date.now()) < 5000);
        assert.match(now.zones["Asia/Kathmandu"], /\+05:45/);
    });
test("time conversion handles DST, fractional offsets and invalid dates", async (t) => {
    const client = await clientFor(t);
    const winter = await call(client, "time_convert", {
        time: "2026-01-10T12:00:00",
        from_timezone: "Europe/Berlin",
        to_timezones: ["UTC", "Asia/Kathmandu"],
    });
    assert.equal(winter.utc, "2026-01-10T11:00:00Z");
    assert.match(winter.zones["Asia/Kathmandu"], /16:45:00\+05:45/);
    assert.equal(
        (
            await call(client, "time_convert", {
                time: "2026-07-10T12:00:00",
                from_timezone: "Europe/Berlin",
            })
        ).utc,
        "2026-07-10T10:00:00Z",
    );
    for (const args of [
        { time: "2026-03-29T02:30:00", from_timezone: "Europe/Berlin" },
        { time: "2026-10-25T02:30:00", from_timezone: "Europe/Berlin" },
        { time: "2026-02-30T12:00:00Z" },
        { time: "2026-07-01T12:00:00+02:00[Europe/Berlin]" },
        { time: "2026-01-10T25:00:00Z" },
        { time: "2026-01-10T12:00:00Z", from_timezone: "Europe/Berlin" },
        { time: "2026-01-10T12:00:00Z", to_timezones: ["Not/AZone"] },
    ])
        assert.equal(
            (await client.callTool({ name: "time_convert", arguments: args }))
                .isError,
            true,
            JSON.stringify(args),
        );
    assert.equal(
        (
            await call(client, "time_convert", {
                time: "2026-10-25T02:30:00+02:00",
            })
        ).utc,
        "2026-10-25T00:30:00Z",
    );
});
test("date math clamps month ends, supports reverse intervals and rejects conflicting inputs", async (t) => {
    const client = await clientFor(t);
    assert.equal(
        (
            await call(client, "time_math", {
                start: "2024-01-31T10:00:00Z",
                changes: { months: 1 },
            })
        ).result,
        "2024-02-29T10:00:00Z",
    );
    assert.equal(
        (
            await call(client, "time_math", {
                start: "2024-02-29T10:00:00Z",
                changes: { years: 1 },
            })
        ).result,
        "2025-02-28T10:00:00Z",
    );
    assert.equal(
        (
            await call(client, "time_math", {
                start: "2026-01-01T00:00:00Z",
                changes: { months: -1 },
            })
        ).result,
        "2025-12-01T00:00:00Z",
    );
    assert.equal(
        (
            await call(client, "time_math", {
                start: "2026-01-02T00:00:00Z",
                end: "2026-01-01T00:00:00Z",
            })
        ).totalSeconds,
        -86400,
    );
    for (const args of [
        { start: "2026-01-01" },
        { start: "2026-01-01", changes: {}, end: "2026-01-02" },
    ])
        assert.equal(
            (await client.callTool({ name: "time_math", arguments: args }))
                .isError,
            true,
        );
});
test("cron uses exclusive starts, OR semantics, DST and bounded impossible schedules", {
    timeout: 10000,
}, async (t) => {
    const client = await clientFor(t);
    const runs = await call(client, "next_cron_runs", {
        expression: "0 9 * * 1-5",
        timezone: "Europe/Berlin",
        start: "2026-03-27T08:00:00Z",
        count: 2,
    });
    assert.deepEqual(
        runs.runs.map((x) => x.utc),
        ["2026-03-30T07:00:00Z", "2026-03-31T07:00:00Z"],
    );
    const or = await call(client, "next_cron_runs", {
        expression: "0 0 1 * 1",
        start: "2026-06-02T00:00:00Z",
        count: 1,
    });
    assert.equal(or.runs[0].utc, "2026-06-08T00:00:00Z");
    const hourly = await call(client, "next_cron_runs", {
        expression: "0 * * * *",
        timezone: "Europe/Berlin",
        start: "2026-03-29T00:00:00Z",
        count: 4,
    });
    assert.deepEqual(
        hourly.runs.map((run) => run.utc),
        [
            "2026-03-29T01:00:00Z",
            "2026-03-29T02:00:00Z",
            "2026-03-29T03:00:00Z",
            "2026-03-29T04:00:00Z",
        ],
    );
    const gap = await call(client, "next_cron_runs", {
        expression: "30 2 * * *",
        timezone: "Europe/Berlin",
        start: "2026-03-28T02:00:00Z",
        count: 1,
    });
    assert.equal(gap.runs[0].local, "2026-03-29T03:30:00+02:00[Europe/Berlin]");
    const fold = await call(client, "next_cron_runs", {
        expression: "30 2 * * *",
        timezone: "Europe/Berlin",
        start: "2026-10-24T02:00:00Z",
        count: 2,
    });
    assert.deepEqual(
        fold.runs.map((run) => run.utc),
        ["2026-10-25T00:30:00Z", "2026-10-26T01:30:00Z"],
    );
    assert.deepEqual(
        (
            await call(client, "next_cron_runs", {
                expression: "0 0 31 2 *",
                start: "2026-01-01T00:00:00Z",
            })
        ).runs,
        [],
    );
    for (const args of [
        { expression: "* * * * * *" },
        { expression: "60 * * * *" },
        { expression: "* * * * *", count: 21 },
        { expression: "* * * * *", timezone: "No/Zone" },
        { expression: "* * * * *", start: "2026-02-30T00:00:00Z" },
    ])
        assert.equal(
            (await client.callTool({ name: "next_cron_runs", arguments: args }))
                .isError,
            true,
            JSON.stringify(args),
        );
});
test("contrast uses real ratios, with shorthand and sorted palette", async (t) => {
    const client = await clientFor(t);
    assert.equal(
        (
            await call(client, "check_contrast", {
                foreground: "#000",
                background: "#fff",
            })
        ).ratio,
        21,
    );
    const borderline = await call(client, "check_contrast", {
        foreground: "#777",
        background: "#fff",
    });
    assert.equal(borderline.wcag_2_2.normal_text.aa, false);
    assert.equal(borderline.wcag_2_2.large_text.aa, true);
    const rounded = await call(client, "check_contrast", {
        foreground: "#6e7978",
        background: "#fff",
    });
    assert.equal(rounded.ratio, 4.5);
    assert.equal(rounded.wcag_2_2.normal_text.aa, false);
    const palette = await call(client, "rank_palette", {
        background: "#fff",
        colors: ["#aaa", "#000", "#fff"],
    });
    assert.deepEqual(
        palette.colors.map((c) => c.color),
        ["#000000", "#aaaaaa", "#ffffff"],
    );
});
test("Unicode flags lookalikes and invisible characters without calling the network", async (t) => {
    const client = await clientFor(t);
    const result = await call(client, "inspect_unicode", {
        text: "pаy\u200b👋",
    });
    assert.equal(result.codePointCount, 5);
    assert.equal(result.confusableSkeleton, "pay👋");
    assert.deepEqual(
        result.suspicious.map((x) => x.codePoint),
        ["U+0430", "U+200B"],
    );
    assert.equal(
        (await call(client, "inspect_unicode", { text: "👋".repeat(4000) }))
            .codePointCount,
        4000,
    );
    assert.equal(
        (
            await client.callTool({
                name: "inspect_unicode",
                arguments: { text: "a".repeat(4001) },
            })
        ).isError,
        true,
    );
});
test("QR generates real SVG and rejects empty or oversized UTF-8 payloads", async (t) => {
    const client = await clientFor(t);
    const qr = await client.callTool({
        name: "create_qr",
        arguments: { text: "https://pollinations.ai/你好" },
    });
    assert.notEqual(qr.isError, true);
    assert.match(qr.content[0].text, /<svg[^>]+viewBox=/);
    assert.match(qr.content[0].text, /<path/);
    const rendered = new Resvg(qr.content[0].text, {
        fitTo: { mode: "width", value: 360 },
    }).render();
    const decoded = jsQR(
        new Uint8ClampedArray(rendered.pixels),
        rendered.width,
        rendered.height,
    );
    assert.equal(decoded?.data, "https://pollinations.ai/你好");
    const accented = await client.callTool({
        name: "create_qr",
        arguments: { text: "Café — Ω 👋" },
    });
    assert.notEqual(accented.isError, true);
    const accentedImage = new Resvg(accented.content[0].text, {
        fitTo: { mode: "width", value: 360 },
    }).render();
    assert.equal(
        jsQR(
            new Uint8ClampedArray(accentedImage.pixels),
            accentedImage.width,
            accentedImage.height,
        )?.data,
        "Café — Ω 👋",
    );
    for (const text of ["", "👋".repeat(1000), "a".repeat(2000)]) {
        const result = await client.callTool({
            name: "create_qr",
            arguments: { text, error_correction: "high" },
        });
        assert.equal(result.isError, true);
    }
});
