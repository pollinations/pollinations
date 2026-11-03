import { SELF } from "cloudflare:test";
import {
    isPublicEnterPath,
    publicEnterPath,
} from "@shared/utils/public-docs.ts";
import { expect, test } from "vitest";
import { z } from "zod";
import {
    buildCurl,
    renderEndpoint,
    type Spec,
} from "../../gen.pollinations.ai/scripts/generate-apidocs.ts";
import { requestExampleErrors } from "../../gen.pollinations.ai/scripts/validate-request-examples.ts";
import {
    CreateEndpointAgentSchema,
    CreateEndpointSchema,
    TestEndpointSchema,
} from "../src/routes/community-endpoints/schemas.ts";

test("legacy enter docs page redirects to gen docs", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docs?format=json",
        { redirect: "manual" },
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
        "https://gen.pollinations.ai/docs?format=json",
    );
});

test("enter docs schema remains available for gen service binding", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docs/open-api/generate-schema",
        { redirect: "manual" },
    );

    expect(response.status).toBe(200);
    const schema = (await response.json()) as Spec;

    expect(schema.paths?.["/account/profile"]?.get).toBeDefined();
    expect(schema.paths?.["/account/quests"]).toBeDefined();
    expect(schema.paths?.["/account/my-models"]).toBeDefined();
    expect(schema.paths?.["/account/agents"]).toBeDefined();
    expect(schema.paths?.["/account/promo-codes/redeem"]).toBeUndefined();

    const publicSchema = {
        ...schema,
        paths: Object.fromEntries(
            Object.entries(schema.paths)
                .filter(([path]) => isPublicEnterPath(path))
                .map(([path, operations]) => [
                    publicEnterPath(path),
                    operations,
                ]),
        ),
    };
    expect(requestExampleErrors(publicSchema)).toEqual([]);

    for (const [path, firstField, secondField, sharedField, firstLabel] of [
        [
            "/account/agents",
            "repository",
            "systemPrompt",
            "visibility",
            '`type`: `"code_agent"`',
        ],
        [
            "/account/my-models",
            "url",
            "baseUrl",
            "bearerToken",
            '`modality`: `"text"`',
        ],
        [
            "/account/my-models/test",
            "url",
            "baseUrl",
            "bearerToken",
            '`modality`: `"text"`',
        ],
    ]) {
        const markdown = renderEndpoint(
            publicSchema,
            "post",
            path,
            publicSchema.paths[path].post,
        );
        const body = markdown
            .split("📥 **Request body**")[1]
            .split("📤 **Response**")[0];
        const [, first, second] = body.split(/\*\*Alternative \d+\*\*/);
        expect(
            body
                .split("\n")
                .filter((line) => line.startsWith(`| \`${sharedField}\``)),
        ).toHaveLength(1);
        expect(first).toContain(firstLabel);
        expect(first).toContain(`| \`${firstField}\` * |`);
        expect(first).not.toContain(`| \`${secondField}\``);
        expect(second).toContain(`| \`${secondField}\` * |`);
        expect(second).not.toContain(`| \`${firstField}\``);
        if (path.endsWith("/test")) {
            expect(first).toContain("| `model` * |");
            expect(second).toContain("| `model` |");
        }
    }
});

test.each([
    {
        path: "/account/my-models",
        operationId: "postAccountMyModels",
        schema: CreateEndpointSchema,
        invalid: {
            name: "my-community-model",
            baseUrl: "https://api.example.com/v1",
            bearerToken: "sk-upstream-token",
        },
    },
    {
        path: "/account/my-models/test",
        operationId: "postAccountMyModelsTest",
        schema: TestEndpointSchema,
        invalid: {
            baseUrl: "https://api.example.com/v1",
            bearerToken: "sk-upstream-token",
            model: "llama-3.3-70b",
        },
    },
    {
        path: "/account/my-models/endpoint-agents",
        operationId: "postAccountMyModelsEndpointAgents",
        schema: CreateEndpointAgentSchema,
        invalid: {
            name: "my-agent",
            title: "My Agent",
            baseUrl: "https://agent.example.com/v1",
        },
    },
])(
    "rejects the old $path body and validates the emitted curated replacement",
    ({ path, operationId, schema, invalid }) => {
        const requestBody = {
            required: true,
            content: {
                "application/json": {
                    schema: {
                        ...z.toJSONSchema(schema, {
                            io: "input",
                            unrepresentable: "any",
                        }),
                        example: invalid,
                    },
                },
            },
        };
        const operation = { operationId, requestBody };
        const spec: Spec = {
            openapi: "3.1.0",
            info: { title: "Examples", description: "", version: "1" },
            servers: [{ url: "https://gen.pollinations.ai" }],
            paths: { [path]: { post: operation } },
            components: { schemas: {} },
        };
        // Without a curated override, the actual generator emits this
        // complete example; the guard must reject its contents.
        expect(
            requestExampleErrors({
                ...spec,
                paths: { [path]: { post: { requestBody } } },
            }),
        ).not.toEqual([]);

        const curl = buildCurl(spec, "post", path, operation);
        expect(curl).toContain('-H "Content-Type: application/json"');
        const payload = curl.match(/-d '([^']*)'/)?.[1];
        expect(payload).toBeDefined();
        if (!payload) throw new Error("Missing generated JSON body");
        expect(schema.safeParse(JSON.parse(payload)).success).toBe(true);
        expect(requestExampleErrors(spec)).toEqual([]);
    },
);

test("legacy enter docs redirect keeps the docs path boundary", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docss",
        {
            redirect: "manual",
        },
    );

    expect(response.status).not.toBe(301);
    expect(response.headers.get("Location")).toBeNull();
});
