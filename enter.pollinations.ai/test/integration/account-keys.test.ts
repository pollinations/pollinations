import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Account Key Management API", () => {
    describe("POST /api/account/keys (create)", () => {
        test("should create a secret key via session auth", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "test-child-key",
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.id).toBeTruthy();
            expect(data.key).toBeTruthy();
            expect(data.key.startsWith("sk_")).toBe(true);
            expect(data.name).toBe("test-child-key");
            expect(data.type).toBe("secret");
        });

        test("should create a publishable app key with redirect URIs", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "test-pub-key",
                        type: "publishable",
                        redirectUris: ["https://cli.example/callback"],
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.key.startsWith("pk_")).toBe(true);
            expect(data.type).toBe("publishable");
            expect(data.metadata.redirectUris).toEqual([
                "https://cli.example/callback",
            ]);
            expect(data.metadata.earningsEnabled).toBe(false);
        });

        test("should create a publishable app key with earnings disabled", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "test-pub-key-no-earnings",
                        type: "publishable",
                        redirectUris: ["https://cli-disabled.example/callback"],
                        earningsEnabled: false,
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.key.startsWith("pk_")).toBe(true);
            expect(data.type).toBe("publishable");
            expect(data.metadata.redirectUris).toEqual([
                "https://cli-disabled.example/callback",
            ]);
            expect(data.metadata.earningsEnabled).toBe(false);
        });

        test("should create key with permissions and budget", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "restricted-child",
                        allowedModels: ["flux", "openai"],
                        pollenBudget: 50,
                        accountPermissions: ["profile", "usage"],
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.permissions).toEqual({
                models: ["flux", "openai"],
                account: ["profile", "usage"],
            });
            expect(data.pollenBudget).toBe(50);
        });

        test("should strip 'keys' from child account permissions", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "escalation-attempt",
                        accountPermissions: ["profile", "keys", "usage"],
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            // "keys" should be stripped
            expect(data.permissions.account).toEqual(["profile", "usage"]);
            expect(data.permissions.account).not.toContain("keys");
        });

        test("should create key via API key with account:keys permission", async ({
            auth,
            sessionToken,
        }) => {
            // First create a key with account:keys permission via session
            const createParent = await auth.apiKey.create({
                name: "parent-key",
                prefix: "sk",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            if (!createParent.data)
                throw new Error("Failed to create parent key");

            // Set account:keys permission via the update endpoint
            const updateResp = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${createParent.data.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        accountPermissions: ["keys"],
                    }),
                },
            );
            expect(updateResp.status).toBe(200);

            // Now use the parent key to create a child key
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${createParent.data.key}`,
                    },
                    body: JSON.stringify({
                        name: "child-from-api",
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.key.startsWith("sk_")).toBe(true);
            expect(data.name).toBe("child-from-api");
        });

        test("should reject API key without account:keys permission", async ({
            apiKey,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        name: "should-fail",
                    }),
                },
            );

            expect(response.status).toBe(403);
        });

        test("should reject publishable key even with keys permission", async ({
            auth,
            sessionToken,
        }) => {
            // Create a publishable key
            const createPub = await auth.apiKey.create({
                name: "pub-with-keys-perm",
                prefix: "pk",
                metadata: { keyType: "publishable" },
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            if (!createPub.data) throw new Error("Failed to create pk key");

            // Set account:keys permission
            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${createPub.data.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        accountPermissions: ["keys"],
                    }),
                },
            );

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${createPub.data.key}`,
                    },
                    body: JSON.stringify({ name: "should-fail" }),
                },
            );

            expect(response.status).toBe(403);
        });
    });

    describe("GET /api/account/keys (list)", () => {
        test("should list keys via session auth", async ({
            sessionToken,
            apiKey,
        }) => {
            expect(apiKey).toBeTruthy(); // ensure at least one key exists

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThanOrEqual(1);

            // Keys should not contain the full secret
            for (const key of data.data) {
                expect(key).toHaveProperty("id");
                expect(key).toHaveProperty("name");
                expect(key).toHaveProperty("start");
                expect(key).not.toHaveProperty("key");
            }
        });

        test("should reject API key without account:keys permission", async ({
            apiKey,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(403);
        });
    });

    describe("DELETE /api/account/keys/:id (revoke)", () => {
        test("should revoke a key via session auth", async ({
            auth,
            sessionToken,
        }) => {
            // Create a key to revoke
            const createResp = await auth.apiKey.create({
                name: "to-be-revoked",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            if (!createResp.data) throw new Error("Failed to create key");
            const keyId = createResp.data.id;

            const response = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "DELETE",
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.success).toBe(true);

            // Verify the key no longer works
            const verifyResp = await SELF.fetch(
                "http://localhost:3000/api/account/key",
                {
                    headers: {
                        Authorization: `Bearer ${createResp.data.key}`,
                    },
                },
            );
            expect(verifyResp.status).toBe(401);
        });

        test("should prevent self-revocation via API key", async ({
            auth,
            sessionToken,
        }) => {
            // Create a key with account:keys permission
            const createResp = await auth.apiKey.create({
                name: "self-revoke-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            if (!createResp.data) throw new Error("Failed to create key");

            // Grant account:keys permission
            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${createResp.data.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        accountPermissions: ["keys"],
                    }),
                },
            );

            // Try to revoke itself
            const response = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${createResp.data.id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${createResp.data.key}`,
                    },
                },
            );

            expect(response.status).toBe(400);
        });

        test("should return 404 for non-existent key", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys/nonexistent-id",
                {
                    method: "DELETE",
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            expect(response.status).toBe(404);
        });
    });
});
