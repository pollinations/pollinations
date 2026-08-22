import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

function createHarness(options = {}) {
    const calls = { run: [], destroy: 0, responses: [] };
    const container = {
        async run(code, deadlineMs) {
            calls.run.push({ code, deadlineMs });
            return (
                options.result ?? { exitCode: 0, stdout: "42\n", stderr: "" }
            );
        },
        async destroy() {
            calls.destroy += 1;
        },
    };
    return {
        calls,
        env: { PYTHON: {} },
        worker: createWorker({ getContainerImpl: () => container }),
    };
}

async function connect(worker, env, calls) {
    const client = new Client(
        { name: "python-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://python.internal"),
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

test("lists one Python execution tool", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["runPython"],
    );
    await client.close();
});

test("runs code in one ephemeral container and reports measured usage", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "runPython",
        arguments: { code: "print(6 * 7)" },
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0].text, "42");
    assert.equal(calls.run[0].code, "print(6 * 7)");
    assert.ok(calls.run[0].deadlineMs > Date.now());
    assert.equal(calls.destroy, 1);
    const response = calls.responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.tool), "runPython");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "200");
    assert.ok(response.headers.has(MCP_USAGE_HEADERS.cost));
    await client.close();
});

test("reports and bills executed Python failures", async () => {
    const { calls, env, worker } = createHarness({
        result: { exitCode: 1, stdout: "", stderr: "ValueError: bad" },
    });
    const client = await connect(worker, env, calls);
    const result = await client.callTool({
        name: "runPython",
        arguments: { code: "raise ValueError('bad')" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /ValueError: bad/);
    const response = calls.responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "422");
    assert.ok(response.headers.has(MCP_USAGE_HEADERS.cost));
    assert.equal(calls.destroy, 1);
    await client.close();
});

test("rejects JSON-RPC batches before starting a container", async () => {
    const { calls, env, worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://python.internal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
        env,
    );
    assert.equal(response.status, 400);
    assert.equal(calls.run.length, 0);
});
