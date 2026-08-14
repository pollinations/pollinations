import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "analyzeVideo",
    "chatCompletion",
    "describeImage",
    "generateImage",
    "generateImageBatch",
    "generateImageUrl",
    "generateText",
    "generateVideo",
    "generateVideoUrl",
    "getBalance",
    "getPricing",
    "getUsage",
    "listAudioVoices",
    "listImageModels",
    "listQuests",
    "listTextModels",
    "respondAudio",
    "sayText",
    "transcribeAudio",
    "webSearch",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://mcp.pollinations.ai/mcp"),
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
        new Request("https://mcp.pollinations.ai/"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/mcp");

    const unauthorized = await worker.fetch(
        new Request("https://mcp.pollinations.ai/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
});

test("serves modern and legacy clients without sessions", async () => {
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

test("keeps bearer tokens scoped to each request", async (t) => {
    const originalFetch = globalThis.fetch;
    const seenAuthorizations = new Set();
    t.after(() => {
        globalThis.fetch = originalFetch;
    });

    globalThis.fetch = async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/account/balance",
        );
        const authorization = new Headers(init?.headers).get("authorization");
        seenAuthorizations.add(authorization);
        return Response.json({
            balance: authorization === "Bearer sk_first" ? 1 : 2,
        });
    };

    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "sk_first");
    const secondClient = await connectClient(options, "sk_second");

    const [first, second] = await Promise.all([
        firstClient.callTool({ name: "getBalance", arguments: {} }),
        secondClient.callTool({ name: "getBalance", arguments: {} }),
    ]);
    assert.match(first.content[0].text, /"pollen": 1/);
    assert.match(second.content[0].text, /"pollen": 2/);
    assert.deepEqual(
        seenAuthorizations,
        new Set(["Bearer sk_first", "Bearer sk_second"]),
    );

    await Promise.all([firstClient.close(), secondClient.close()]);
});
