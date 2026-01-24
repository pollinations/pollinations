import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const endpoint = "/api/account/key";

test("GET /api/account/key - returns 401 without API key", async () => {
    const response = await SELF.fetch(`http://localhost:3000${endpoint}`);
    expect(response.status).toBe(401);
    const text = await response.text();
    // Just check that we get a 401 - error structure may vary
    expect(text).toBeTruthy();
});

test("GET /api/account/key - returns 401 with invalid API key", async () => {
    const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
        headers: {
            Authorization: "Bearer invalid_key_12345",
        },
    });
    expect(response.status).toBe(401);
    const text = await response.text();
    // Just check that we get a 401 - error structure may vary
    expect(text).toBeTruthy();
});

test(
    "GET /api/account/key - returns key status for secret key",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.valid).toBe(true);
        expect(data.type).toBe("secret");
        expect(data.name).toBeTruthy();
        expect(data).toHaveProperty("expiresAt");
        expect(data).toHaveProperty("expiresIn");
        expect(data).toHaveProperty("permissions");
        expect(data).toHaveProperty("pollenBudget");
        expect(data).toHaveProperty("rateLimitEnabled");
    },
);

test(
    "GET /api/account/key - returns key status for publishable key",
    { timeout: 30000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${pubApiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.valid).toBe(true);
        expect(data.type).toBe("publishable");
        expect(data.rateLimitEnabled).toBe(true);
    },
);

test(
    "GET /api/account/key - shows permissions for restricted key",
    { timeout: 30000 },
    async ({ restrictedApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${restrictedApiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.permissions).toBeDefined();
        expect(data.permissions.models).toEqual(["openai-fast", "flux"]);
    },
);

test(
    "GET /api/account/key - shows pollenBudget for budgeted key",
    { timeout: 30000 },
    async ({ budgetedApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${budgetedApiKey.key}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.pollenBudget).toBeDefined();
        expect(typeof data.pollenBudget).toBe("number");
        expect(data.pollenBudget).toBe(100); // Initial budget from fixture
    },
);

test(
    "GET /api/account/key - works with query parameter",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(
            `http://localhost:3000${endpoint}?key=${apiKey}`,
        );
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.valid).toBe(true);
    },
);

test(
    "GET /api/account/key - calculates expiresIn correctly",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        if (data.expiresAt) {
            expect(data.expiresIn).toBeDefined();
            expect(typeof data.expiresIn).toBe("number");

            // Verify expiresIn is calculated correctly
            const expiresAtMs = new Date(data.expiresAt).getTime();
            const nowMs = Date.now();
            const expectedExpiresIn = Math.floor((expiresAtMs - nowMs) / 1000);

            // Allow for some time drift during test execution (5 seconds)
            expect(Math.abs(data.expiresIn - expectedExpiresIn)).toBeLessThan(5);
        }
    },
);

test(
    "GET /api/account/key - returns null for keys without expiry",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        // Most test keys don't have expiry set
        if (!data.expiresAt) {
            expect(data.expiresAt).toBeNull();
            expect(data.expiresIn).toBeNull();
        }
    },
);