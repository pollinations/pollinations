import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["trivia_categories", "trivia_questions"];
// Built with String.fromCharCode so no literal HTML entity ever appears in
// this source: the file-write transport unescapes standard entities.
const AMP = String.fromCharCode(38);

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "trivia-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://trivia-mcp.pollinations.ai"),
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

async function callTool(t, fetchMock, name, args) {
    t.mock.method(globalThis, "fetch", fetchMock);
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({ name, arguments: args });
    return JSON.parse(result.content[0].text);
}

async function callToolRaw(t, fetchMock, name, args) {
    t.mock.method(globalThis, "fetch", fetchMock);
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    return client.callTool({ name, arguments: args });
}

const QUESTION = {
    category: "Science: Computers",
    type: "multiple",
    difficulty: "easy",
    question: "What does CPU stand for?",
    correct_answer: "Central Processing Unit",
    incorrect_answers: [
        "Central Process Unit",
        "Computer Personal Unit",
        "Central Processor Unit",
    ],
};

function questionsResponse(results = [QUESTION]) {
    return Response.json({ response_code: 0, results });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://trivia-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://trivia-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="trivia-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://trivia-mcp.pollinations.ai/mcp"),
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
        new Request("https://trivia-mcp.pollinations.ai", {
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

test("returns questions with the correct answer among the answers", async (t) => {
    const questions = await callTool(
        t,
        async (input) => {
            assert.equal(
                String(input),
                "https://opentdb.com/api.php?amount=10",
            );
            return questionsResponse();
        },
        "trivia_questions",
        {},
    );
    assert.equal(questions.length, 1);
    assert.equal(questions[0].question, "What does CPU stand for?");
    assert.equal(questions[0].correct_answer, "Central Processing Unit");
    assert.equal(questions[0].category, "Science: Computers");
    assert.equal(questions[0].difficulty, "easy");
    assert.equal(questions[0].type, "multiple");
    assert.deepEqual(
        [...questions[0].answers].sort(),
        [
            "Central Processing Unit",
            "Central Process Unit",
            "Computer Personal Unit",
            "Central Processor Unit",
        ].sort(),
    );
});

test("passes filters through to Open Trivia DB", async (t) => {
    await callTool(
        t,
        async (input) => {
            const url = new URL(String(input));
            assert.equal(url.searchParams.get("amount"), "5");
            assert.equal(url.searchParams.get("category"), "18");
            assert.equal(url.searchParams.get("difficulty"), "hard");
            assert.equal(url.searchParams.get("type"), "boolean");
            return questionsResponse([]);
        },
        "trivia_questions",
        { amount: 5, category: 18, difficulty: "hard", type: "boolean" },
    );
});

test("clamps amount to 1-50", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input) => {
        seen.push(new URL(String(input)).searchParams.get("amount"));
        return questionsResponse([]);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    await client.callTool({
        name: "trivia_questions",
        arguments: { amount: 0 },
    });
    await client.callTool({
        name: "trivia_questions",
        arguments: { amount: 100 },
    });
    assert.deepEqual(seen, ["1", "50"]);
});

test("reports no-results and invalid-parameter response codes", async (t) => {
    const codes = [1, 2];
    t.mock.method(globalThis, "fetch", async () => {
        const code = codes.shift();
        return Response.json({ response_code: code, results: [] });
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const pattern of [/no results/i, /parameter/i]) {
        const result = await client.callTool({
            name: "trivia_questions",
            arguments: {},
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, pattern);
    }
});

test("reports token response codes without using tokens", async (t) => {
    const result = await callToolRaw(
        t,
        async (input) => {
            assert.equal(
                new URL(String(input)).searchParams.has("token"),
                false,
            );
            return Response.json({ response_code: 3, results: [] });
        },
        "trivia_questions",
        {},
    );
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /token/i);
});

test("returns the category id and name list", async (t) => {
    const categories = await callTool(
        t,
        async (input) => {
            assert.equal(String(input), "https://opentdb.com/api_category.php");
            return Response.json({
                trivia_categories: [
                    { id: 9, name: "General Knowledge" },
                    { id: 18, name: "Science: Computers" },
                ],
            });
        },
        "trivia_categories",
        {},
    );
    assert.deepEqual(categories, [
        { id: 9, name: "General Knowledge" },
        { id: 18, name: "Science: Computers" },
    ]);
});

test("decodes entities in text fields", async (t) => {
    const encoded = {
        ...QUESTION,
        question:
            "Who wrote " +
            AMP +
            "quot;Hamlet" +
            AMP +
            "quot; " +
            AMP +
            "amp; " +
            AMP +
            "lt;sonnets" +
            AMP +
            "gt;?",
        correct_answer: `William Shakespeare${AMP}#039;s heir`,
        incorrect_answers: [`Caf${AMP}#233;`, "Other", "Nobody"],
    };
    const questions = await callTool(
        t,
        async () => questionsResponse([encoded]),
        "trivia_questions",
        {},
    );
    assert.equal(questions[0].question, 'Who wrote "Hamlet" & <sonnets>?');
    assert.equal(questions[0].correct_answer, "William Shakespeare's heir");
    assert.ok(questions[0].answers.includes("Caf\u00e9"));
});

test("sends no Authorization or Cookie upstream", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen.push(new Headers(init?.headers));
        return String(input).includes("api_category.php")
            ? Response.json({ trivia_categories: [] })
            : questionsResponse([]);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    await client.callTool({ name: "trivia_questions", arguments: {} });
    await client.callTool({ name: "trivia_categories", arguments: {} });
    assert.equal(seen.length, 2);
    for (const headers of seen) {
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("cookie"), null);
    }
});

test("shuffled answers always contain the correct answer", async (t) => {
    const questions = await callTool(
        t,
        async () => questionsResponse(),
        "trivia_questions",
        {},
    );
    assert.equal(questions[0].answers.length, 4);
    assert.ok(questions[0].answers.includes(questions[0].correct_answer));
    assert.equal(new Set(questions[0].answers).size, 4);
});
