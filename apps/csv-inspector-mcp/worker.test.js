import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { inspectCsv } from "./inspect.js";
import worker from "./worker.js";

async function client(t, modern = false) {
    const c = new Client(
        { name: "csv-test", version: "1" },
        {
            capabilities: {},
            ...(modern && { versionNegotiation: { mode: "auto" } }),
        },
    );
    await c.connect(
        new StreamableHTTPClientTransport(new URL("https://csv.test"), {
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
            requestInit: { headers: { Authorization: "Bearer sk_dummy" } },
        }),
    );
    t.after(() => c.close());
    return c;
}

test("summarizes ragged rows and numeric-looking values without coercing cells", () => {
    const r = inspectCsv({
        csv: "item,value\n001,2\n002,\n003\n004,5,extra\n005,=2+2",
    });
    assert.equal(r.rowCount, 5);
    assert.deepEqual(r.irregularDataRows, [3, 4]);
    assert.deepEqual(r.columns[1], {
        index: 2,
        name: "value",
        empty: 1,
        missing: 1,
        numericLooking: 2,
        min: 2,
        max: 5,
    });
    assert.equal(r.preview[0][0], "001");
    assert.equal(r.preview[4][1], "=2+2");
});
test("handles BOM, CRLF, quoted delimiters, escaped quotes and multiline fields", () => {
    const r = inspectCsv({
        csv: '\uFEFFname,note\r\nA,"hello, world"\r\nB,"two\r\nlines"\r\nC,"a ""quote"""\r\n',
    });
    assert.equal(r.columns[0].name, "name");
    assert.equal(r.rowCount, 3);
    assert.deepEqual(r.preview, [
        ["A", "hello, world"],
        ["B", "two\r\nlines"],
        ["C", 'a "quote"'],
    ]);
});
test("detects common delimiters and rejects ambiguity", () => {
    for (const delimiter of [",", ";", "\t", "|"]) {
        assert.equal(
            inspectCsv({ csv: `a${delimiter}b\n1${delimiter}2` }).delimiter,
            delimiter,
        );
    }
    assert.throws(() => inspectCsv({ csv: "a,b;c\n1,2;3" }), /Ambiguous/);
    assert.equal(
        inspectCsv({ csv: "a,b;c\n1,2;3", delimiter: ";" }).delimiter,
        ";",
    );
});
test("supports headerless and single-column data, flags duplicate headers", () => {
    const r = inspectCsv({ csv: "1,2\n3,4", header: false });
    assert.equal(r.rowCount, 2);
    assert.equal(r.columns[0].name, "column_1");
    assert.equal(inspectCsv({ csv: "hello\nworld" }).columnCount, 1);
    assert.deepEqual(
        inspectCsv({ csv: "x,x\na,b" }).duplicateHeaderColumns,
        [2],
    );
    assert.equal(inspectCsv({ csv: "header\n" }).rowCount, 0);
});
test("rejects malformed CSV and empty records without echoing input", () => {
    assert.throws(
        () => inspectCsv({ csv: 'name,note\nsecret,"unclosed' }),
        /Malformed CSV/,
    );
    assert.throws(() => inspectCsv({ csv: "\n\n" }), /no non-empty/);
});
test("enforces byte, row and column limits and bounds previews", () => {
    assert.throws(() => inspectCsv({ csv: "é".repeat(70000) }), /128 KiB/);
    assert.throws(
        () => inspectCsv({ csv: `a\n${"x\n".repeat(10001)}` }),
        /10,000/,
    );
    assert.throws(
        () => inspectCsv({ csv: Array(201).fill("x").join(",") }),
        /200 columns/,
    );
    const r = inspectCsv({
        csv: `a\n${Array(10).fill("x".repeat(1000)).join("\n")}`,
    });
    assert.equal(r.preview.length, 5);
    assert.equal(r.preview[0][0].length, 200);
});
test("serves health, requires valid bearer syntax and rejects batches", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://csv.test/health"))).status,
        200,
    );
    assert.equal(
        (await worker.fetch(new Request("https://csv.test/missing"))).status,
        404,
    );
    for (const auth of ["", "Basic x", "Bearer", "Bearer one two"]) {
        assert.equal(
            (
                await worker.fetch(
                    new Request("https://csv.test", {
                        headers: { Authorization: auth },
                    }),
                )
            ).status,
            401,
        );
    }
    assert.equal(
        (
            await worker.fetch(
                new Request("https://csv.test", {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer dummy",
                        "Content-Type": "application/json",
                    },
                    body: "[]",
                }),
            )
        ).status,
        400,
    );
});
test("works over legacy and modern MCP with no outbound network calls", async (t) => {
    t.mock.method(globalThis, "fetch", () => {
        throw new Error("Unexpected network call");
    });
    for (const modern of [false, true]) {
        const c = await client(t, modern);
        assert.equal(c.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual(
            (await c.listTools()).tools.map((t) => t.name),
            ["inspect_csv"],
        );
        const r = await c.callTool({
            name: "inspect_csv",
            arguments: { csv: "a,b\n1,2" },
        });
        assert.notEqual(r.isError, true);
        assert.equal(JSON.parse(r.content[0].text).rowCount, 1);
        assert.equal(JSON.stringify(r).includes("sk_dummy"), false);
    }
});
test("reports tool errors and invalid arguments", async (t) => {
    const c = await client(t, true);
    for (const args of [
        { csv: 'a,"unclosed' },
        { csv: "" },
        { csv: "a", delimiter: "xx" },
        { csv: "a", header: "yes" },
    ]) {
        const r = await c.callTool({ name: "inspect_csv", arguments: args });
        assert.equal(r.isError, true);
    }
});
