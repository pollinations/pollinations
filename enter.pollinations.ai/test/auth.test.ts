import { expect } from "vitest";
import { test } from "./fixtures";
import { Session, User } from "@/auth.ts";
import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";

test("Authenticate via session cookie and validate user data", async ({
    auth,
    sessionToken,
    mocks,
}) => {
    const response = await auth.getSession({
        fetchOptions: {
            headers: {
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
        },
    });

    if (!response.data) {
        throw new Error(`Failed to get session: ${response.error}`);
    }

    const mockUser = mocks.github.state.user;
    const user = response.data.user as User;
    const session = response.data.session as Session;

    expect(user).toBeDefined();
    expect(user.email).toBe(mockUser.email);
    expect(user.name).toBe(mockUser.name);
    expect(user.tier).toBe("seed");
    expect(user.githubId).toBe(mockUser.id);
    expect(user.githubUsername).toBe(mockUser.login);

    expect(session).toBeDefined();
});

// Test key query parameter support (Issue #4820)
test("Authenticate via key query parameter", async ({ apiKey }) => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/text/hello?key=${apiKey}`,
        {
            method: "GET",
            headers: {
                "referer": env.TESTING_REFERRER,
            },
        },
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
});

test("Invalid key query parameter should return 401", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/text/hello?key=invalid-key`,
        {
            method: "GET",
        },
    );
    expect(response.status).toBe(401);
});

// Note: The restriction on key types in URLs has been removed.
// All API key types (pk_*, sk_*, etc.) can now be passed via query parameter.
// Invalid keys will be validated by the API key verification system and return 401.

test("Secret key in query parameter should return 401 (invalid key)", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/text/hello?key=sk_secret_key_123`,
        {
            method: "GET",
        },
    );
    expect(response.status).toBe(401);
});

test("Non-prefixed key in query parameter should return 401 (invalid key)", async () => {
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/text/hello?key=some_random_key`,
        {
            method: "GET",
        },
    );
    expect(response.status).toBe(401);
});
