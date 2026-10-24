import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["get_ayah", "get_surah", "search_quran"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "quran-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://quran-mcp.pollinations.ai"),
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
        new Request("https://quran-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://quran-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="quran-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://quran-mcp.pollinations.ai/mcp"),
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
        new Request("https://quran-mcp.pollinations.ai", {
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

test("get_surah fetches the surah with default edition", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.equal(
            String(input),
            "https://api.alquran.cloud/v1/surah/1/en.sahih",
        );
        return Response.json({
            code: 200,
            status: "OK",
            data: {
                number: 1,
                englishName: "Al-Faatiha",
                name: "سُورَةُ الفَاتِحَة",
                revelationType: "Meccan",
                numberOfAyahs: 7,
                ayahs: [
                    {
                        numberInSurah: 1,
                        text: "In the name of Allah, the Entirely Merciful",
                    },
                    { numberInSurah: 2, text: "Praise be to Allah" },
                ],
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_surah",
        arguments: { surahNumber: 1 },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.englishName, "Al-Faatiha");
    assert.equal(parsed.totalAyahs, 7);
    assert.equal(parsed.ayahs.length, 2);
    assert.equal(parsed.ayahs[0].ayahNumber, 1);
});

test("get_ayah fetches by reference", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.alquran.cloud/v1/ayah/2%3A255/en.sahih",
        );
        return Response.json({
            code: 200,
            status: "OK",
            data: {
                numberInSurah: 255,
                text: "Allah - there is no deity except Him",
                surah: { number: 2, englishName: "Al-Baqara" },
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_ayah",
        arguments: { reference: "2:255" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.ayahNumber, 255);
    assert.equal(parsed.surahName, "Al-Baqara");
});

test("search_quran returns top matches", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://api.alquran.cloud/v1/search/mercy",
        );
        return Response.json({
            code: 200,
            status: "OK",
            data: {
                count: 2899,
                matches: [
                    {
                        numberInSurah: 1,
                        text: "The Entirely Merciful",
                        surah: { number: 1, englishName: "Al-Faatiha" },
                    },
                    {
                        numberInSurah: 2,
                        text: "the Merciful",
                        surah: { number: 1, englishName: "Al-Faatiha" },
                    },
                ],
            },
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_quran",
        arguments: { keyword: "mercy" },
    });
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.totalMatches, 2899);
    assert.equal(parsed.matches.length, 2);
    assert.equal(parsed.matches[0].text, "The Entirely Merciful");
});

test("surfaces HTTP errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("nope", { status: 503 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "get_surah",
        arguments: { surahNumber: 1 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /503/);
});
