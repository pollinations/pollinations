import { SELF } from "cloudflare:test";
import { test, expect } from "vitest";
import { test as fixtureTest } from "../fixtures.ts";

// Tests for the public /account/balance endpoint
// This endpoint requires API key authentication (no session cookies)

test("GET /account/balance returns 401 without authentication", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/account/balance`,
        {
            method: "GET",
        },
    );
    expect(response.status).toBe(401);
});

test("GET /account/balance returns 401 with session cookie (API key required)", async () => {
    // This test verifies that session cookies are NOT accepted
    // The endpoint is for API consumers only, not dashboard users
    const response = await SELF.fetch(
        `http://localhost:3000/api/account/balance`,
        {
            method: "GET",
            headers: {
                cookie: "better-auth.session_token=some-session-token",
            },
        },
    );
    expect(response.status).toBe(401);
});

fixtureTest(
    "GET /account/balance returns balance data with valid API key",
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");
        const response = await SELF.fetch(
            `http://localhost:3000/api/account/balance`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                },
            },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as {
            tierBalance: number;
            packBalance: number;
            totalBalance: number;
            pendingSpend: number;
            effectiveBalance: number;
            lastTierGrant: number | null;
        };

        // Verify all required fields are present
        expect(data).toHaveProperty("tierBalance");
        expect(data).toHaveProperty("packBalance");
        expect(data).toHaveProperty("totalBalance");
        expect(data).toHaveProperty("pendingSpend");
        expect(data).toHaveProperty("effectiveBalance");
        expect(data).toHaveProperty("lastTierGrant");

        // Verify types
        expect(typeof data.tierBalance).toBe("number");
        expect(typeof data.packBalance).toBe("number");
        expect(typeof data.totalBalance).toBe("number");
        expect(typeof data.pendingSpend).toBe("number");
        expect(typeof data.effectiveBalance).toBe("number");
        expect(
            data.lastTierGrant === null || typeof data.lastTierGrant === "number",
        ).toBe(true);

        // Verify calculated fields
        expect(data.totalBalance).toBe(data.tierBalance + data.packBalance);
        expect(data.effectiveBalance).toBe(
            Math.max(0, data.totalBalance - data.pendingSpend),
        );
    },
);

fixtureTest(
    "GET /account/balance works with API key as query parameter",
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");
        const response = await SELF.fetch(
            `http://localhost:3000/api/account/balance?key=${apiKey}`,
            {
                method: "GET",
            },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as {
            totalBalance: number;
        };
        expect(data).toHaveProperty("totalBalance");
    },
);

test("GET /account/balance has permissive CORS headers", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/account/balance`,
        {
            method: "OPTIONS",
            headers: {
                origin: "https://example.com",
                "access-control-request-method": "GET",
            },
        },
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    await response.text(); // consume response
});

test("GET /account/balance allows cross-origin requests from any domain", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/account/balance`,
        {
            method: "GET",
            headers: {
                origin: "https://random-developer-app.com",
            },
        },
    );
    // Will be 401 due to no auth, but CORS should still be set
    expect(response.status).toBe(401);
    const corsHeader = response.headers.get("access-control-allow-origin");
    expect(corsHeader).toBe("*");
});
