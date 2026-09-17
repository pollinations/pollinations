import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["jev_decide"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "ask-jev-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://ask-jev-mcp.pollinations.ai"),
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
        new Request("https://ask-jev-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://ask-jev-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="ask-jev-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://ask-jev-mcp.pollinations.ai/mcp"),
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
        new Request("https://ask-jev-mcp.pollinations.ai", {
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

const QUESTIONS = {
    department: {
        type: "choice",
        instructions: "Which team should handle this?",
        criteria: { billing: "Payment issues", technical: "Product failures" },
    },
    frustration: {
        type: "score",
        instructions: "How frustrated is the customer?",
        criteria: ["Calm", "Frustrated", "Very angry"],
    },
    is_urgent: {
        type: "noul",
        instructions: "Does this convey urgency?",
    },
};

const ANSWERS = {
    department: {
        choice: "technical",
        confidence: 0.85,
        probabilities: { billing: 0.08, technical: 0.92 },
    },
    frustration: {
        score: 1.6,
        legend: { 0: "Calm", 1: "Frustrated", 2: "Very angry" },
        confidence: 0.78,
        probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
    },
    is_urgent: { noul: 0.98 },
};

function completion(answers = ANSWERS) {
    return Response.json({
        model: "jev-1.13.0",
        choices: [
            {
                message: {
                    role: "assistant",
                    content: JSON.stringify(answers),
                },
            },
        ],
    });
}

test("translates all question types in one non-streaming chat completion", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        assert.equal(
            new Headers(init.headers).get("content-type"),
            "application/json",
        );
        assert.deepEqual(JSON.parse(init.body), {
            model: "openjev",
            messages: [
                {
                    role: "user",
                    content: "My payouts have been failing for 3 days.",
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "jev_decision",
                    schema: {
                        type: "object",
                        properties: {
                            department: {
                                type: "string",
                                enum: ["billing", "technical"],
                                description:
                                    'Which team should handle this?\n\nCriteria: {"billing":"Payment issues","technical":"Product failures"}',
                            },
                            frustration: {
                                type: "integer",
                                enum: ["Calm", "Frustrated", "Very angry"],
                                description: "How frustrated is the customer?",
                            },
                            is_urgent: {
                                type: "number",
                                minimum: 0,
                                maximum: 1,
                                description: "Does this convey urgency?",
                            },
                        },
                    },
                },
            },
        });
        return completion();
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "jev_decide",
        arguments: {
            state: "My payouts have been failing for 3 days.",
            questions: QUESTIONS,
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(JSON.parse(result.content[0].text), {
        department: { type: "choice", ...ANSWERS.department },
        frustration: { type: "score", ...ANSWERS.frustration },
        is_urgent: { type: "noul", ...ANSWERS.is_urgent },
    });
});

test("preserves optional noul criteria in the question description", async (t) => {
    const criteriaCases = [
        { true: "Explicitly time-sensitive", false: "No urgency expressed" },
        { true: "A deadline is stated" },
        { false: "No deadline is stated" },
    ];
    const descriptions = [];
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        const property = JSON.parse(init.body).response_format.json_schema
            .schema.properties.is_urgent;
        assert.equal(property.type, "number");
        assert.equal(property.minimum, 0);
        assert.equal(property.maximum, 1);
        descriptions.push(property.description);
        return completion({ is_urgent: ANSWERS.is_urgent });
    });
    const client = await connectClient();
    t.after(() => client.close());
    for (const criteria of criteriaCases) {
        const result = await client.callTool({
            name: "jev_decide",
            arguments: {
                state: "Please fix this before noon.",
                questions: {
                    is_urgent: { ...QUESTIONS.is_urgent, criteria },
                },
            },
        });
        assert.notEqual(result.isError, true);
        assert.deepEqual(JSON.parse(result.content[0].text), {
            is_urgent: { type: "noul", ...ANSWERS.is_urgent },
        });
    }
    assert.deepEqual(descriptions, [
        'Does this convey urgency?\n\nCriteria: {"true":"Explicitly time-sensitive","false":"No urgency expressed"}',
        'Does this convey urgency?\n\nCriteria: {"true":"A deadline is stated"}',
        'Does this convey urgency?\n\nCriteria: {"false":"No deadline is stated"}',
    ]);
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const seenAuthorizations = new Set();
    t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        const authorization = new Headers(init.headers).get("authorization");
        seenAuthorizations.add(authorization);
        return completion({
            is_urgent: {
                noul: authorization === "Bearer pk_first" ? 0.1 : 0.9,
            },
        });
    });
    const options = { versionNegotiation: { mode: "auto" } };
    const firstClient = await connectClient(options, "pk_first");
    const secondClient = await connectClient(options, "sk_second");
    t.after(() => Promise.all([firstClient.close(), secondClient.close()]));
    const request = {
        name: "jev_decide",
        arguments: {
            state: "Help",
            questions: { is_urgent: QUESTIONS.is_urgent },
        },
    };
    const [first, second] = await Promise.all([
        firstClient.callTool(request),
        secondClient.callTool(request),
    ]);
    assert.deepEqual(JSON.parse(first.content[0].text), {
        is_urgent: { type: "noul", noul: 0.1 },
    });
    assert.deepEqual(JSON.parse(second.content[0].text), {
        is_urgent: { type: "noul", noul: 0.9 },
    });
    assert.deepEqual(
        seenAuthorizations,
        new Set(["Bearer pk_first", "Bearer sk_second"]),
    );
});

test("rejects invalid question types and criteria before fetching", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for invalid arguments");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    for (const question of [
        { type: "unknown", instructions: "Decide" },
        { type: "score", instructions: "Rate", criteria: ["Only one label"] },
        { type: "choice", instructions: "Choose", criteria: ["Not a map"] },
        { type: "noul" },
        { ...QUESTIONS.is_urgent, criteria: { true: 1 } },
        { ...QUESTIONS.is_urgent, criteria: { false: false } },
        { ...QUESTIONS.is_urgent, criteria: ["yes", "no"] },
    ]) {
        const result = await client.callTool({
            name: "jev_decide",
            arguments: { state: "Help", questions: { decision: question } },
        });
        assert.equal(result.isError, true);
    }
    assert.equal(fetchMock.mock.callCount(), 0);
});

test("uses shared gateway error mapping", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/chat/completions",
        );
        return Response.json(
            { error: { message: "Insufficient balance" } },
            { status: 403 },
        );
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "jev_decide",
        arguments: {
            state: "Help",
            questions: { is_urgent: QUESTIONS.is_urgent },
        },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Insufficient balance/);
});
