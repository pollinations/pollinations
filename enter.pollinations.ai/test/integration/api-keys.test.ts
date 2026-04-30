import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("API Key Management", () => {
    describe("POST /api/api-keys", () => {
        test("should create publishable key metadata in one step", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "one-step-publishable",
                        type: "publishable",
                        metadata: {
                            description: "created in one step",
                            appUrl: "https://one-step.example/callback",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.key.startsWith("pk_")).toBe(true);
            expect(created.metadata).toMatchObject({
                keyType: "publishable",
                description: "created in one step",
                appUrl: "https://one-step.example/callback",
                plaintextKey: created.key,
            });
        });

        test("should accept loopback appUrl as opaque metadata", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "localhost-publishable",
                        type: "publishable",
                        metadata: {
                            appUrl: "http://localhost:3456/callback",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.appUrl).toBe(
                "http://localhost:3456/callback",
            );
        });

        test("rejects spoofed keyType / createdVia / plaintextKey from caller metadata", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "spoof-attempt",
                        type: "publishable",
                        accountPermissions: ["keys"],
                        metadata: {
                            keyType: "secret",
                            createdVia: "forged",
                            plaintextKey: "sk_forged",
                            appUrl: "https://legit.example/callback",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.key.startsWith("pk_")).toBe(true);
            expect(created.metadata.keyType).toBe("publishable");
            expect(created.metadata.createdVia).toBe("dashboard");
            expect(created.metadata.plaintextKey).toBe(created.key);
            expect(created.metadata.appUrl).toBe(
                "https://legit.example/callback",
            );
        });
    });

    describe("GET /api/api-keys", () => {
        test("should list all API keys for authenticated user", async ({
            sessionToken,
            apiKey,
            pubApiKey,
            restrictedApiKey,
        }) => {
            // Ensure we have created some test keys first
            expect(apiKey).toBeTruthy();
            expect(pubApiKey).toBeTruthy();
            expect(restrictedApiKey).toBeTruthy();

            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data.data).toBeInstanceOf(Array);
            expect(data.data.length).toBeGreaterThanOrEqual(3);

            // Check that keys have expected properties
            for (const key of data.data) {
                expect(key).toHaveProperty("id");
                expect(key).toHaveProperty("name");
                expect(key).toHaveProperty("start");
                expect(key).toHaveProperty("createdAt");
                expect(key).toHaveProperty("pollenBalance");
            }

            // Find the restricted key and verify its permissions
            const restrictedKey = data.data.find(
                (k: any) => k.name === "restricted-test-key",
            );
            expect(restrictedKey).toBeTruthy();
            expect(restrictedKey.permissions).toEqual({
                models: ["openai-fast", "flux"],
            });
        });

        test("should disable caching for authenticated key lists", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            expect(response.headers.get("cache-control")).toBe(
                "private, no-store, max-age=0",
            );
            expect(response.headers.get("pragma")).toBe("no-cache");
        });

        test("should require authentication", async () => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
            );
            expect(response.status).toBe(401);
        });

        test("should not allow API key authentication", async ({ apiKey }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            );
            expect(response.status).toBe(401);
        });
    });

    describe("POST /api/api-keys/:id/update", () => {
        test("should update API key name", async ({ auth, sessionToken }) => {
            // Create a new key for this test
            const createResponse = await auth.apiKey.create({
                name: "original-name",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            expect(createResponse.data).toBeTruthy();
            const keyId = createResponse.data!.id;

            // Update the name
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "updated-name",
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);
            const result = await updateResponse.json();
            expect(result.name).toBe("updated-name");

            // Verify the change persisted
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResponse.json();
            const updatedKey = keys.data.find((k: any) => k.id === keyId);
            expect(updatedKey.name).toBe("updated-name");
        });

        test("should update API key permissions", async ({
            auth,
            sessionToken,
        }) => {
            // Create a new key
            const createResponse = await auth.apiKey.create({
                name: "permissions-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;

            // Update with model restrictions
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["flux", "openai"],
                        accountPermissions: ["profile", "usage"],
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);
            const result = await updateResponse.json();
            expect(result.permissions).toContain("models");

            // Verify permissions in list
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResponse.json();
            const updatedKey = keys.data.find((k: any) => k.id === keyId);
            expect(updatedKey.permissions).toEqual({
                models: ["flux", "openai"],
                account: ["profile", "usage"],
            });
        });

        test("should reflect updated permissions immediately after update", async ({
            auth,
            sessionToken,
        }) => {
            const createResponse = await auth.apiKey.create({
                name: "permissions-freshness-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const createdKey = createResponse.data;
            expect(createdKey).toBeTruthy();
            if (!createdKey) {
                throw new Error("Failed to create API key");
            }

            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${createdKey.id}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["flux"],
                    }),
                },
            );
            expect(updateResponse.status).toBe(200);

            const accountKeyResponse = await SELF.fetch(
                "http://localhost:3000/api/account/key",
                {
                    headers: {
                        Authorization: `Bearer ${createdKey.key}`,
                    },
                },
            );

            expect(accountKeyResponse.status).toBe(200);
            const keyInfo = (await accountKeyResponse.json()) as {
                permissions?: { models?: string[] };
            };
            expect(keyInfo.permissions?.models).toEqual(["flux"]);
        });

        test("should reflect updated metadata immediately after update", async ({
            auth,
            sessionToken,
        }) => {
            const createResponse = await auth.apiKey.create({
                name: "metadata-freshness-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const createdKey = createResponse.data;
            expect(createdKey).toBeTruthy();
            if (!createdKey) {
                throw new Error("Failed to create API key");
            }

            const metadataResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${createdKey.id}/metadata`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        appUrl: "https://freshness.example/callback",
                    }),
                },
            );
            expect(metadataResponse.status).toBe(200);
            const updated = await metadataResponse.json();
            expect(updated.metadata.appUrl).toBe(
                "https://freshness.example/callback",
            );

            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            expect(listResponse.status).toBe(200);
            const list = (await listResponse.json()) as {
                data: { id: string; metadata?: { appUrl?: string } }[];
            };
            const refreshed = list.data.find((k) => k.id === createdKey.id);
            expect(refreshed?.metadata?.appUrl).toBe(
                "https://freshness.example/callback",
            );
        });

        test("should update pollen budget", async ({ auth, sessionToken }) => {
            // Create a new key
            const createResponse = await auth.apiKey.create({
                name: "budget-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;

            // Set budget to 50
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        pollenBudget: 50,
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);
            const result = await updateResponse.json();
            expect(result.pollenBalance).toBe(50);

            // Verify in list
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResponse.json();
            const updatedKey = keys.data.find((k: any) => k.id === keyId);
            expect(updatedKey.pollenBalance).toBe(50);
        });

        test("should update expiry date", async ({ auth, sessionToken }) => {
            // Create a new key
            const createResponse = await auth.apiKey.create({
                name: "expiry-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;

            // Set expiry to 30 days from now
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        expiresAt: futureDate.toISOString(),
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);

            // Verify in list
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResponse.json();
            const updatedKey = keys.data.find((k: any) => k.id === keyId);
            expect(updatedKey.expiresAt).toBeTruthy();

            // Check the date is approximately correct (within 1 minute)
            const expiryTime = new Date(updatedKey.expiresAt).getTime();
            const expectedTime = futureDate.getTime();
            expect(Math.abs(expiryTime - expectedTime)).toBeLessThan(60000);
        });

        test("should clear permissions when set to null", async ({
            auth,
            sessionToken,
        }) => {
            // Create a key with permissions
            const createResponse = await auth.apiKey.create({
                name: "clear-permissions-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;

            // First set some permissions
            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["flux"],
                        accountPermissions: ["usage"],
                    }),
                },
            );

            // Then clear them
            const clearResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: null,
                        accountPermissions: null,
                    }),
                },
            );

            expect(clearResponse.status).toBe(200);

            // Verify permissions are cleared
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResponse.json();
            const updatedKey = keys.data.find((k: any) => k.id === keyId);
            expect(updatedKey.permissions).toBeNull();
        });

        test("should return 404 for non-existent key", async ({
            sessionToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/api-keys/non-existent-id/update",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "new-name",
                    }),
                },
            );

            expect(response.status).toBe(404);
        });

        test("should not allow updating another user's key", async ({
            auth,
            sessionToken,
        }) => {
            // This test would need a second user session to be comprehensive
            // For now, we'll just verify authentication is required
            const createResponse = await auth.apiKey.create({
                name: "ownership-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;

            // Try updating without authentication
            const response = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name: "hacked-name",
                    }),
                },
            );

            expect(response.status).toBe(401);
        });

        test("should handle multiple updates in sequence", async ({
            auth,
            sessionToken,
        }) => {
            // Create a key
            const createResponse = await auth.apiKey.create({
                name: "multi-update-test",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;

            // Update 1: Set name and budget
            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "step-1",
                        pollenBudget: 25,
                    }),
                },
            );

            // Update 2: Add permissions
            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["openai"],
                    }),
                },
            );

            // Update 3: Change name and expiry
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 7);

            await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        name: "final-name",
                        expiresAt: expiryDate.toISOString(),
                    }),
                },
            );

            // Verify all changes persisted
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResponse.json();
            const finalKey = keys.data.find((k: any) => k.id === keyId);

            expect(finalKey.name).toBe("final-name");
            expect(finalKey.pollenBalance).toBe(25);
            expect(finalKey.permissions.models).toEqual(["openai"]);
            expect(finalKey.expiresAt).toBeTruthy();
        });
    });

    describe("Permission enforcement", () => {
        test("should reject expired keys", async ({ auth, sessionToken }) => {
            // Create a key that expires immediately
            const createResponse = await auth.apiKey.create({
                name: "expired-key",
                fetchOptions: {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            });
            const keyId = createResponse.data!.id;
            const apiKey = createResponse.data!.key;

            // Set expiry to past
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            const updateResp = await SELF.fetch(
                `http://localhost:3000/api/api-keys/${keyId}/update`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                    body: JSON.stringify({
                        expiresAt: pastDate.toISOString(),
                    }),
                },
            );
            expect(updateResp.status).toBe(200);
            await updateResp.json();

            // Verify the key was updated with expiry
            const listResp = await SELF.fetch(
                "http://localhost:3000/api/api-keys",
                {
                    headers: {
                        Cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keys = await listResp.json();
            const updatedKey = keys.data.find((k: any) => k.id === keyId);
            expect(updatedKey).toBeTruthy();
            expect(updatedKey.expiresAt).toBeTruthy();

            // Try to inspect the expired key via an enter-owned API key route.
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/key",
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(401);
        });
    });
});
