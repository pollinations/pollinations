import { test, expect } from "../fixtures.ts";
import { SELF } from "cloudflare:test";
import { SECRET_KEY_PREFIX } from "../../src/constants.ts";

const TEST_SECRET = "a".repeat(64); // 64 character hex string

test("GET /api/auth/api-key - should create and return a secret API key with valid secret", async ({
    sessionToken,
}) => {
    // First, store a redirect secret
    const sessionId = "test-session-id";
    const storeResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/api-key/store-redirect-secret",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                secret: TEST_SECRET,
                sessionId: sessionId,
            }),
        },
    );

    expect(storeResponse.status).toBe(200);

    // Now retrieve the API key using the secret
    const response = await SELF.fetch(
        `http://localhost:3000/api/auth/api-key?secret=${TEST_SECRET}`,
        {
            method: "GET",
        },
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toHaveProperty("key");
    expect(data).toHaveProperty("keyId");
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("type");
    expect(data.type).toBe("secret");
    expect(typeof data.key).toBe("string");
    expect(data.key.startsWith(`${SECRET_KEY_PREFIX}_`)).toBe(true);
});

test("GET /api/auth/api-key - should return 401 for invalid secret", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/auth/api-key?secret=${"b".repeat(64)}`,
        {
            method: "GET",
        },
    );

    expect(response.status).toBe(401);
});

test("POST /api/auth/api-key/store-redirect-secret - should return 401 for unauthenticated requests", async () => {
    const response = await SELF.fetch(
        "http://localhost:3000/api/auth/api-key/store-redirect-secret",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                secret: TEST_SECRET,
                sessionId: "test-session-id",
            }),
        },
    );

    expect(response.status).toBe(401);
});
