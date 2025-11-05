import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";

// Test public endpoints that should be accessible without authentication
// These endpoints should work with CORS from any origin (e.g., pollinations.ai frontend)

describe("Public model endpoints", () => {
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

describe("API auth endpoints", () => {
    test("Session cookies should not work for API proxy routes", async ({ sessionToken }) => {
        // Try to use session cookie for API generation endpoint (should fail)
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/text/test`,
            {
                method: "GET",
                headers: {
                    "Cookie": `better-auth.session_token=${sessionToken}`,
                },
            },
        );
        // Should return 401 because session auth is disabled for API routes
        expect(response.status).toBe(401);
    });
});
