import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

const SOURCE = "https://example.com/page";

function createHarness(options = {}) {
    const calls = { actions: [], uploads: [], responses: [] };
    const env = {
        BROWSER: {
            async quickAction(action, input) {
                calls.actions.push({ action, input });
                if (options.quickAction) {
                    return options.quickAction(action, input);
                }
                const headers = { "X-Browser-Ms-Used": "1000" };
                if (action === "markdown") {
                    return Response.json(
                        { success: true, result: "# Rendered page" },
                        { headers },
                    );
                }
                return new Response(
                    action === "screenshot"
                        ? new Uint8Array([1, 2, 3])
                        : new Uint8Array([4, 5, 6]),
                    { headers },
                );
            },
        },
        MEDIA: {
            async upload(body, input) {
                const bytes = new Uint8Array(
                    await new Response(body).arrayBuffer(),
                );
                calls.uploads.push({ bytes, input });
                if (options.uploadError) throw options.uploadError;
                return {
                    url: `https://media.pollinations.ai/${input.fileName}`,
                    contentType: input.contentType,
                    size: input.size,
                };
            },
        },
    };
    return { calls, env, worker: createWorker() };
}

async function connect(worker, env, calls) {
    const client = new Client(
        { name: "browser-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://browser.internal"),
        {
            fetch: async (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const response = await worker.fetch(request, env);
                calls.responses.push(response.clone());
                return response;
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("lists the stateless browser tools", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["fetchPage", "screenshotPage", "renderPdf"],
    );
    assert.equal(
        calls.responses.some((response) =>
            response.headers.has(MCP_USAGE_HEADERS.cost),
        ),
        false,
    );
    await client.close();
});

test("returns rendered Markdown and reports measured usage", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "fetchPage",
        arguments: { url: SOURCE },
    });
    assert.deepEqual(result.content, [
        { type: "text", text: `Source: ${SOURCE}\n\n# Rendered page` },
    ]);
    assert.deepEqual(calls.actions, [
        { action: "markdown", input: { url: SOURCE } },
    ]);
    const response = calls.responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.tool), "fetchPage");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "200");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "1");
    assert.equal(
        Number(response.headers.get(MCP_USAGE_HEADERS.cost)),
        0.09 / 3600,
    );
    await client.close();
});

test("uploads screenshots and PDFs as MCP resource links", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    for (const [name, args, contentType, fileName] of [
        [
            "screenshotPage",
            { url: SOURCE, fullPage: false },
            "image/png",
            "screenshot.png",
        ],
        [
            "renderPdf",
            { url: SOURCE, landscape: true },
            "application/pdf",
            "page.pdf",
        ],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.content[0].type, "resource_link");
        assert.equal(result.content[0].mimeType, contentType);
        assert.equal(
            result.content[0].uri,
            `https://media.pollinations.ai/${fileName}`,
        );
    }
    assert.equal(calls.uploads.length, 2);
    assert.deepEqual(calls.uploads[0].bytes, new Uint8Array([1, 2, 3]));
    assert.deepEqual(calls.uploads[1].bytes, new Uint8Array([4, 5, 6]));
    await client.close();
});

test("rejects unsafe URLs and JSON-RPC batches before Browser Run", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    for (const url of [
        "http://example.com/page",
        "https://localhost/page",
        "https://127.0.0.1/page",
        "https://user:secret@example.com/page",
    ]) {
        const result = await client.callTool({
            name: "fetchPage",
            arguments: { url },
        });
        assert.equal(result.isError, true);
    }
    await client.close();

    const response = await worker.fetch(
        new Request("https://browser.internal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
        env,
    );
    assert.equal(response.status, 400);
    assert.equal(calls.actions.length, 0);
});

test("reports measured usage when output upload fails", async () => {
    const { calls, env, worker } = createHarness({
        uploadError: new Error("media unavailable"),
    });
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "screenshotPage",
        arguments: { url: SOURCE },
    });
    assert.equal(result.isError, true);
    const response = calls.responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "502");
    assert.ok(response.headers.has(MCP_USAGE_HEADERS.cost));
    await client.close();
});
