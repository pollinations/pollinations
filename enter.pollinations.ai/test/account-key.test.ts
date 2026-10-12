import { env, SELF } from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import { expect } from "vitest";
import { createApiKeyViaApi, test } from "./fixtures.ts";

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
        await mocks.enable("tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(typeof data.id).toBe("string");
        expect(data.id.length).toBeGreaterThan(0);
        expect(data.id).not.toBe(apiKey);
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
    "GET /api/account/key - accepts an agent run token",
    { timeout: 30000 },
    async ({ accountToken, mocks }) => {
        await mocks.enable("tinybird");
        const { key } = await createApiKeyViaApi(accountToken, {
            name: "agent-parent",
            accountPermissions: ["usage"],
        });
        const parent = await authenticateApiKeyRequest({
            request: new Request("http://localhost", {
                headers: { Authorization: `Bearer ${key}` },
            }),
            env,
        });
        expect(parent?.user?.id).toBeTruthy();

        const runToken = await signAgentRunToken({
            secret: env.BETTER_AUTH_SECRET,
            parentApiKeyId: parent?.apiKey.id as string,
            parentRequestId: crypto.randomUUID(),
        });
        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: { Authorization: `Bearer ${runToken}` },
        });

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toMatchObject({
            valid: true,
            type: "secret",
            userId: parent?.user?.id,
            byopApp: null,
        });
        // A run token carries the parent key's account permissions.
        expect(data.permissions.account).toEqual(["usage"]);
    },
);

test(
    "GET /api/account/key - returns key status for publishable key",
    { timeout: 30000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("tinybird");

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
        await mocks.enable("tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${restrictedApiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.permissions).toBeDefined();
        expect(data.permissions.models).toEqual(["text", "image"]);
    },
);

test(
    "GET /api/account/key - shows pollenBudget for budgeted key",
    { timeout: 30000 },
    async ({ budgetedApiKey, mocks }) => {
        await mocks.enable("tinybird");

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
    "GET /api/account/key - returns byopApp null for non-BYOP key",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("tinybird");

        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.byopApp).toBeNull();
    },
);

test(
    "GET /api/account/key - works with query parameter",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("tinybird");

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
        await mocks.enable("tinybird");

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
            expect(Math.abs(data.expiresIn - expectedExpiresIn)).toBeLessThan(
                5,
            );
        }
    },
);

test(
    "GET /api/account/key - returns null for keys without expiry",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("tinybird");

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

test("DELETE /api/account/key - revokes only the caller without account permissions", async ({
    accountToken,
    pubApiKey,
}) => {
    const current = await createApiKeyViaApi(accountToken, {
        name: "disconnect-current",
    });
    const unrelated = await createApiKeyViaApi(accountToken, {
        name: "disconnect-unrelated",
    });
    const headers = { Authorization: `Bearer ${current.key}` };
    const before = await SELF.fetch(`http://localhost:3000${endpoint}`, {
        headers,
    });
    expect(before.status).toBe(200);
    expect((await before.json()).permissions?.account ?? []).not.toContain(
        "keys",
    );

    const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
        method: "DELETE",
        headers,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    for (const method of ["GET", "DELETE"]) {
        const revoked = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            method,
            headers,
        });
        expect(revoked.status).toBe(401);
        await revoked.text();
    }
    for (const key of [unrelated.key, pubApiKey]) {
        const preserved = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        expect(preserved.status).toBe(200);
        await preserved.text();
    }
});

test("DELETE /api/account/key - rejects public keys, sessions, and agent run tokens", async ({
    accountToken,
    pubApiKey,
}) => {
    const parent = await createApiKeyViaApi(accountToken, {
        name: "disconnect-agent-parent",
    });
    const runToken = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: parent.id,
        parentRequestId: crypto.randomUUID(),
    });
    for (const token of [pubApiKey, accountToken, runToken]) {
        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(response.status).toBe(403);
        await response.text();
    }
    for (const key of [parent.key, pubApiKey]) {
        const preserved = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        expect(preserved.status).toBe(200);
        await preserved.text();
    }
});

test("DELETE /api/account/key - requires authentication", async () => {
    for (const headers of [{}, { Authorization: "Bearer invalid_key" }]) {
        const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
            method: "DELETE",
            headers,
        });
        expect(response.status).toBe(401);
        await response.text();
    }
});
