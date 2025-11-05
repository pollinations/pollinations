import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";

// Test public endpoints that should be accessible without authentication
// These endpoints should work with CORS from any origin (e.g., pollinations.ai frontend)

describe("Public model endpoints", () => {
    test("GET /openai/models returns 200 without auth", async () => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/openai/models`,
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

    test("GET /openai/models has CORS headers for cross-origin requests", async () => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/openai/models`,
            {
                method: "GET",
                headers: {
                    origin: "https://pollinations.ai",
                },
            },
        );
        expect(response.status).toBe(200);

        // Verify CORS headers are present (Hono returns the requesting origin for security)
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

        // Verify CORS headers are present (Hono returns the requesting origin for security)
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
    });
});
