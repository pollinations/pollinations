import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Embeddings", () => {
    test(
        "POST /v1/embeddings returns OpenAI-compatible response",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/embeddings",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        input: "Hello world",
                    }),
                },
            );
            const body = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${body}`,
            ).toBe(200);

            const data = JSON.parse(body) as {
                object: string;
                data: { object: string; embedding: number[]; index: number }[];
                model: string;
                usage: { prompt_tokens: number; total_tokens: number };
            };
            expect(data.object).toBe("list");
            expect(data.data).toHaveLength(1);
            expect(data.data[0].object).toBe("embedding");
            expect(data.data[0].embedding).toBeInstanceOf(Array);
            expect(data.data[0].embedding.length).toBeGreaterThan(0);
            expect(data.data[0].index).toBe(0);
            expect(data.usage.prompt_tokens).toBeGreaterThan(0);
        },
    );

    test(
        "POST /v1/embeddings supports custom dimensions",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/embeddings",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        input: "Hello world",
                        dimensions: 768,
                    }),
                },
            );
            const body = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${body}`,
            ).toBe(200);

            const data = JSON.parse(body) as {
                data: { embedding: number[] }[];
            };
            expect(data.data[0].embedding).toHaveLength(768);
        },
    );

    test(
        "POST /v1/embeddings supports batch input",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/embeddings",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        input: ["Hello", "World"],
                    }),
                },
            );
            const body = await response.text();
            expect(
                response.status,
                `Expected 200 but got ${response.status}: ${body}`,
            ).toBe(200);

            const data = JSON.parse(body) as {
                data: { index: number }[];
            };
            expect(data.data).toHaveLength(2);
            expect(data.data[0].index).toBe(0);
            expect(data.data[1].index).toBe(1);
        },
    );

    test(
        "POST /v1/embeddings rejects unauthenticated requests",
        { timeout: 10000 },
        async ({ mocks }) => {
            await mocks.enable("polar", "tinybird");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/embeddings",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        input: "Hello world",
                    }),
                },
            );
            expect(response.status).toBe(401);
        },
    );

    test(
        "GET /embeddings/models returns model list",
        { timeout: 10000 },
        async ({ mocks }) => {
            await mocks.enable("polar", "tinybird");
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/embeddings/models",
                { method: "GET" },
            );
            expect(response.status).toBe(200);

            const data = (await response.json()) as {
                object: string;
                data: { id: string; object: string }[];
            };
            expect(data.object).toBe("list");
            expect(data.data.length).toBeGreaterThan(0);
            expect(data.data[0].id).toBe("gemini-embedding-2");
            expect(data.data[0].object).toBe("model");
        },
    );
});
