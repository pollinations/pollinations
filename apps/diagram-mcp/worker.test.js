import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "diagram_generate",
    "diagram_render",
    "diagram_validate",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "diagram-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://diagram-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://diagram-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.name, "diagram-mcp");
    assert.equal(healthBody.endpoint, "/");
    assert.equal(healthBody.stateless, true);

    const unauthorized = await worker.fetch(
        new Request("https://diagram-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="diagram-mcp.pollinations.ai"',
    );

    const notFound = await worker.fetch(
        new Request("https://diagram-mcp.pollinations.ai/unknown-path"),
    );
    assert.equal(notFound.status, 404);
});

test("serves Streamable HTTP and lists all expected diagram tools", async () => {
    const client = await connectClient();
    const tools = (await client.listTools()).tools;
    assert.deepEqual(
        tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS.sort(),
    );
    await client.close();
});

test("diagram_validate validates valid flowchart and catches invalid brackets", async () => {
    const client = await connectClient();

    // 1. Valid flowchart
    const validRes = await client.callTool({
        name: "diagram_validate",
        arguments: {
            code: "flowchart TD\n  A[Start] --> B(Process)\n  B --> C{Decision}\n  C -->|Yes| D[Done]",
        },
    });
    const validData = JSON.parse(validRes.content[0].text);
    assert.equal(validData.valid, true);
    assert.equal(validData.format, "mermaid");
    assert.equal(validData.diagramType, "flowchart");
    assert.equal(validData.errors.length, 0);

    // 2. Invalid syntax (unclosed bracket)
    const invalidRes = await client.callTool({
        name: "diagram_validate",
        arguments: {
            code: "flowchart TD\n  A[Start --> B[End]",
        },
    });
    const invalidData = JSON.parse(invalidRes.content[0].text);
    assert.equal(invalidData.valid, false);
    assert.ok(invalidData.errors.length > 0);

    await client.close();
});

test("diagram_render outputs styled SVG, dataUri and markdown embed", async () => {
    const client = await connectClient();

    const renderRes = await client.callTool({
        name: "diagram_render",
        arguments: {
            code: "sequenceDiagram\n  Alice->>Bob: Hello Bob\n  Bob-->>Alice: Hi Alice",
            title: "Authentication Flow",
            theme: "dark",
        },
    });
    const renderData = JSON.parse(renderRes.content[0].text);
    assert.equal(renderData.title, "Authentication Flow");
    assert.equal(renderData.valid, true);
    assert.ok(renderData.svg.includes("<svg"));
    assert.ok(renderData.svg.includes("Authentication Flow"));
    assert.ok(renderData.dataUri.startsWith("data:image/svg+xml;utf8,"));
    assert.ok(renderData.markdown.startsWith("![Authentication Flow](data:image/svg+xml;utf8,"));

    await client.close();
});

test("rejects batch requests with 400", async () => {
    const response = await worker.fetch(
        new Request("https://diagram-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${TOKEN}`,
            },
            body: JSON.stringify([{ jsonrpc: "2.0", id: 1 }]),
        }),
    );
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error, "invalid_request");
});
