import { CreateDecisionRequestSchema } from "@shared/schemas/decisions.ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildCurl, type Spec } from "../scripts/generate-apidocs.ts";
import { requestExampleErrors } from "../scripts/validate-request-examples.ts";
import { CreateMessageRequestSchema } from "../src/text/messages/schema.ts";

type Operation = Spec["paths"][string][string];

function specFor(
    operation: Operation,
    path = "/example",
    method = "post",
): Spec {
    return {
        openapi: "3.1.0",
        info: { title: "Examples", description: "", version: "1" },
        servers: [{ url: "https://gen.pollinations.ai" }],
        paths: { [path]: { [method]: operation } },
        components: { schemas: {} },
    };
}

function jsonBody(schema: Record<string, unknown>, required = true) {
    return {
        required,
        content: { "application/json": { schema } },
    };
}

const regressions = [
    {
        path: "/v1/messages",
        operationId: "postV1Messages",
        schema: CreateMessageRequestSchema,
        invalid: {
            messages: [
                { role: "user", content: [{ source: { type: "url" } }] },
            ],
        },
    },
    {
        path: "/alpha/decisions",
        operationId: "postAlphaDecisions",
        schema: CreateDecisionRequestSchema,
        invalid: { state: "My payouts have been failing for 3 days." },
    },
];

describe("API request examples", () => {
    it.each(regressions)(
        "rejects the old $path body and validates the emitted curated replacement",
        ({ path, operationId, schema, invalid }) => {
            const requestBody = jsonBody({
                ...z.toJSONSchema(schema, {
                    io: "input",
                    unrepresentable: "any",
                }),
                example: invalid,
            });
            // Without a curated override, the actual generator emits this
            // complete example; the guard must reject its contents.
            expect(
                requestExampleErrors(specFor({ requestBody }, path)),
            ).not.toEqual([]);

            const operation = { operationId, requestBody };
            const spec = specFor(operation, path);
            const curl = buildCurl(spec, "post", path, operation);
            expect(curl).toContain('-H "Content-Type: application/json"');
            const payload = curl.match(/-d '([^']*)'/)?.[1];
            expect(payload).toBeDefined();
            if (!payload) throw new Error("Missing generated JSON body");
            expect(schema.safeParse(JSON.parse(payload)).success).toBe(true);
            expect(requestExampleErrors(spec)).toEqual([]);
        },
    );

    it("accepts a complete object example, including literal colon text", () => {
        expect(
            requestExampleErrors(
                specFor({
                    requestBody: jsonBody({
                        type: "object",
                        properties: {
                            message: { type: "string", minLength: 1 },
                        },
                        required: ["message"],
                        additionalProperties: false,
                        example: { message: ":text" },
                    }),
                }),
            ),
        ).toEqual([]);
    });

    it("rejects invalid nested union content and does not fill required defaults", () => {
        const spec = specFor({
            requestBody: jsonBody({
                type: "object",
                properties: {
                    retries: { type: "integer", default: 3 },
                    payload: {
                        oneOf: [
                            {
                                type: "object",
                                properties: { text: { type: "string" } },
                                required: ["text"],
                            },
                            { type: "array", items: { type: "string" } },
                        ],
                    },
                },
                required: ["retries", "payload"],
                example: { payload: { text: 7 } },
            }),
        });
        const errors = requestExampleErrors(spec).join("\n");
        expect(errors).toContain("required property 'retries'");
        expect(errors).toContain("/payload/text must be string");
    });

    it("allows bodyless writes but rejects a declared body without an example", () => {
        expect(requestExampleErrors(specFor({}))).toEqual([]);
        // The promo redemption shape: a plain required string, body not
        // marked required. The generator emits no body for it.
        const requestBody = jsonBody(
            {
                type: "object",
                properties: { code: { type: "string" } },
                required: ["code"],
            },
            false,
        );
        expect(requestExampleErrors(specFor({ requestBody }))).toEqual([
            "POST /example: request body example is missing",
        ]);
    });

    it("validates the synthesized fallback and rejects an undocumented curated body", () => {
        expect(
            requestExampleErrors(
                specFor({
                    requestBody: jsonBody({
                        type: "object",
                        properties: {
                            message: { type: "string", example: "Hi" },
                        },
                        required: ["message"],
                    }),
                }),
            ),
        ).toEqual([]);
        expect(
            requestExampleErrors(specFor({ operationId: "postV1Messages" })),
        ).toEqual([
            "POST /example: emitted application/json body has no matching schema",
        ]);
    });

    it("checks simplified model examples against the original enum", () => {
        const allowed = Array.from(
            { length: 16 },
            (_, index) => `model-${index}`,
        );
        const schema = {
            type: "string",
            enum: allowed,
            default: "not-an-allowed-model",
        };
        const spec = specFor({
            parameters: [{ in: "query", name: "model", schema }],
        });
        // Rendering removes long enums and selects the default. Validation
        // must still enforce the original enum and leave its source intact.
        expect(requestExampleErrors(spec).join("\n")).toContain(
            "must be equal to one of the allowed values",
        );
        expect(schema.enum).toEqual(allowed);
    });

    it.each([
        { method: "get", path: "/text/{prompt}", name: "seed" },
        { method: "get", path: "/media", name: "limit" },
        { method: "head", path: "/example", name: "limit" },
    ])(
        "validates integer query examples on $method $path",
        ({ method, path, name }) => {
            const schema = {
                type: "integer",
                minimum: 1,
                example: `:${name}` as string | number,
            };
            const operation = {
                parameters: [
                    { in: "query", name, schema },
                    ...(path.includes("{prompt}")
                        ? [
                              {
                                  in: "path",
                                  name: "prompt",
                                  required: true,
                                  schema: { type: "string", example: "Hello" },
                              },
                          ]
                        : []),
                ],
            };
            const spec = specFor(operation, path, method);
            expect(requestExampleErrors(spec).join("\n")).toContain(
                "must be integer",
            );

            schema.example = 42;
            const curl = buildCurl(spec, method, path, operation);
            expect(curl).toContain(`${name}=42`);
            expect(requestExampleErrors(spec)).toEqual([]);
        },
    );

    it.each(["key", "tag", "search", "safe"])(
        "rejects unresolved string query placeholder :%s",
        (name) => {
            const spec = specFor(
                {
                    parameters: [
                        {
                            in: "query",
                            name,
                            schema: { type: "string", example: `:${name}` },
                        },
                    ],
                },
                "/example",
                "get",
            );
            expect(requestExampleErrors(spec)).toEqual([
                `GET /example: unresolved URL placeholder :${name}`,
            ]);
        },
    );

    it("rejects an unresolved string path placeholder", () => {
        const spec = specFor(
            {
                parameters: [
                    {
                        in: "path",
                        name: "model",
                        required: true,
                        schema: { type: "string", example: ":model" },
                    },
                ],
            },
            "/v1/models/{model}",
            "get",
        );
        expect(requestExampleErrors(spec)).toEqual([
            "GET /v1/models/{model}: unresolved URL placeholder :model",
        ]);
    });

    it("keeps required query values after two useful optional values and omits missing examples", () => {
        const operation = {
            parameters: [
                { name: "unused", schema: { type: "string" } },
                { name: "offset", schema: { type: "integer", default: 0 } },
                { name: "safe", schema: { type: "boolean", example: false } },
                {
                    name: "requiredThird",
                    required: true,
                    schema: { type: "string", example: "value" },
                },
                { name: "extra", schema: { type: "integer", example: 1 } },
            ].map((parameter) => ({ in: "query", ...parameter })),
        };
        const spec = specFor(operation, "/example", "get");
        const curl = buildCurl(spec, "get", "/example", operation);
        const url = new URL(curl.match(/"([^"]+)"/)?.[1] ?? "");
        expect(Object.fromEntries(url.searchParams)).toEqual({
            offset: "0",
            safe: "false",
            requiredThird: "value",
        });
        expect(requestExampleErrors(spec)).toEqual([]);
    });

    it.each([
        { path: "/account/keys/{id}", fallback: "key_abc123" },
        { path: "/account/integrations/{id}", fallback: "ca_abc123" },
        {
            path: "/media/{id}",
            fallback: "550e8400-e29b-41d4-a716-446655440000",
        },
    ])(
        "uses a route-specific ID only when $path has no schema example",
        ({ path, fallback }) => {
            const schema: Record<string, unknown> = { type: "string" };
            const operation = {
                parameters: [
                    { in: "path", name: "id", required: true, schema },
                ],
            };
            const spec = specFor(operation, path, "get");
            expect(buildCurl(spec, "get", path, operation)).toContain(
                path.replace("{id}", fallback),
            );
            schema.example = "from/schema";
            expect(buildCurl(spec, "get", path, operation)).toContain(
                path.replace("{id}", "from%2Fschema"),
            );
            expect(requestExampleErrors(spec)).toEqual([]);
        },
    );

    it("checks emitted parameter values and required parameters omitted by synthesis", () => {
        const errors = requestExampleErrors(
            specFor(
                {
                    parameters: [
                        {
                            in: "path",
                            name: "id",
                            required: true,
                            schema: {
                                type: "string",
                                pattern: "^model_",
                                example: "key_abc123",
                            },
                        },
                        {
                            in: "query",
                            name: "limit",
                            schema: { type: "integer", minimum: 1, example: 0 },
                        },
                        {
                            in: "query",
                            name: "offset",
                            schema: { type: "integer", minimum: 0, default: 0 },
                        },
                        {
                            in: "query",
                            name: "requiredValue",
                            required: true,
                            schema: { type: "string" },
                        },
                        {
                            in: "header",
                            name: "X-Required",
                            required: true,
                            schema: { type: "string" },
                        },
                    ],
                },
                "/example/{id}",
            ),
        ).join("\n");
        expect(errors).toContain('must match pattern "^model_"');
        expect(errors).toContain("must be >= 1");
        expect(errors).toContain(
            "required query parameter requiredValue is missing",
        );
        expect(errors).toContain(
            "required header parameter X-Required is missing",
        );
        expect(errors).not.toContain("/parameters/2/schema");
    });
});
