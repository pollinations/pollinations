import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { validateJson } from "./validate.js";
import worker from "./worker.js";

const validate = (schema, data) =>
    validateJson({
        schema: JSON.stringify(schema),
        data: JSON.stringify(data),
    });

test("validates nested output contracts and reports precise error locations", () => {
    const schema = {
        type: "object",
        required: ["items"],
        additionalProperties: false,
        properties: {
            items: { type: "array", items: { type: "integer", minimum: 1 } },
        },
    };
    assert.equal(validate(schema, { items: [1, 2] }).valid, true);
    const result = validate(schema, { items: [1, 0] });
    assert.equal(result.valid, false);
    assert.ok(
        result.errors.some(
            (e) =>
                e.keyword === "minimum" && e.instanceLocation === "#/items/1",
        ),
    );
    assert.equal(validate(schema, {}).valid, false);
    assert.equal(validate(schema, { items: [], extra: true }).valid, false);
});

test("does not coerce data or insert defaults, and handles JSON primitives", () => {
    assert.equal(validate({ type: "number" }, "2").valid, false);
    assert.equal(
        validate({ required: ["x"], properties: { x: { default: 1 } } }, {})
            .valid,
        false,
    );
    for (const data of [null, true, 0, "", [], {}]) {
        assert.equal(validate(true, data).valid, true);
        assert.equal(validate(false, data).valid, false);
    }
});

test("supports alternatives, conditionals, tuple arrays and dependencies", () => {
    assert.equal(
        validate({ oneOf: [{ const: "a" }, { type: "integer" }] }, 3).valid,
        true,
    );
    assert.equal(
        // biome-ignore lint/suspicious/noThenProperty: Draft 7 uses then as a schema keyword.
        validate({ if: { const: 1 }, then: false, else: true }, 1).valid,
        false,
    );
    assert.equal(
        validate(
            { items: [{ type: "integer" }], additionalItems: false },
            [1, 2],
        ).valid,
        false,
    );
    assert.equal(
        validate({ dependencies: { a: ["b"] } }, { a: 1 }).valid,
        false,
    );
    assert.equal(validate({ uniqueItems: true }, [1, 1]).valid, false);
});

test("rejects malformed JSON, non-finite numbers and invalid schemas", () => {
    for (const schema of [
        null,
        [],
        { type: "banana" },
        { minimum: "1" },
        { required: "x" },
        { properties: { a: null } },
    ]) {
        assert.throws(() => validate(schema, 1), /Invalid Draft 7 schema/);
    }
    assert.throws(
        () => validateJson({ schema: "{", data: "1" }),
        /Schema is not valid JSON/,
    );
    assert.throws(
        () => validateJson({ schema: "true", data: "[" }),
        /Data is not valid JSON/,
    );
    assert.throws(
        () => validateJson({ schema: "true", data: "1e999" }),
        /finite range/,
    );
});

test("rejects unsupported schema features at nested schema locations", () => {
    for (const keyword of [
        "$ref",
        "pattern",
        "format",
        "$recursiveRef",
        "__absolute_ref__",
        "dependentRequired",
    ]) {
        assert.throws(
            () => validate({ properties: { a: { [keyword]: "#" } } }, {}),
            /Unsupported|Invalid Draft 7/,
        );
    }
    assert.throws(
        () =>
            validate(
                { $schema: "https://json-schema.org/draft/2020-12/schema" },
                {},
            ),
        /Only JSON Schema Draft 7/,
    );
    assert.throws(
        () => validate({ dependencies: { a: { patternProperties: {} } } }, {}),
        /Unsupported/,
    );
    // Literal data and property names that resemble keywords remain usable.
    assert.equal(
        validate({ const: { $ref: "literal" } }, { $ref: "literal" }).valid,
        true,
    );
    assert.equal(
        validate(
            { properties: { pattern: { type: "string" } } },
            { pattern: "ok" },
        ).valid,
        true,
    );
});

test("counts only own JSON members for required and handles prototype-like keys", () => {
    assert.equal(validate({ required: ["constructor"] }, {}).valid, false);
    assert.equal(validate({ required: ["toString"] }, {}).valid, false);
    assert.equal(
        validate({ required: ["constructor"] }, { constructor: "ok" }).valid,
        true,
    );
    assert.equal(
        validateJson({
            schema: '{"required":["__proto__"]}',
            data: '{"__proto__":3}',
        }).valid,
        true,
    );
});

test("bounds UTF-8 bytes, structural depth, value count and error output", () => {
    assert.throws(
        () =>
            validateJson({
                schema: "true",
                data: JSON.stringify("😀".repeat(20000)),
            }),
        /UTF-8 bytes/,
    );
    assert.throws(
        () =>
            validateJson({
                schema: "true",
                data: `${"[".repeat(34)}0${"]".repeat(34)}`,
            }),
        /depth 32/,
    );
    assert.throws(
        () => validate(true, Array(2001).fill(0)),
        /2,000 JSON values/,
    );
    const result = validate(
        { anyOf: Array.from({ length: 30 }, (_, i) => ({ const: i })) },
        "x",
    );
    assert.equal(result.valid, false);
    assert.equal(result.errors.length, 20);
    assert.equal(result.truncated, true);
});

for (const modern of [false, true]) {
    test(`real MCP discovery, validation and tool errors (${modern ? "modern" : "legacy"})`, async (t) => {
        const c = new Client(
            { name: "schema-test", version: "1" },
            {
                capabilities: {},
                ...(modern && { versionNegotiation: { mode: "auto" } }),
            },
        );
        await c.connect(
            new StreamableHTTPClientTransport(new URL("https://schema.test"), {
                fetch: (input, init) =>
                    worker.fetch(
                        input instanceof Request
                            ? input
                            : new Request(input, init),
                    ),
                requestInit: { headers: { Authorization: "Bearer sk_dummy" } },
            }),
        );
        t.after(() => c.close());
        const listed = await c.listTools();
        assert.equal(listed.tools[0].name, "validate_json");
        const result = await c.callTool({
            name: "validate_json",
            arguments: { schema: '{"type":"integer"}', data: '"2"' },
        });
        assert.equal(result.structuredContent.valid, false);
        assert.ok(!result.isError);
        const bad = await c.callTool({
            name: "validate_json",
            arguments: { schema: '{"type":"invalid"}', data: "1" },
        });
        assert.equal(bad.isError, true);
    });
}

test("health, authentication, routing and batch rejection", async () => {
    assert.equal(
        (await worker.fetch(new Request("https://schema.test/health"))).status,
        200,
    );
    assert.equal(
        (await worker.fetch(new Request("https://schema.test/unknown"))).status,
        404,
    );
    for (const authorization of [
        null,
        "Basic abc",
        "Bearer",
        "Bearer sk_dummy extra",
    ]) {
        const r = await worker.fetch(
            new Request("https://schema.test/", {
                headers: authorization ? { authorization } : {},
            }),
        );
        assert.equal(r.status, 401);
    }
    const r = await worker.fetch(
        new Request("https://schema.test/", {
            method: "POST",
            headers: {
                authorization: "Bearer sk_dummy",
                "Content-Type": "application/json",
            },
            body: "[]",
        }),
    );
    assert.equal(r.status, 400);
});
