import { test, expect } from "../fixtures.ts";
import { SELF } from "cloudflare:test";
import { PUBLISHABLE_KEY_PREFIX } from "../../src/constants.ts";

const TEST_PUBLISHABLE_KEY = `${PUBLISHABLE_KEY_PREFIX}_test123456789`;

test("GET /api/auth/session-key - should create and return a publishable API key from session", async ({
    sessionToken,
}) => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/session-key",
        {
            method: "GET",
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("key");
    expect(data).toHaveProperty("keyId");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("type");
    expect(data.type).toBe("publishable");
    expect(typeof data.key).toBe("string");
    expect(data.key.startsWith(`${PUBLISHABLE_KEY_PREFIX}_`)).toBe(true);
});

test("GET /api/auth/session-key - should return existing publishable key if one exists", async ({
    sessionToken,
    auth,
}) => {
    // Create a publishable key first
    const createResult = await auth.apiKey.create({
        name: "existing-session-key",
        prefix: PUBLISHABLE_KEY_PREFIX,
        metadata: {
            plaintextKey: TEST_PUBLISHABLE_KEY,
            keyType: "publishable",
        },
        fetchOptions: {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    });

    expect(createResult.data).toBeTruthy();
    
    // Now call the session-key endpoint
    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/session-key",
        {
            method: "GET",
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("key");
    expect(data.type).toBe("publishable");
    // Should return the existing key with plaintextKey from metadata
    expect(data.key).toBe(TEST_PUBLISHABLE_KEY);
});

test("GET /api/auth/session-key - should return 401 for unauthenticated requests", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/session-key",
        {
            method: "GET",
        },
    );

    expect(response.status).toBe(401);
});
