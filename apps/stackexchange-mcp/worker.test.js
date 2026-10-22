import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["get_question", "search_questions"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "stackexchange-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://stackexchange-mcp.pollinations.ai"),
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

function searchResponse() {
    return Response.json({
        items: [
            {
                question_id: 11227809,
                title: "Why is processing a sorted array faster?",
                score: 27000,
                answer_count: 25,
                accepted_answer_id: 11227902,
                view_count: 1_500_000,
                tags: ["java", "performance"],
                owner: { display_name: "GManNickG" },
                creation_date: 1_340_000_000,
                link: "https://stackoverflow.com/q/11227809",
            },
        ],
        quota_remaining: 299,
        has_more: false,
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://stackexchange-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://stackexchange-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="stackexchange-mcp.pollinations.ai"',
    );

    const missing = await worker.fetch(
        new Request("https://stackexchange-mcp.pollinations.ai/mcp"),
    );
    assert.equal(missing.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name).sort(),
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
        new Request("https://stackexchange-mcp.pollinations.ai", {
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

test("searches questions without forwarding the Pollinations key", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen = { url: new URL(String(input)), init };
        return searchResponse();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_questions",
        arguments: {
            query: "sorted array faster",
            tags: ["java"],
            sort: "votes",
            limit: 5,
        },
    });

    assert.notEqual(result.isError, true);
    assert.equal(seen.url.origin, "https://api.stackexchange.com");
    assert.equal(seen.url.pathname, "/2.3/search/advanced");
    assert.equal(seen.url.searchParams.get("q"), "sorted array faster");
    assert.equal(seen.url.searchParams.get("tagged"), "java");
    assert.equal(seen.url.searchParams.get("site"), "stackoverflow");
    assert.equal(seen.url.searchParams.get("sort"), "votes");
    assert.equal(seen.url.searchParams.get("pagesize"), "5");
    assert.equal(
        new Headers(seen.init.headers).get("authorization"),
        null,
        "the caller's key must not reach Stack Exchange",
    );

    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.quota_remaining, 299);
    assert.equal(payload.questions.length, 1);
    assert.equal(payload.questions[0].question_id, 11227809);
    assert.equal(payload.questions[0].has_accepted_answer, true);
    assert.equal(payload.questions[0].tags[1], "performance");
});

test("accepts tags without a text query and reports empty results", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(new URL(String(input)).searchParams.get("q"), null);
        return Response.json({ items: [], quota_remaining: 298 });
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_questions",
        arguments: { tags: ["rust"] },
    });

    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text).questions, []);
});

test("rejects searches with neither a query nor tags before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch");
    });
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_questions",
        arguments: {},
    });

    assert.equal(result.isError, true);
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("reads a question with its top answers as plain text", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("/answers")) {
            return Response.json({
                items: [
                    {
                        answer_id: 2,
                        score: 42,
                        is_accepted: true,
                        owner: { display_name: "Jon Skeet" },
                        creation_date: 1_340_000_100,
                        body: "<p>Use <code>await</code>.</p><pre><code>const x = 1;\n</code></pre>",
                    },
                ],
            });
        }
        return Response.json({
            items: [
                {
                    question_id: 7,
                    title: "How do promises work?",
                    score: 10,
                    answer_count: 1,
                    accepted_answer_id: 2,
                    tags: ["javascript"],
                    creation_date: 1_340_000_000,
                    link: "https://stackoverflow.com/q/7",
                    body: "<p>Explain <strong>promises</strong>.</p>",
                },
            ],
        });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "get_question",
        arguments: { question_id: 7, max_answers: 3 },
    });

    assert.notEqual(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.question.body, "Explain promises.");
    assert.equal(payload.answers.length, 1);
    assert.equal(payload.answers[0].is_accepted, true);
    assert.match(payload.answers[0].body, /Use await\./);
    assert.match(payload.answers[0].body, /const x = 1;/);
    assert.doesNotMatch(payload.answers[0].body, /<[a-z]/i);
});

test("maps Stack Exchange errors to tool errors", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json(
            {
                error_id: 502,
                error_name: "throttle_violation",
                error_message: "too many requests from this IP",
            },
            { status: 400 },
        ),
    );
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_questions",
        arguments: { query: "anything" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /too many requests/);
});

test("surfaces a backoff request instead of returning empty results", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ items: [], backoff: 12 }),
    );
    const client = await connectClient();
    t.after(() => client.close());

    const result = await client.callTool({
        name: "search_questions",
        arguments: { query: "anything" },
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /12 seconds/);
});
