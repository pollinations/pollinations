import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { createApiKeyViaApi, test } from "../fixtures.ts";

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

        test("should create a publishable app key with earnings off by default", async ({
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

        test("should reject unsafe publishable app redirect URIs", async ({
            sessionToken,
        }) => {
            for (const redirectUri of [
                "javascript://x/%0afetch('https://example.com')//",
                "data://x/text/html,<script>alert(1)</script>",
                "file://localhost/tmp/callback",
                "http://app.example/callback",
            ]) {
                const response = await SELF.fetch(
                    "http://localhost:3000/api/account/keys",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Cookie: `better-auth.session_token=${sessionToken}`,
                        },
                        body: JSON.stringify({
                            name: "unsafe-pub-key",
                            type: "publishable",
                            redirectUris: [redirectUri],
                        }),
                    },
                );

                expect(response.status).toBe(400);
            }
        });

        test("should create a publishable app key with earnings enabled", async ({
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
                        name: "test-pub-key-earnings",
                        type: "publishable",
                        redirectUris: ["https://cli-earnings.example/callback"],
                        earningsEnabled: true,
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.key.startsWith("pk_")).toBe(true);
            expect(data.type).toBe("publishable");
            expect(data.metadata.redirectUris).toEqual([
                "https://cli-earnings.example/callback",
            ]);
            expect(data.metadata.earningsEnabled).toBe(true);
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
                        allowedModels: [
                            "black-forest-labs/flux.1-schnell",
                            "openai/gpt-5.4-nano",
                        ],
                        pollenBudget: 50,
                        accountPermissions: ["profile", "usage"],
                    }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.permissions).toEqual({
                models: [
                    "black-forest-labs/flux.1-schnell",
                    "openai/gpt-5.4-nano",
                ],
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
            sessionToken,
        }) => {
            // First create a key with account:keys permission via session
            const parentKey = await createApiKeyViaApi(sessionToken, {
                name: "parent-key",
            });

            // Set account:keys permission via the update endpoint
            const updateResp = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${parentKey.id}/update`,
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
                        Authorization: `Bearer ${parentKey.key}`,
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

        test("should create key via publishable API key with account:keys permission", async ({
            sessionToken,
        }) => {
            const createPub = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "pub-with-keys-perm",
                        type: "publishable",
                    }),
                },
            );
            expect(createPub.status).toBe(200);
            const createdPub = (await createPub.json()) as {
                id: string;
                key: string;
            };
            expect(createdPub.key.startsWith("pk_")).toBe(true);

            // Set account:keys permission
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${createdPub.id}/update`,
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
            expect(updateResponse.status).toBe(200);

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${createdPub.key}`,
                    },
                    body: JSON.stringify({ name: "child-from-publishable" }),
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.key.startsWith("sk_")).toBe(true);
            expect(data.name).toBe("child-from-publishable");
            expect(data.permissions?.account ?? []).not.toContain("keys");
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

        test("should omit retired models from listed permissions", async ({
            sessionToken,
        }) => {
            const createResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "account-key-with-retired-model",
                        allowedModels: [
                            "black-forest-labs/flux.1-schnell",
                            "retired-model",
                        ],
                    }),
                },
            );
            expect(createResponse.status).toBe(200);
            const created = await createResponse.json();

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            const body = await response.json();
            const listed = body.data.find(
                (key: { id: string }) => key.id === created.id,
            );
            expect(listed.permissions.models).toEqual([
                "black-forest-labs/flux.1-schnell",
            ]);
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
            sessionToken,
        }) => {
            // Create a key to revoke
            const created = await createApiKeyViaApi(sessionToken, {
                name: "to-be-revoked",
            });

            const response = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${created.id}`,
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
                        Authorization: `Bearer ${created.key}`,
                    },
                },
            );
            expect(verifyResp.status).toBe(401);
        });

        test("should prevent self-revocation via API key", async ({
            sessionToken,
        }) => {
            // Create a key with account:keys permission
            const created = await createApiKeyViaApi(sessionToken, {
                name: "self-revoke-test",
            });

            // Grant account:keys permission
            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${created.id}/update`,
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
                `http://localhost:3000/api/account/keys/${created.id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${created.key}`,
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
