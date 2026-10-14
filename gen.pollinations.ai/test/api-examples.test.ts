import { CreateDecisionRequestSchema } from "@shared/schemas/decisions.ts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildCurl, type Spec } from "../scripts/generate-apidocs.ts";
import { requestExampleErrors } from "../scripts/validate-request-examples.ts";
import { CreateMessageRequestSchema } from "../src/text/messages/schema.ts";

type Operation = Spec["paths"][string][string];

function specFor(operation: Operation, path = "/example"): Spec {
    return {
        openapi: "3.1.0",
        info: { title: "Examples", description: "", version: "1" },
        servers: [{ url: "https://gen.pollinations.ai" }],
        paths: { [path]: { post: operation } },
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

    it("accepts a complete object example without examples on its fields", () => {
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
                        example: { message: "Hello" },
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

    it("allows bodyless and optional-body writes but rejects missing required bodies", () => {
        const requestBody = jsonBody({ type: "string" }, false);
        expect(requestExampleErrors(specFor({}))).toEqual([]);
        expect(requestExampleErrors(specFor({ requestBody }))).toEqual([]);
        expect(
            requestExampleErrors(
                specFor({ requestBody: { ...requestBody, required: true } }),
            ),
        ).toEqual(["POST /example: required request body is missing"]);
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

    it("checks emitted parameter values and required parameters omitted by synthesis", () => {
        const errors = requestExampleErrors(
            specFor(
                {
                    parameters: [
                        {
                            in: "path",
                            name: "id",
                            required: true,
                            schema: { type: "string", pattern: "^model_" },
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
                            name: "requiredThird",
                            required: true,
                            schema: { type: "string", example: "value" },
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
            "required query parameter requiredThird is missing",
        );
        expect(errors).toContain(
            "required header parameter X-Required is missing",
        );
        expect(errors).not.toContain("/parameters/2/schema");
    });
});
