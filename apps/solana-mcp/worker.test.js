import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import worker from "./worker.js";
import { clearRpcCache, RPC_URL } from "./fetch.js";
import {
    PUMP_FUN_PROGRAM_ID, PUMP_SWAP_PROGRAM_ID,
    decodeCreateEvent, decodeTradeEvent, decodePumpSwapEvent,
} from "./tools/solana.js";

const MINT = "11111111111111111111111111111111";
const key = (byte = 0) => Buffer.alloc(32, byte);
const u8 = (v) => Buffer.from([v]);
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };
const i64 = (v) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v)); return b; };
const str = (v) => { const b = Buffer.from(v); return Buffer.concat([u32(b.length), b]); };
const bool = (v) => u8(v ? 1 : 0);
const encode = (...parts) => Buffer.concat(parts).toString("base64");

function createEventFixture() {
    return encode(Buffer.from([27,114,169,77,222,235,99,118]),
        str("Test Zombie"), str("ZOMB"), str("https://example.invalid/token.json"),
        key(0), key(1), key(2), key(3), i64(1800000000),
        u64(1000000), u64(2000000), u64(300000), u64(5000000), key(4),
        bool(false), bool(false), key(5), u64(2000000), u64(100), bool(false), u8(1));
}
function tradeEventFixture(extra = Buffer.alloc(0)) {
    return encode(Buffer.from([189,219,127,211,78,230,97,238]),
        key(0), u64(1000000000), u64(2500000000), bool(true), key(2), i64(1800000000),
        u64(9000000000), u64(8000000000), u64(7000000000), u64(6000000000),
        key(3), u64(100), u64(1000), key(4), u64(50), u64(500), bool(true),
        u64(10), u64(20), u64(30), i64(1799999999), str("buy"), bool(false),
        u64(0), u64(0), u64(0), u64(0), u32(0), key(5), u64(900000000),
        u64(1000000000), u64(900000000), u64(0), u64(0), u64(0), extra);
}
function pumpSwapCreatePoolFixture(extra = Buffer.alloc(0)) {
    return encode(Buffer.from([177,49,12,210,160,118,167,116]),
        i64(1800000000), u16(1), key(1), key(0), key(5), u8(9), u8(6),
        u64(1000), u64(2000), u64(3000), u64(4000), u64(5), u64(6), u64(7),
        u8(1), key(0), key(7), key(8), key(9), key(10), bool(false), u64(100),
        bool(false), bool(false), extra);
}
function mintAccountFixture() {
    const data = Buffer.alloc(82);
    data.writeUInt32LE(1, 0);
    key(0).copy(data, 4);
    data.writeBigUInt64LE(123456789n, 36);
    data[44] = 6;
    data[45] = 1;
    data.writeUInt32LE(0, 46);
    return data.toString("base64");
}

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "solana-mcp-tests", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(new StreamableHTTPClientTransport(new URL("https://solana.internal/"), {
        requestInit: { headers: { Authorization: "Bearer test-not-a-real-key", Cookie: "private=session" } },
        fetch: (input, init) => worker.fetch(input instanceof Request ? input : new Request(input, init)),
    }));
    t.after(() => client.close());
    return client;
}
function mockRpc(t, handler) {
    clearRpcCache();
    return t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(new URL(input).href, new URL(RPC_URL).href);
        assert.equal(init.method, "POST");
        assert.equal(init.redirect, "error");
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        const request = JSON.parse(init.body);
        return Response.json({ jsonrpc: "2.0", id: request.id, result: await handler(request) });
    });
}

test("private Worker config disables public routes and exposes MCP plus health endpoints", async () => {
    const config = JSON.parse(readFileSync(new URL("./wrangler.jsonc", import.meta.url)));
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
    assert.ok(config.compatibility_flags.includes("global_fetch_strictly_public"));
    const health = await worker.fetch(new Request("https://solana.invalid/health"));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(worker.fetch(new Request("https://solana.invalid/unknown")).status, 404);
});

for (const modern of [false, true]) {
    test(`stateless MCP transport (${modern ? "modern" : "legacy"}) exposes six tools`, async (t) => {
        clearRpcCache();
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
            "get_recent_pumpfun_launches", "get_recent_pumpfun_trades", "get_recent_pumpswap_events",
            "get_token_activity", "get_token_largest_accounts", "get_token_mint_info",
        ]);
    });
}

test("Pump.fun CreateEvent decodes official mint/name/symbol fields", () => {
    const event = decodeCreateEvent(createEventFixture());
    assert.equal(event.name, "Test Zombie");
    assert.equal(event.symbol, "ZOMB");
    assert.equal(event.mint, MINT);
    assert.equal(event.timestamp, 1800000000);
    assert.equal(event.virtualSolReserves, "2000000");
});

test("Pump.fun TradeEvent keeps unknown suffix opaque", () => {
    const event = decodeTradeEvent(tradeEventFixture(Buffer.from("0102030405060708", "hex")));
    assert.equal(event.mint, MINT);
    assert.equal(event.isBuy, true);
    assert.equal(event.solAmount, "1000000000");
    assert.equal(event.quoteAmount, "900000000");
    assert.equal(event.unparsedTrailingBytesLength, 8);
});

test("PumpSwap CreatePoolEvent decodes pool and mint addresses while preserving suffix", () => {
    const decoded = decodePumpSwapEvent(pumpSwapCreatePoolFixture(Buffer.from("0102030405060708", "hex")));
    assert.equal(decoded.kind, "pool_created");
    assert.equal(decoded.event.baseMint, MINT);
    assert.equal(decoded.event.pool, MINT);
    assert.equal(decoded.event.unparsedTrailingBytesLength, 8);
});

test("get_token_mint_info parses SPL mint authorities and supply", async (t) => {
    mockRpc(t, async ({ method }) => {
        if (method === "getAccountInfo")
            return { context: { slot: 99 }, value: { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", lamports: 1000, data: [mintAccountFixture(), "base64"] } };
        if (method === "getTokenSupply")
            return { context: { slot: 99 }, value: { amount: "123456789", decimals: 6, uiAmountString: "123.456789" } };
        assert.fail(`unexpected RPC method ${method}`);
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_mint_info", arguments: { mint: MINT } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.found, true);
    assert.equal(data.decimals, 6);
    assert.equal(data.mintAuthority, MINT);
    assert.equal(data.tokenSupply.uiAmountString, "123.456789");
});

test("get_token_largest_accounts returns token accounts, not unique wallet holders", async (t) => {
    mockRpc(t, async ({ method }) => {
        assert.equal(method, "getTokenLargestAccounts");
        return { context: { slot: 10 }, value: [{ address: "account1", amount: "500", decimals: 6, uiAmountString: "0.0005" }] };
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_largest_accounts", arguments: { mint: MINT } });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.accounts[0].address, "account1");
    assert.match(data.note, /not a unique-holder count/);
});

test("get_token_activity returns mint signatures and matching Pump.fun trades", async (t) => {
    const encoded = tradeEventFixture();
    mockRpc(t, async ({ method, params }) => {
        if (method === "getSignaturesForAddress") {
            assert.equal(params[0], MINT);
            return [{ signature: "mint-activity-signature", err: null, slot: 18, blockTime: 1800000000 }];
        }
        if (method === "getTransaction")
            return { slot: 18, blockTime: 1800000000, meta: { err: null, logMessages: [
                `Program ${PUMP_FUN_PROGRAM_ID} invoke [1]`, `Program data: ${encoded}`,
                `Program ${PUMP_FUN_PROGRAM_ID} success`,
            ] } };
        assert.fail(`unexpected RPC method ${method}`);
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_activity", arguments: { mint: MINT, limit: 5 } });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.signaturesReturned, 1);
    assert.equal(data.pumpfunTrades.length, 1);
    assert.equal(data.pumpfunTrades[0].mint, MINT);
    assert.equal(data.pumpfunTrades[0].signature, "mint-activity-signature");
});

test("get_recent_pumpfun_launches scans the official program and decodes CreateEvent", async (t) => {
    const encoded = createEventFixture();
    mockRpc(t, async ({ method, params }) => {
        if (method === "getSignaturesForAddress") {
            assert.equal(params[0], PUMP_FUN_PROGRAM_ID);
            return [{ signature: "launch-signature", err: null, slot: 9 }];
        }
        if (method === "getTransaction")
            return { slot: 9, blockTime: 1800000000, meta: { err: null, logMessages: [
                `Program ${PUMP_FUN_PROGRAM_ID} invoke [1]`, `Program data: ${encoded}`,
                `Program ${PUMP_FUN_PROGRAM_ID} success`,
            ] } };
        assert.fail(`unexpected RPC method ${method}`);
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_recent_pumpfun_launches", arguments: { limit: 5 } });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].event.name, "Test Zombie");
    assert.equal(data.events[0].event.mint, MINT);
});

test("get_recent_pumpfun_trades decodes recent buy events", async (t) => {
    const encoded = tradeEventFixture();
    mockRpc(t, async ({ method, params }) => {
        if (method === "getSignaturesForAddress") return [{ signature: "trade-signature", err: null }];
        if (method === "getTransaction")
            return { slot: 10, blockTime: 1800000000, meta: { err: null, logMessages: [
                `Program ${PUMP_FUN_PROGRAM_ID} invoke [1]`, `Program data: ${encoded}`,
                `Program ${PUMP_FUN_PROGRAM_ID} success`,
            ] } };
        assert.fail(`unexpected RPC method ${method}`);
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_recent_pumpfun_trades", arguments: { limit: 5 } });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.events[0].kind, "trade_buy");
    assert.equal(data.events[0].event.mint, MINT);
});

test("get_recent_pumpswap_events decodes pool creation and mint pair", async (t) => {
    const encoded = pumpSwapCreatePoolFixture();
    mockRpc(t, async ({ method, params }) => {
        if (method === "getSignaturesForAddress") {
            assert.equal(params[0], PUMP_SWAP_PROGRAM_ID);
            return [{ signature: "pool-signature", err: null }];
        }
        if (method === "getTransaction")
            return { slot: 12, blockTime: 1800000000, meta: { err: null, logMessages: [
                `Program ${PUMP_SWAP_PROGRAM_ID} invoke [1]`, `Program data: ${encoded}`,
                `Program ${PUMP_SWAP_PROGRAM_ID} success`,
            ] } };
        assert.fail(`unexpected RPC method ${method}`);
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_recent_pumpswap_events", arguments: { limit: 5 } });
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.events[0].kind, "pool_created");
    assert.equal(data.events[0].event.baseMint, MINT);
});

test("invalid mint is rejected before an RPC request", async (t) => {
    const fetch = mockRpc(t, () => assert.fail("must not call RPC"));
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_mint_info", arguments: { mint: "not-a-mint" } });
    assert.equal(result.isError, true);
    assert.equal(fetch.mock.callCount(), 0);
});

test("RPC 429 surfaces Retry-After without retrying aggressively", async (t) => {
    clearRpcCache();
    t.mock.method(globalThis, "fetch", async () =>
        new Response("rate limited", { status: 429, headers: { "retry-after": "12" } }),
    );
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_largest_accounts", arguments: { mint: MINT } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /HTTP 429/);
    assert.match(result.content[0].text, /Retry-After: 12/);
});
