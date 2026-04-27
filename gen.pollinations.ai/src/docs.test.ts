import { describe, expect, it } from "vitest";
import { createGenerationApp } from "./generation.ts";
import worker from "./index.ts";

const executionContext = {
    waitUntil() {},
    passThroughOnException() {},
} as unknown as ExecutionContext;

function envWithEnterSchema(schema: unknown): CloudflareBindings {
    return {
        ENTER: {
            fetch: async () =>
                new Response(JSON.stringify(schema), {
                    headers: { "Content-Type": "application/json" },
                }),
        } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
    } as CloudflareBindings;
}

describe("docs routes", () => {
    it("serves a gen-owned OpenAPI schema and merges non-generation enter paths", async () => {
        const app = createGenerationApp();
        const enterSchema = {
            openapi: "3.1.0",
            info: { title: "Enter", version: "0.0.0" },
            tags: [{ name: "Account" }],
            components: {
                schemas: {
                    EnterOnly: { type: "object" },
                },
            },
            paths: {
                "/account/key": { get: { tags: ["Account"] } },
                "/generate/text/{prompt}": { get: { tags: ["Old"] } },
            },
        };

        const response = await app.fetch(
            new Request(
                "https://gen.pollinations.ai/api/docs/open-api/generate-schema",
            ),
            envWithEnterSchema(enterSchema),
            executionContext,
        );

        expect(response.status).toBe(200);
        const schema = (await response.json()) as {
            paths: Record<string, unknown>;
            servers: { url: string }[];
            components: { schemas: Record<string, unknown> };
        };

        expect(schema.servers).toEqual([
            { url: "https://gen.pollinations.ai" },
        ]);
        expect(schema.paths["/v1/chat/completions"]).toBeDefined();
        expect(schema.paths["/image/{prompt}"]).toBeDefined();
        expect(schema.paths["/account/key"]).toBeDefined();
        expect(schema.paths["/generate/text/{prompt}"]).toBeUndefined();
        expect(schema.components.schemas.EnterOnly).toBeDefined();
    });

    it("does not add noindex to docs responses at the worker boundary", async () => {
        const response = await worker.fetch(
            new Request("https://gen.pollinations.ai/api/docs/llm.txt"),
            envWithEnterSchema({}),
            executionContext,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("X-Robots-Tag")).toBeNull();
    });
});
