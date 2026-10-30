import { env, SELF } from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { createApiKeyViaApi, test } from "./fixtures.ts";

const endpoint = "/api/account/key";

/** Authenticates a raw key and waits for the background writes it starts. */
async function authenticateKey(key: string) {
    const pending: Promise<unknown>[] = [];
    const result = await authenticateApiKeyRequest({
        request: new Request("http://localhost", {
            headers: { Authorization: `Bearer ${key}` },
        }),
        env,
        ctx: { waitUntil: (promise) => void pending.push(promise) },
    });
    await Promise.all(pending);
    return result;
}

function updateKey(
    id: string,
    values: Partial<typeof schema.apikey.$inferInsert>,
) {
    return drizzle(env.DB)
        .update(schema.apikey)
        .set(values)
        .where(eq(schema.apikey.id, id))
        .run();
}

async function lastRequest(id: string) {
    const row = await drizzle(env.DB)
        .select({ lastRequest: schema.apikey.lastRequest })
        .from(schema.apikey)
        .where(eq(schema.apikey.id, id))
        .get();
    return row?.lastRequest ?? null;
}

test("API key auth writes last used at most every 5 minutes", {
    timeout: 30000,
}, async ({ accountToken, mocks }) => {
    await mocks.enable("tinybird");
    const { id, key } = await createApiKeyViaApi(accountToken, {
        name: "last-used",
    });

    await updateKey(id, { lastRequest: null });
    expect(await authenticateKey(key)).toBeTruthy();
    expect(await lastRequest(id)).toBeInstanceOf(Date);

    await updateKey(id, { lastRequest: new Date(Date.now() - 60_000) });
    const recent = await lastRequest(id);
    await authenticateKey(key);
    expect(await lastRequest(id)).toEqual(recent);

    const stale = new Date(Date.now() - 10 * 60_000);
    await updateKey(id, { lastRequest: stale });
    await authenticateKey(key);
    expect((await lastRequest(id))?.getTime()).toBeGreaterThan(
        stale.getTime() + 5 * 60_000,
    );
});

test("API key auth keeps rejecting a refused key from the cache", {
    timeout: 30000,
}, async ({ accountToken, mocks }) => {
    await mocks.enable("tinybird");
    const { id, key } = await createApiKeyViaApi(accountToken, {
        name: "refused",
    });

    await updateKey(id, { enabled: false });
    expect(await authenticateKey(key)).toBeNull();

    // The refusal is remembered for 5 minutes instead of asking D1 again.
    await updateKey(id, { enabled: true });
    expect(await authenticateKey(key)).toBeNull();
});

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

test("GET /api/account/key - returns key status for secret key", {
    timeout: 30000,
}, async ({ apiKey, mocks }) => {
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
});

test("GET /api/account/key - agent run token has no account permissions", {
    timeout: 30000,
}, async ({ accountToken, mocks }) => {
    await mocks.enable("tinybird");
    const { key } = await createApiKeyViaApi(accountToken, {
        name: "agent-parent",
        accountPermissions: ["usage", "keys"],
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
    expect(data.permissions.account).toBeNull();

    const createResponse = await SELF.fetch(
        "http://localhost:3000/api/account/keys",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${runToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: "agent-created-key" }),
        },
    );
    expect(createResponse.status).toBe(403);
    // No grant link: granting it to the parent key wouldn't let the agent in.
    const refusal = await createResponse.json();
    expect(refusal.error).toMatchObject({
        message: "Agent runs can't use 'account:keys'.",
    });
    expect(refusal.error).not.toHaveProperty("fixUrl");
});

test("GET /api/account/key - returns key status for publishable key", {
    timeout: 30000,
}, async ({ pubApiKey, mocks }) => {
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
});

test("GET /api/account/key - shows permissions for restricted key", {
    timeout: 30000,
}, async ({ restrictedApiKey, mocks }) => {
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
});

test("GET /api/account/key - shows pollenBudget for budgeted key", {
    timeout: 30000,
}, async ({ budgetedApiKey, mocks }) => {
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
});

test("GET /api/account/key - returns byopApp null for non-BYOP key", {
    timeout: 30000,
}, async ({ apiKey, mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(`http://localhost:3000${endpoint}`, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.byopApp).toBeNull();
});

test("GET /api/account/key - works with query parameter", {
    timeout: 30000,
}, async ({ apiKey, mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        `http://localhost:3000${endpoint}?key=${apiKey}`,
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.valid).toBe(true);
});

test("GET /api/account/key - calculates expiresIn correctly", {
    timeout: 30000,
}, async ({ apiKey, mocks }) => {
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
        expect(Math.abs(data.expiresIn - expectedExpiresIn)).toBeLessThan(5);
    }
});

test("GET /api/account/key - returns null for keys without expiry", {
    timeout: 30000,
}, async ({ apiKey, mocks }) => {
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
});
