import { SELF } from "cloudflare:test";
import { test, expect } from "vitest";
import { test as fixtureTest } from "../fixtures.ts";

// Test public endpoints that should be accessible without authentication
// These endpoints should work with CORS from any origin (e.g., pollinations.ai frontend)

test("GET /v1/models returns 200 without auth", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/v1/models`,
        {
            method: "GET",
        },
    );
    expect(response.status).toBe(200);

    // Verify it returns valid JSON with OpenAI models format
    const data = (await response.json()) as { data: unknown[] };
    expect(data).toBeDefined();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
});

test("GET /image/models returns 200 without auth", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/image/models`,
        {
            method: "GET",
        },
    );
    expect(response.status).toBe(200);

    // Verify it returns valid JSON array
    const data = (await response.json()) as unknown[];
    expect(Array.isArray(data)).toBe(true);
});

test("GET /v1/models has CORS headers for cross-origin requests", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/v1/models`,
        {
            method: "GET",
            headers: {
                origin: "https://pollinations.ai",
            },
        },
    );
    expect(response.status).toBe(200);
    await response.text(); // consume response

    // Verify CORS headers are present
    // (hono returns the requesting origin for security)
    const corsHeader = response.headers.get("access-control-allow-origin");
    expect(corsHeader).toBeTruthy();
});

test("GET /image/models has CORS headers for cross-origin requests", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/image/models`,
        {
            method: "GET",
            headers: {
                origin: "https://pollinations.ai",
            },
        },
    );
    expect(response.status).toBe(200);
    await response.text(); // consume response

    // Verify CORS headers are present
    // (hono returns the requesting origin for security)
    const corsHeader = response.headers.get("access-control-allow-origin");
    expect(corsHeader).toBeTruthy();
});

test("OPTIONS preflight request works for /image/models", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/image/models`,
        {
            method: "OPTIONS",
            headers: {
                origin: "https://pollinations.ai",
                "access-control-request-method": "GET",
            },
        },
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await response.text(); // consume response
});

// Test model filtering by API key permissions
// Uses restrictedApiKey fixture which is limited to ["openai-fast", "flux"]
fixtureTest(
    "GET /v1/models with restricted API key returns only allowed models",
    async ({ restrictedApiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/models`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${restrictedApiKey}`,
                },
            },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as {
            data: { id: string }[];
        };
        const modelIds = data.data.map((m) => m.id);

        expect(modelIds).toContain("openai-fast");
        expect(modelIds).not.toContain("openai");
        expect(modelIds).not.toContain("mistral");
    },
);

fixtureTest(
    "GET /image/models with restricted API key returns only allowed models",
    async ({ restrictedApiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/image/models`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${restrictedApiKey}`,
                },
            },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as { name: string }[];
        const modelNames = data.map((m) => m.name);

        expect(modelNames).toContain("flux");
        expect(modelNames).not.toContain("turbo");
    },
);
