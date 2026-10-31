import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["get_balance", "get_latest_block", "get_tx_status"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "onchain-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://onchain-mcp.pollinations.ai"),
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
        new Request("https://onchain-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://onchain-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="onchain-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://onchain-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://onchain-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

test("get_balance calls the right RPC and formats ETH", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(String(input), "https://ethereum-rpc.publicnode.com");
        const body = JSON.parse(init.body);
        assert.equal(body.method, "eth_getBalance");
        assert.equal(body.params[0], "0xabc");
        return Response.json({
            jsonrpc: "2.0",
            id: 1,
            result: "0xde0b6b3a7640000",
        }); // 1 ETH
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_balance",
        arguments: { address: "0xabc" },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.chain, "ethereum");
    assert.equal(parsed.balanceEth, "1.000000");
    assert.equal(parsed.balanceWei, "0xde0b6b3a7640000");
});

test("get_balance supports other chains", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://base-rpc.publicnode.com");
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x0" });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_balance",
        arguments: { address: "0xabc", chain: "base" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.chain, "base");
    assert.equal(parsed.balanceEth, "0.000000");
});

test("get_balance rejects unknown chain", async (t) => {
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_balance",
        arguments: { address: "0xabc", chain: "solanafake" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /expected one of/);
});

test("get_tx_status reports confirmed transaction", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            jsonrpc: "2.0",
            id: 1,
            result: {
                hash: "0xabc",
                blockNumber: "0x10d4f",
                from: "0xf00",
                to: "0xbaa",
                value: "0x1bc16d674ec80000", // 2 ETH
            },
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_tx_status",
        arguments: { txHash: "0xabc" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "confirmed-on-chain");
    assert.equal(parsed.valueEth, "2.000000");
    assert.equal(parsed.blockNumber, "0x10d4f");
});

test("get_tx_status reports pending when blockNumber is null", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            jsonrpc: "2.0",
            id: 1,
            result: {
                hash: "0xabc",
                blockNumber: null,
                from: "0xf00",
                to: "0xbaa",
                value: "0x0",
            },
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_tx_status",
        arguments: { txHash: "0xabc" },
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.status, "pending");
});

test("get_tx_status reports not found", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ jsonrpc: "2.0", id: 1, result: null }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_tx_status",
        arguments: { txHash: "0xdead" },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /not found/);
});

test("get_latest_block parses hex block number", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://ethereum-rpc.publicnode.com");
        return Response.json({ jsonrpc: "2.0", id: 1, result: "0x10d4f" });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_latest_block",
        arguments: {},
    });
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.chain, "ethereum");
    assert.equal(parsed.blockNumber, 68943);
});

test("surfaces RPC errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: "header not found" },
        }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_latest_block",
        arguments: {},
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /header not found/);
});
