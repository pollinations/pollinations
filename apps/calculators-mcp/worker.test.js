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
        { name: "calculators-test", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(
            new URL("https://calculators.internal/"),
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
test("private Worker leaves other routes to Gen", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://calculators/mcp"))).status,
        404,
    );
});
for (const modern of [false, true])
    test(`stateless protocol ${modern ? "modern" : "legacy"}: list and call`, async (t) => {
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await client.listTools()).tools.map((x) => x.name).sort(),
            [
                "currency_convert",
                "currency_list",
                "currency_rates",
                "check_contrast",
                "compare_versions",
                "to_fraction",
                "diff_text",
                "create_qr",
                "hash_text",
                "json_merge_patch",
                "inspect_unicode",
                "next_cron_runs",
                "rank_palette",
                "time_convert",
                "time_math",
            ].sort(),
        );
        const converted = await call(client, "time_convert", {
            time: "2026-01-01T00:00:00Z",
            to_timezones: ["Asia/Kathmandu"],
        });
        assert.equal(converted.utc, "2026-01-01T00:00:00Z");
        assert.match(converted.zones["Asia/Kathmandu"], /\+05:45/);
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

test("time duration preserves nanoseconds", async (t) => {
    const result = await call(await clientFor(t), "time_math", {
        start: "2026-01-01T00:00:00.000000001Z",
        end: "2026-01-01T00:00:00.000000002Z",
    });
    assert.equal(result.totalSeconds, 1e-9);
});

test("currency tools use fixed public rates without forwarding caller credentials", async (t) => {
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url, options) => {
        const target = new URL(url);
        requests.push(target);
        assert.equal(target.hostname, "api.frankfurter.dev");
        assert.equal(new Headers(options.headers).get("authorization"), null);
        assert.equal(new Headers(options.headers).get("cookie"), null);
        assert.ok(options.signal instanceof AbortSignal);
        return Response.json(
            target.pathname.endsWith("currencies")
                ? { EUR: "Euro", USD: "US Dollar" }
                : { base: "EUR", date: "2025-01-03", rates: { USD: 1.0299 } },
        );
    });
    const client = await clientFor(t);
    const converted = await call(client, "currency_convert", {
        amount: 100,
        from: "EUR",
        to: "USD",
        date: "2025-01-03",
    });
    assert.equal(converted.converted, 102.99);
    assert.equal(requests[0].searchParams.get("base"), "EUR");
    assert.equal(requests[0].searchParams.get("symbols"), "USD");
    assert.deepEqual(
        (
            await call(client, "currency_rates", {
                base: "EUR",
                symbols: ["USD"],
                date: "2025-01-03",
            })
        ).rates,
        { USD: 1.0299 },
    );
    assert.equal((await call(client, "currency_list")).EUR, "Euro");
});

test("hash_text digests UTF-8 text with Web Crypto and rejects empty input", async (t) => {
    const client = await clientFor(t);
    assert.deepEqual(await call(client, "hash_text", { text: "abc" }), {
        algorithm: "sha256",
        hex: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        base64: "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=",
        bytes: 32,
    });
    const sha1 = await call(client, "hash_text", {
        text: "abc",
        algorithm: "sha1",
    });
    assert.equal(sha1.hex, "a9993e364706816aba3e25717850c26c9cd0d89d");
    assert.equal(sha1.bytes, 20);
    assert.equal(
        (await call(client, "hash_text", { text: "abc", algorithm: "sha384" }))
            .bytes,
        48,
    );
    assert.equal(
        (await call(client, "hash_text", { text: "abc", algorithm: "sha512" }))
            .bytes,
        64,
    );
    assert.equal(
        (await call(client, "hash_text", { text: "héllo 👋" })).hex,
        "241bff4036211b66e25dc44c43c7305feb99e7a62b953f03c3597ad0593c508f",
    );
    for (const args of [{}, { text: "" }, { text: "abc", algorithm: "md5" }])
        assert.equal(
            (await client.callTool({ name: "hash_text", arguments: args }))
                .isError,
            true,
            JSON.stringify(args),
        );
});

test("compare_versions orders by SemVer precedence, not string order", async (t) => {
    const client = await clientFor(t);
    assert.deepEqual(
        await call(client, "compare_versions", {
            versions: ["1.10.0", "1.9.0", "2.0.0-rc.1", "2.0.0"],
        }),
        {
            sorted: ["1.9.0", "1.10.0", "2.0.0-rc.1", "2.0.0"],
            newest: "2.0.0",
            oldest: "1.9.0",
            equal: false,
        },
    );
    // A prerelease sorts before its release. Build metadata is ignored for
    // precedence but preserved in the returned strings.
    assert.deepEqual(
        await call(client, "compare_versions", {
            versions: ["1.0.0-rc.1", "1.0.0+build.5", "1.0.0"],
        }),
        {
            sorted: ["1.0.0-rc.1", "1.0.0+build.5", "1.0.0"],
            newest: "1.0.0",
            oldest: "1.0.0-rc.1",
            equal: false,
        },
    );
    assert.deepEqual(
        await call(client, "compare_versions", {
            versions: ["1.2.3+build.1", "1.2.3+build.2"],
        }),
        {
            sorted: ["1.2.3+build.1", "1.2.3+build.2"],
            newest: "1.2.3+build.2",
            oldest: "1.2.3+build.1",
            equal: true,
        },
    );
    // Parts above Number.MAX_SAFE_INTEGER stay distinct in the core version.
    assert.deepEqual(
        await call(client, "compare_versions", {
            versions: ["9007199254740993.0.0", "9007199254740992.0.0"],
        }),
        {
            sorted: ["9007199254740992.0.0", "9007199254740993.0.0"],
            newest: "9007199254740993.0.0",
            oldest: "9007199254740992.0.0",
            equal: false,
        },
    );
    // Numeric prerelease identifiers stay distinct above the safe range too.
    assert.deepEqual(
        await call(client, "compare_versions", {
            versions: ["1.0.0-9007199254740993", "1.0.0-9007199254740992"],
        }),
        {
            sorted: ["1.0.0-9007199254740992", "1.0.0-9007199254740993"],
            newest: "1.0.0-9007199254740993",
            oldest: "1.0.0-9007199254740992",
            equal: false,
        },
    );
    for (const args of [
        {},
        { versions: ["1.2.3"] },
        { versions: ["1.2.3", "latest"] },
        { versions: ["1.2", "1.2.3"] },
    ])
        assert.equal(
            (
                await client.callTool({
                    name: "compare_versions",
                    arguments: args,
                })
            ).isError,
            true,
            JSON.stringify(args),
        );
});

test("to_fraction converts decimals and reduces fractions exactly", async (t) => {
    const client = await clientFor(t);
    for (const [input, expected] of [
        ["0.5", "1/2"],
        ["1.5", "3/2"],
        ["0.25", "1/4"],
        ["4/6", "2/3"],
        ["-2.5", "-5/2"],
        ["+2.5", "5/2"],
        ["3.14159", "314159/100000"],
        // Exact through BigInt: this is the value a float would round to 1/3.
        ["0.3333333333333333", "3333333333333333/10000000000000000"],
        ["9360/1260", "52/7"],
        ["4/2", "2"],
        ["0.1", "1/10"],
    ]) {
        assert.deepEqual(
            await call(client, "to_fraction", { value: input }),
            { fraction: expected },
            input,
        );
    }
});

test("to_fraction rejects malformed input", async (t) => {
    const client = await clientFor(t);
    for (const args of [
        { value: "" },
        { value: "abc" },
        { value: "1.2.3" },
        { value: "1/0" },
        { value: "1/2/3" },
        { value: "1 / 2" },
        { value: "--5" },
        // A sign with nothing after it: the bare "+" and "-" already fall through to the
        // empty check, and the dotted forms would otherwise parse as a whole number of 0.
        { value: "." },
        { value: "+." },
        { value: "-." },
        { value: "+" },
        { value: "-" },
    ]) {
        assert.equal(
            (await client.callTool({ name: "to_fraction", arguments: args }))
                .isError,
            true,
            JSON.stringify(args),
        );
    }
});

test("diff_text produces a minimal unified diff with line counts", async (t) => {
    const client = await clientFor(t);

    const changed = await call(client, "diff_text", {
        before: "a\nb\nc\n",
        after: "a\nB\nc\n",
        context: 3,
    });
    assert.equal(changed.diff, "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c");
    assert.equal(changed.added, 1);
    assert.equal(changed.removed, 1);

    const identical = await call(client, "diff_text", {
        before: "a\n",
        after: "a\n",
        context: 3,
    });
    assert.deepEqual(identical, { diff: "", added: 0, removed: 0 });

    // Empty text has zero lines, so the hunk starts at 0 and there is nothing to remove.
    const inserted = await call(client, "diff_text", {
        before: "",
        after: "x\n",
        context: 3,
    });
    assert.equal(inserted.diff, "@@ -0,0 +1 @@\n+x");
    assert.equal(inserted.added, 1);
    assert.equal(inserted.removed, 0);

    // A single changed line in the middle keeps only one line of context either side.
    const narrow = await call(client, "diff_text", {
        before: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10",
        after: "1\n2\n3\n4\nX\n6\n7\n8\n9\n10",
        context: 1,
    });
    assert.equal(narrow.diff, "@@ -4,3 +4,3 @@\n 4\n-5\n+X\n 6");

    // The script is minimal: moving one line must report one removal and one addition,
    // not a whole-block replacement.
    const moved = await call(client, "diff_text", {
        before: "a\nb\nc\nd\n",
        after: "b\nc\nd\na\n",
        context: 0,
    });
    assert.equal(moved.added, 1);
    assert.equal(moved.removed, 1);
});

test("json_merge_patch recursively merges objects and removes null members", async (t) => {
    const client = await clientFor(t);
    const result = await call(client, "json_merge_patch", {
        target: JSON.stringify({
            title: "Goodbye!",
            author: { givenName: "John", familyName: "Doe" },
            tags: ["example", "sample"],
            content: "unchanged",
        }),
        patch: JSON.stringify({
            title: "Hello!",
            author: { familyName: null },
        }),
    });
    assert.deepEqual(result, {
        title: "Hello!",
        author: { givenName: "John" },
        tags: ["example", "sample"],
        content: "unchanged",
    });
});

test("json_merge_patch replaces arrays and non-object values per RFC 7396", async (t) => {
    const client = await clientFor(t);
    assert.deepEqual(
        await call(client, "json_merge_patch", {
            target: '{"items":[1,2],"keep":true}',
            patch: '{"items":[3,null]}',
        }),
        { items: [3, null], keep: true },
    );
    assert.deepEqual(
        await call(client, "json_merge_patch", {
            target: '{"a":1}',
            patch: '[1,2]',
        }),
        [1, 2],
    );
    assert.equal(
        await call(client, "json_merge_patch", {
            target: '{"a":1}',
            patch: 'null',
        }),
        null,
    );
    assert.deepEqual(
        await call(client, "json_merge_patch", {
            target: '"scalar"',
            patch: '{"a":{"b":null},"c":2}',
        }),
        { a: {}, c: 2 },
    );
    assert.equal(
        await call(client, "json_merge_patch", {
            target: "{}",
            patch: '"hello"',
        }),
        "hello",
    );
});

test("json_merge_patch safely handles special object keys and malformed JSON", async (t) => {
    const client = await clientFor(t);
    const result = await call(client, "json_merge_patch", {
        target: '{"__proto__":{"safe":true},"constructor":{"old":1}}',
        patch: '{"__proto__":{"extra":2},"constructor":{"new":2}}',
    });
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.deepEqual(
        result,
        JSON.parse('{"__proto__":{"safe":true,"extra":2},"constructor":{"old":1,"new":2}}'),
    );
    assert.equal(({}).extra, undefined);

    const invalid = await client.callTool({
        name: "json_merge_patch",
        arguments: { target: "{", patch: "{}" },
    });
    assert.equal(invalid.isError, true);
});

test("diff_text reports a missing final newline the way diff(1) does", async (t) => {
    const client = await clientFor(t);

    // Same text, only the terminator changed: a replacement, with the marker right after
    // the line it describes.
    const added = await call(client, "diff_text", {
        before: "a",
        after: "a\n",
        context: 3,
    });
    assert.equal(
        added.diff,
        "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a",
    );
    assert.equal(added.added, 1);
    assert.equal(added.removed, 1);

    const removed = await call(client, "diff_text", {
        before: "a\n",
        after: "a",
        context: 3,
    });
    assert.equal(
        removed.diff,
        "@@ -1 +1 @@\n-a\n+a\n\\ No newline at end of file",
    );
    assert.equal(removed.added, 1);
    assert.equal(removed.removed, 1);

    // Neither side ends with a newline, so both rendered lines carry the marker.
    const both = await call(client, "diff_text", {
        before: "a",
        after: "b",
        context: 3,
    });
    assert.equal(
        both.diff,
        "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file",
    );

    // The incomplete last line sits outside the hunk, so nothing is printed for it: the
    // marker belongs to a rendered line, not to the file as a whole.
    // Line 10 is the one without a terminator, and it sits outside the hunk, so GNU
    // prints nothing for it. This is the case the previous revision got wrong by
    // appending a single marker for the whole diff.
    const outside = await call(client, "diff_text", {
        before: "1\n2\n3\n4\n5\n6\n7\n8\n9\n10",
        after: "1\n2\n3\n4\nX\n6\n7\n8\n9\n10",
        context: 1,
    });
    assert.equal(outside.diff, "@@ -4,3 +4,3 @@\n 4\n-5\n+X\n 6");
});

test("diff_text rejects input past the line cap", async (t) => {
    const client = await clientFor(t);
    const tooMany = Array.from({ length: 2001 }, (_, i) => `line ${i}`).join(
        "\n",
    );
    const result = await client.callTool({
        name: "diff_text",
        arguments: { before: tooMany, after: "x" },
    });
    assert.equal(result.isError, true);
});
