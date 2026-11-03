import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["csv_inspect", "csv_query"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(token = TOKEN) {
    const client = new Client(
        { name: "csv-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://csv-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: { headers: { Authorization: `Bearer ${token}` } },
        },
    );
    await client.connect(transport);
    return client;
}

const CSV = 'name,price,qty\n"Bolt, M6",2,10\nNut,1.5,4\nWasher,0.25,100';

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://csv-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://csv-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="csv-mcp.pollinations.ai"',
    );
});

test("lists the csv tools", async () => {
    const client = await connectClient();
    try {
        const { tools } = await client.listTools();
        assert.deepEqual(
            tools.map((tool) => tool.name).sort(),
            [...EXPECTED_TOOLS].sort(),
        );
    } finally {
        await client.close();
    }
});

test("inspect reports types and a sample", async () => {
    const client = await connectClient();
    try {
        const result = await client.callTool({
            name: "csv_inspect",
            arguments: { csv: CSV },
        });
        const summary = JSON.parse(result.content[0].text);
        assert.equal(summary.delimiter, ",");
        assert.equal(summary.rows, 3);
        assert.deepEqual(
            summary.columns.map((column) => [column.name, column.type]),
            [
                ["name", "string"],
                ["price", "number"],
                ["qty", "integer"],
            ],
        );
        assert.equal(summary.sample[0].name, "Bolt, M6");
    } finally {
        await client.close();
    }
});

test("query filters, sorts and pages", async () => {
    const client = await connectClient();
    try {
        const result = await client.callTool({
            name: "csv_query",
            arguments: {
                csv: CSV,
                where: [{ column: "qty", op: "gte", value: "10" }],
                order_by: { column: "price", direction: "desc" },
                limit: 5,
            },
        });
        const page = JSON.parse(result.content[0].text);
        assert.deepEqual(
            page.rows.map((row) => row.name),
            ["Bolt, M6", "Washer"],
        );
        assert.equal(page.matched, 2);
        assert.equal(page.total, 3);
    } finally {
        await client.close();
    }
});

test("an unknown column comes back as a tool error", async () => {
    const client = await connectClient();
    try {
        const result = await client.callTool({
            name: "csv_query",
            arguments: {
                csv: CSV,
                where: [{ column: "nope", op: "eq", value: "1" }],
            },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /Unknown column/);
    } finally {
        await client.close();
    }
});

test("rejects an oversized csv", async () => {
    const client = await connectClient();
    try {
        const result = await client.callTool({
            name: "csv_inspect",
            arguments: { csv: "a\n" + "x".repeat(1_000_001) },
        });
        assert.equal(result.isError, true);
    } finally {
        await client.close();
    }
});
