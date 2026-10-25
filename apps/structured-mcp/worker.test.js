import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, { extractJsonValues, repairJson } from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = [
    "json_extract",
    "json_generate",
    "json_repair",
    "json_validate",
];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "structured-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://structured-mcp.pollinations.ai"),
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

function chatReply(content) {
    return Response.json({
        id: "chatcmpl-test",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content } }],
    });
}

const OBJECT_SCHEMA = {
    type: "object",
    properties: {
        city: { type: "string" },
        population: { type: "integer", minimum: 1 },
    },
    required: ["city", "population"],
    additionalProperties: false,
};

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://structured-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://structured-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="structured-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://structured-mcp.pollinations.ai/mcp"),
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

    const legacy = await connectClient({
        versionNegotiation: { mode: "legacy" },
    });
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects batch requests", async () => {
    const response = await worker.fetch(
        new Request("https://structured-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: "[]",
        }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "invalid_request");
});

test("extractJsonValues finds embedded values and skips prose", () => {
    const text =
        'Here you go: {"a": 1} and also [1, 2] plus a broken {oops} and a string "not json".';
    assert.deepEqual(extractJsonValues(text), [{ a: 1 }, [1, 2]]);
    assert.deepEqual(extractJsonValues("no json at all"), []);
    // Braces inside strings must not close the value early.
    assert.deepEqual(extractJsonValues('{"a": "}"}'), [{ a: "}" }]);
    assert.deepEqual(extractJsonValues('```json\n{"a": 1}\n```'), [{ a: 1 }]);
});

test("repairJson fixes common breakage", () => {
    const cases = [
        ['{"a": 1,}', { a: 1 }],
        ["{'a': 'b'}", { a: "b" }],
        ["{a: 1}", { a: 1 }],
        ['{"a": 1 // trailing comment\n}', { a: 1 }],
        ['/* c */ {"a": 1}', { a: 1 }],
        ["{a: True, b: None}", { a: true, b: null }],
        ['\u201c{"a": 1}\u201d', { a: 1 }],
        ['```json\n{"a": 1}\n```', { a: 1 }],
        ['{"a": 1} hope that helps', { a: 1 }],
        ['Here: {"a": 1}', { a: 1 }],
    ];
    for (const [input, expected] of cases) {
        assert.deepEqual(repairJson(input).value, expected, `input: ${input}`);
    }
});

test("repairJson leaves valid JSON untouched", () => {
    const result = repairJson('{"a": [1, 2]}');
    assert.deepEqual(result.value, { a: [1, 2] });
    assert.deepEqual(result.repairs, []);
});

test("repairJson throws when nothing can be salvaged", () => {
    assert.throws(() => repairJson("definitely not json"), /valid JSON/);
});

test("json_extract tool returns values and errors on none", async (t) => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const ok = await client.callTool({
        name: "json_extract",
        arguments: { text: 'prose {"a": 1} more prose {"b": 2}' },
    });
    assert.notEqual(ok.isError, true);
    assert.deepEqual(JSON.parse(ok.content[0].text), {
        count: 2,
        values: [{ a: 1 }, { b: 2 }],
    });

    const empty = await client.callTool({
        name: "json_extract",
        arguments: { text: "nothing here" },
    });
    assert.equal(empty.isError, true);
});

test("json_validate tool reports paths for each violation", async (t) => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const valid = await client.callTool({
        name: "json_validate",
        arguments: {
            value: { city: "Lagos", population: 15 },
            schema: OBJECT_SCHEMA,
        },
    });
    assert.notEqual(valid.isError, true);
    assert.deepEqual(JSON.parse(valid.content[0].text), {
        errors: [],
        valid: true,
    });

    const invalid = await client.callTool({
        name: "json_validate",
        arguments: { value: { city: 7 }, schema: OBJECT_SCHEMA },
    });
    assert.notEqual(invalid.isError, true);
    const report = JSON.parse(invalid.content[0].text);
    assert.equal(report.valid, false);
    const paths = report.errors.map(({ path }) => path);
    assert.ok(paths.includes("#"), `expected a root path, got ${paths}`);
    assert.ok(
        paths.includes("#/city") || paths.includes("#/population"),
        `expected a property path, got ${paths}`,
    );
});

test("json_generate returns schema-valid JSON from the model", async (t) => {
    const seen = [];
    t.mock.method(globalThis, "fetch", async (input, init) => {
        seen.push({ url: String(input), init });
        return chatReply(
            '```json\n{"city": "Lagos", "population": 15388000}\n```',
        );
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "json_generate",
        arguments: {
            prompt: "Largest city in Nigeria.",
            schema: OBJECT_SCHEMA,
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        attempts: 1,
        value: { city: "Lagos", population: 15388000 },
    });

    assert.equal(seen.length, 1);
    assert.equal(
        seen[0].url,
        "https://gen.pollinations.ai/v1/chat/completions",
    );
    const headers = new Headers(seen[0].init.headers);
    assert.equal(headers.get("authorization"), `Bearer ${TOKEN}`);
    const body = JSON.parse(seen[0].init.body);
    assert.equal(body.model, "openai/gpt-5.4-nano");
    assert.equal(body.temperature, 0);
    assert.match(body.messages[0].content, /JSON Schema/);
    assert.equal(body.messages[1].content, "Largest city in Nigeria.");
});

test("json_generate retries with the schema errors and then succeeds", async (t) => {
    const bodies = [];
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        bodies.push(JSON.parse(init.body));
        if (bodies.length === 1) {
            return chatReply('{"city": "Lagos", "population": "many"}');
        }
        return chatReply('{"city": "Lagos", "population": 15388000}');
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "json_generate",
        arguments: {
            prompt: "Largest city in Nigeria.",
            schema: OBJECT_SCHEMA,
            maxAttempts: 2,
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        attempts: 2,
        value: { city: "Lagos", population: 15388000 },
    });
    assert.equal(bodies.length, 2);
    const correction = bodies[1].messages.at(-1);
    assert.equal(correction.role, "user");
    assert.match(correction.content, /does not match the schema/);
    assert.match(correction.content, /#\/population/);
});

test("json_generate gives up after maxAttempts", async (t) => {
    const calls = t.mock.method(globalThis, "fetch", async () =>
        chatReply('{"city": "Lagos"}'),
    );
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "json_generate",
        arguments: {
            prompt: "Largest city in Nigeria.",
            schema: OBJECT_SCHEMA,
            maxAttempts: 2,
        },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /after 2 attempt/);
    assert.match(result.content[0].text, /population/);
    assert.equal(calls.mock.callCount(), 2);
});

test("json_generate rejects a non-object schema without calling the model", async (t) => {
    const calls = t.mock.method(globalThis, "fetch", async () => {
        throw new Error("Unexpected fetch for an invalid schema");
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    const result = await client.callTool({
        name: "json_generate",
        arguments: { prompt: "Anything.", schema: "not a schema" },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.mock.callCount(), 0);
});

test("json_generate reports an unsatisfiable schema as a tool error", async (t) => {
    t.mock.method(globalThis, "fetch", async () => chatReply('{"a": 1}'));
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());

    // An unknown type never validates, so the retry loop must give up.
    const result = await client.callTool({
        name: "json_generate",
        arguments: {
            prompt: "Anything.",
            schema: { type: "not-a-real-type" },
            maxAttempts: 1,
        },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /after 1 attempt/);
});
