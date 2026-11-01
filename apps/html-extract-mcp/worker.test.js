import assert from "node:assert/strict";
import test from "node:test";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["extract_url_text"];

function localFetch(input, init) {
  const request = input instanceof Request ? input : new Request(input, init);
  return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
  const client = new Client(
    { name: "html-extract-mcp-worker-test", version: "0.0.1" },
    { capabilities: {}, ...options },
  );

  const transport = new StreamableHTTPClientTransport(
    new URL("https://html-extract-mcp.pollinations.ai"),
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
    new Request("https://html-extract-mcp.pollinations.ai/health"),
  );
  assert.equal(health.status, 200);
  assert.equal((await health.json()).name, "html-extract-mcp");

  const unauthorized = await worker.fetch(
    new Request("https://html-extract-mcp.pollinations.ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }),
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(
    unauthorized.headers.get("www-authenticate"),
    'Bearer realm="html-extract-mcp.pollinations.ai"',
  );
});

test("lists tools and extracts readable text", async () => {
  const html = `
    <html>
      <head>
        <style>body{color:red}</style>
        <script>console.log('x')</script>
      </head>
      <body>
        <h1>Hello</h1>
        <p>World &amp; Universe</p>
        <!-- comment should be removed -->
      </body>
    </html>
  `;

  let calls = 0;

  test.mock.method(globalThis, "fetch", async (input) => {
    calls++;
    assert.ok(String(input).startsWith("https://example.com"));
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });

  const client = await connectClient();
  try {
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name).sort(), EXPECTED_TOOLS);

    const result = await client.callTool({
      name: "extract_url_text",
      arguments: { url: "https://example.com/test", maxCharacters: 5000 },
    });

    assert.equal(result.isError, false);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");

    const output = String(result.content[0].text);
    assert.ok(output.includes("Hello"));
    assert.ok(output.includes("World & Universe"));
    assert.equal(calls, 1);
  } finally {
    await client.close();
  }
});
