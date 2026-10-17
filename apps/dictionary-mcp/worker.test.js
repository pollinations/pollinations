import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const ORIGIN = "https://dictionary-mcp.pollinations.ai";
const TOKEN = "sk_test";

const AMP = String.fromCharCode(38);

const PAYLOAD = JSON.stringify({
    en: [
        {
            partOfSpeech: "Noun",
            language: "English",
            definitions: [
                {
                    definition: `The <a rel="mw:WikiLink" href="/wiki/luck">luck</a> of finding something good ${AMP}#39;without looking${AMP}#39; & more.`,
                    examples: [
                        {
                            example: `A happy <b>accident</b> ${AMP}mdash; truly.`,
                        },
                    ],
                },
                {
                    definition: "Luck itself, plain and simple.",
                },
            ],
        },
    ],
    fi: [
        {
            partOfSpeech: "Noun",
            language: "Finnish",
            definitions: [
                {
                    definition: "Iloinen sattuma.",
                },
            ],
        },
    ],
});

async function connectClient(options = {}) {
    const client = new Client(
        { name: "dictionary-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL(ORIGIN), {
            fetch: (input, init) =>
                worker.fetch(
                    input instanceof Request ? input : new Request(input, init),
                ),
            requestInit: {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    Cookie: "session=private",
                },
            },
        }),
    );
    return client;
}

test("serves health, requires bearer auth and rejects unknown paths and batches", async () => {
    const health = await worker.fetch(new Request(`${ORIGIN}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).stateless, true);
    for (const authorization of [null, "Basic abc", "Bearer", "Bearer a b"]) {
        const headers = authorization ? { authorization } : {};
        const response = await worker.fetch(new Request(ORIGIN, { headers }));
        assert.equal(response.status, 401);
        assert.equal(
            response.headers.get("www-authenticate"),
            'Bearer realm="dictionary-mcp.pollinations.ai"',
        );
    }
    assert.equal(
        (await worker.fetch(new Request(`${ORIGIN}/other`))).status,
        404,
    );
    const batch = await worker.fetch(
        new Request(ORIGIN, {
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
    assert.equal(batch.status, 400);
});

test("exposes a read-only define tool over modern and legacy stateless HTTP", async () => {
    for (const options of [{ versionNegotiation: { mode: "auto" } }, {}]) {
        const client = await connectClient(options);
        try {
            assert.equal(
                client.getProtocolEra(),
                options.versionNegotiation ? "modern" : "legacy",
            );
            const { tools } = await client.listTools();
            assert.deepEqual(
                tools.map(({ name }) => name),
                ["define"],
            );
            for (const tool of tools) {
                assert.equal(tool.annotations.readOnlyHint, true);
            }
        } finally {
            await client.close();
        }
    }
});

test("defines words without forwarding caller credentials", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(
            url.href,
            "https://en.wiktionary.org/api/rest_v1/page/definition/serendipity",
        );
        const headers = new Headers(init.headers);
        assert.match(headers.get("user-agent"), /^dictionary-mcp\//);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.ok(init.signal instanceof AbortSignal);
        return new Response(PAYLOAD);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "define",
        arguments: { word: "serendipity" },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        word: "serendipity",
        language: "en",
        entries: [
            {
                partOfSpeech: "Noun",
                definitions: [
                    {
                        definition:
                            "The luck of finding something good 'without looking' & more.",
                        example: "A happy accident — truly.",
                    },
                    {
                        definition: "Luck itself, plain and simple.",
                    },
                ],
            },
        ],
    });
    assert.equal(upstream.mock.callCount(), 1);
});

test("matches a language code and reports missing languages", async (t) => {
    const upstream = t.mock.method(
        globalThis,
        "fetch",
        async () => new Response(PAYLOAD),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const finnish = await client.callTool({
        name: "define",
        arguments: { word: "serendipity", language: "fi" },
    });
    assert.notEqual(finnish.isError, true);
    const payload = JSON.parse(finnish.content[0].text);
    assert.equal(payload.language, "fi");
    assert.equal(
        payload.entries[0].definitions[0].definition,
        "Iloinen sattuma.",
    );

    const missing = await client.callTool({
        name: "define",
        arguments: { word: "serendipity", language: "Swahili" },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /No Swahili definitions found/);
    assert.equal(upstream.mock.callCount(), 2);
});

test("reports missing words and upstream failures as tool errors", async (t) => {
    let failure;
    t.mock.method(globalThis, "fetch", async () => {
        if (failure instanceof Error) throw failure;
        return failure;
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [response, message] of [
        [new Response(null, { status: 404 }), /was not found on Wiktionary/],
        [new Response(null, { status: 503 }), /HTTP 503/],
        [new Error("Network unavailable"), /Network unavailable/],
        [
            new DOMException("Wiktionary lookup timed out", "TimeoutError"),
            /timed out/,
        ],
    ]) {
        failure = response;
        const result = await client.callTool({
            name: "define",
            arguments: { word: "serendipity" },
        });
        assert.equal(result.isError, true, message);
        assert.match(result.content[0].text, message);
    }
});

test("rejects invalid arguments before querying Wiktionary", async (t) => {
    const upstream = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected Wiktionary request");
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const [name, args] of [
        ["define", {}],
        ["define", { word: " " }],
        ["define", { word: "a".repeat(65) }],
        ["define", { word: "serendipity", language: "e" }],
        ["define", { word: "serendipity", language: "x".repeat(33) }],
    ]) {
        const result = await client.callTool({ name, arguments: args });
        assert.equal(result.isError, true, JSON.stringify([name, args]));
    }
    assert.equal(upstream.mock.callCount(), 0);
});
