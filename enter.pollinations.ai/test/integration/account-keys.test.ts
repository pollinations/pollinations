import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { createApiKeyViaApi, test } from "../fixtures.ts";

describe("Account Key Management API", () => {
    describe("POST /api/account/keys (create)", () => {
        test("should create a secret key via session auth", async ({
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
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
                            Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
                models: ["text", "image"],
                account: ["profile", "usage"],
            });
            expect(data.pollenBudget).toBe(50);
        });

        test("should let a key with account:keys create a child that can create keys", async ({
            accountToken,
        }) => {
            const parentKey = await createApiKeyViaApi(accountToken, {
                name: "machine-parent",
                accountPermissions: ["keys"],
            });

            const createChild = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${parentKey.key}`,
                    },
                    body: JSON.stringify({
                        name: "machine-child",
                        accountPermissions: ["profile", "keys", "usage"],
                    }),
                },
            );

            expect(createChild.status).toBe(200);
            const child = await createChild.json();
            expect(child.permissions.account).toEqual([
                "profile",
                "keys",
                "usage",
            ]);
            expect(child.metadata.createdByApiKeyId).toBe(parentKey.id);

            // The child can mint its own key in turn.
            const createGrandchild = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${child.key}`,
                    },
                    body: JSON.stringify({ name: "harness-grandchild" }),
                },
            );
            expect(createGrandchild.status).toBe(200);
            const grandchild = await createGrandchild.json();
            expect(grandchild.metadata.createdByApiKeyId).toBe(child.id);
            expect(grandchild.key.startsWith("sk_")).toBe(true);
            expect(grandchild.permissions?.account ?? []).not.toContain("keys");
        });

        test("should keep keys created by a Quest Pollen only key Quest Pollen only", async ({
            accountToken,
        }) => {
            const parentKey = await createApiKeyViaApi(accountToken, {
                name: "quest-parent",
                accountPermissions: ["keys"],
                questPollenOnly: true,
            });

            const createChild = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${parentKey.key}`,
                    },
                    body: JSON.stringify({ name: "quest-child" }),
                },
            );
            expect(createChild.status).toBe(200);
            expect((await createChild.json()).questPollenOnly).toBe(true);

            // The key itself can't lift the restriction.
            const selfLift = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${parentKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${parentKey.key}`,
                    },
                    body: JSON.stringify({ questPollenOnly: false }),
                },
            );
            expect(selfLift.status).toBe(403);

            // The owner can lift the restriction from the dashboard.
            const update = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${parentKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({ questPollenOnly: false }),
                },
            );
            expect(update.status).toBe(200);
            expect((await update.json()).questPollenOnly).toBe(false);
        });

        test("should create key via API key with account:keys permission", async ({
            accountToken,
        }) => {
            // First create a key with account:keys permission via session
            const parentKey = await createApiKeyViaApi(accountToken, {
                name: "parent-key",
            });

            // Set account:keys permission via the update endpoint
            const updateResp = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${parentKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            const createPub = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
                `http://localhost:3000/api/account/keys/${createdPub.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
            apiKey,
        }) => {
            expect(apiKey).toBeTruthy(); // ensure at least one key exists

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            const createPub = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
                `http://localhost:3000/api/account/keys/${createdPub.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
            apiKey,
        }) => {
            expect(apiKey).toBeTruthy(); // ensure at least one key exists

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            // Create a key to revoke
            const created = await createApiKeyViaApi(accountToken, {
                name: "to-be-revoked",
            });

            const response = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${created.id}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            // Create a key with account:keys permission
            const created = await createApiKeyViaApi(accountToken, {
                name: "self-revoke-test",
            });

            // Grant account:keys permission
            await SELF.fetch(
                `http://localhost:3000/api/account/keys/${created.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys/nonexistent-id",
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );

            expect(response.status).toBe(404);
        });
    });
});
