import { env, SELF } from "cloudflare:test";
import {
    communityModelId,
    legacyCommunityModelId,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { createApiKeyViaApi, test } from "../fixtures.ts";

type ListedApiKey = {
    id: string;
    name?: string;
    start?: string;
    createdAt?: string;
    pollenBalance?: number | null;
    permissions?: Record<string, string[]> | null;
    expiresAt?: string | null;
    metadata?: { redirectUris?: string[] };
};

type ApiKeyListResponse = {
    data: ListedApiKey[];
};

describe("API Key Management", () => {
    describe("POST /api/account/keys", () => {
        test("allows an expiry beyond one year", async ({ accountToken }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "long-lived-key",
                        expiresIn: 366 * 86400,
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(
                Date.now() + 365 * 86400 * 1000,
            );
        });

        test("preserves Generate off through creation, listing, authentication and editing", async ({
            accountToken,
        }) => {
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            };
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        name: "account-only",
                        type: "secret",
                        allowedModels: [],
                        accountPermissions: ["profile"],
                    }),
                },
            );
            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.permissions).toEqual({
                models: [],
                account: ["profile"],
            });

            const list = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                { headers },
            );
            expect(list.status).toBe(200);
            const listed = (await list.json()) as ApiKeyListResponse;
            expect(
                listed.data.find((key) => key.id === created.id)?.permissions,
            ).toEqual({ models: [], account: ["profile"] });

            const update = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${created.id}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        allowedModels: [],
                        accountPermissions: ["profile"],
                        pollenBudget: 10,
                    }),
                },
            );
            expect(update.status).toBe(200);
            const readback = await SELF.fetch(
                "http://localhost:3000/api/account/key",
                {
                    headers: { Authorization: `Bearer ${created.key}` },
                },
            );
            expect(readback.status).toBe(200);
            const info = await readback.json();
            expect(info.permissions).toEqual({
                models: [],
                account: ["profile"],
            });
        });

        test("forces publishable keys to zero direct-spend budget", async ({
            accountToken,
        }) => {
            for (const pollenBudget of [undefined, null, 0]) {
                const response = await SELF.fetch(
                    "http://localhost:3000/api/account/keys",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${accountToken}`,
                        },
                        body: JSON.stringify({
                            name: `forced-zero-publishable-${String(pollenBudget)}`,
                            type: "publishable",
                            pollenBudget,
                            redirectUris: [
                                "https://zero-budget.example/callback",
                            ],
                        }),
                    },
                );

                expect(response.status).toBe(200);
                const created = await response.json();
                expect(created.pollenBudget).toBe(0);

                const db = drizzle(env.DB, { schema });
                const stored = await db.query.apikey.findFirst({
                    where: (apikey, { eq }) => eq(apikey.id, created.id),
                });
                expect(stored?.pollenBalance).toBe(0);
            }
        });

        test("rejects non-zero publishable-key budgets", async ({
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
                        name: "invalid-budget-publishable",
                        type: "publishable",
                        pollenBudget: 5,
                    }),
                },
            );

            expect(response.status).toBe(400);
            await expect(response.json()).resolves.toMatchObject({
                error: {
                    message: "Publishable keys must have a pollen budget of 0",
                },
            });
        });

        test("should create publishable key metadata in one step", async ({
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
                        name: "one-step-publishable",
                        type: "publishable",
                        description: "created in one step",
                        redirectUris: ["https://one-step.example/callback"],
                        earningsEnabled: true,
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.key.startsWith("pk_")).toBe(true);
            expect(created.metadata).toMatchObject({
                keyType: "publishable",
                description: "created in one step",
                redirectUris: ["https://one-step.example/callback"],
                earningsEnabled: true,
                plaintextKey: created.key,
            });
        });

        test("allows reward-enabled app keys", async ({ accountToken }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "wallet-reward-publishable",
                        type: "publishable",
                        redirectUris: [
                            "https://wallet-rewards.example/callback",
                        ],
                        earningsEnabled: true,
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.earningsEnabled).toBe(true);
        });

        test("should accept loopback redirectUris metadata with earnings off by default", async ({
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
                        name: "localhost-publishable",
                        type: "publishable",
                        redirectUris: ["http://localhost:3456/callback"],
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.redirectUris).toEqual([
                "http://localhost:3456/callback",
            ]);
            expect(created.metadata.earningsEnabled).toBe(false);
        });

        test("rejects unsafe redirectUris metadata during app key creation", async ({
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
                            name: "unsafe-publishable",
                            type: "publishable",
                            redirectUris: [redirectUri],
                        }),
                    },
                );

                expect(response.status).toBe(400);
            }
        });

        test("blocks every native Better Auth api-key route", async ({
            accountToken,
        }) => {
            // Keys are managed only through /api/account/keys, which validates
            // redirect URIs and strips server-only metadata. The native routes store
            // caller metadata verbatim, so none of them may be reachable over HTTP.
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            };
            const unsafeMetadata = {
                redirectUris: [
                    "javascript://x/%0afetch('https://example.com')//",
                ],
            };
            const nativeCreate = await SELF.fetch(
                "http://localhost:3000/api/auth/api-key/create",
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        name: "native-redirect-bypass",
                        prefix: "pk",
                        metadata: unsafeMetadata,
                    }),
                },
            );
            expect(nativeCreate.status).toBe(405);

            // The safe route still works and validates the scheme.
            const safeCreate = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        name: "safe-publishable",
                        type: "publishable",
                        redirectUris: ["https://safe.example/callback"],
                    }),
                },
            );
            expect(safeCreate.status).toBe(200);
            const created = await safeCreate.json();

            const nativeCalls: [string, string, unknown?][] = [
                [
                    "POST",
                    "update",
                    { keyId: created.id, metadata: unsafeMetadata },
                ],
                ["POST", "delete", { keyId: created.id }],
                ["GET", "list"],
                ["GET", `get?id=${created.id}`],
                ["POST", "verify", { key: created.key }],
            ];
            for (const [method, path, body] of nativeCalls) {
                const response = await SELF.fetch(
                    `http://localhost:3000/api/auth/api-key/${path}`,
                    {
                        method,
                        headers,
                        ...(body !== undefined && {
                            body: JSON.stringify(body),
                        }),
                    },
                );
                expect(response.status, `${method} ${path}`).toBe(405);
            }

            // The blocked native delete and update left the key untouched.
            const list = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                { headers },
            );
            expect(list.status).toBe(200);
            const listed = (await list.json()) as ApiKeyListResponse;
            expect(
                listed.data.find((key) => key.id === created.id)?.metadata
                    ?.redirectUris,
            ).toEqual(["https://safe.example/callback"]);
        });

        test("rejects spoofed keyType / createdVia / plaintextKey from caller metadata", async ({
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
                        name: "spoof-attempt",
                        type: "publishable",
                        accountPermissions: ["keys"],
                        redirectUris: ["https://legit.example/callback"],
                        keyType: "secret",
                        createdVia: "forged",
                        plaintextKey: "sk_forged",
                        metadata: {
                            keyType: "secret",
                            createdVia: "forged",
                            plaintextKey: "sk_forged",
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
            expect(created.metadata.redirectUris).toEqual([
                "https://legit.example/callback",
            ]);
        });

        test("allows unbranded redirect-auth key creation without client_id", async ({
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
                        name: "unbranded-redirect-auth",
                        type: "secret",
                        consent: {
                            redirectUri: "https://solo.example/callback",
                            redirectOrigin: "https://solo.example",
                            createdForUserId: "spoofed-user",
                            createdForApp: "spoofed-app",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.redirectOrigin).toBe(
                "https://solo.example",
            );
            expect(created.metadata.createdVia).toBe("redirect-auth");
            expect(created.metadata.clientId).toBeUndefined();
            expect(created.metadata.createdForUserId).toBeUndefined();
            expect(created.metadata.createdForApp).toBeUndefined();

            const db = drizzle(env.DB, { schema });
            await expect
                .poll(async () => {
                    const reward = await db.query.rewards.findFirst({
                        where: (rewards, { eq }) =>
                            eq(rewards.questId, "first_api_key"),
                    });
                    return Boolean(reward?.claimedAt);
                })
                .toBe(true);
        });

        test("rejects redirect-auth key creation when client_id redirect_uri mismatches", async ({
            accountToken,
        }) => {
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "registered-app",
                        type: "publishable",
                        redirectUris: ["https://legit.example/callback"],
                        earningsEnabled: true,
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "forged-redirect-auth",
                        type: "secret",
                        consent: {
                            requestedClientId: appKey.key,
                            redirectUri: "https://attacker.example/callback",
                            redirectOrigin: "https://attacker.example",
                        },
                    }),
                },
            );

            expect(response.status).toBe(400);

            const storedOnlyResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "client-id-without-requested-client-id",
                        type: "secret",
                        consent: {
                            clientId: appKey.id,
                            redirectUri: "https://legit.example/callback",
                            redirectOrigin: "https://legit.example",
                        },
                    }),
                },
            );

            // A caller-supplied stored clientId is stripped by the schema, so
            // the key is created without any app attribution.
            expect(storedOnlyResponse.status).toBe(200);
            const storedOnlyCreated = await storedOnlyResponse.json();
            expect(storedOnlyCreated.metadata.clientId).toBeUndefined();
            expect(storedOnlyCreated.byopClientKeyId).toBeNull();

            const matchingResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "valid-redirect-auth",
                        type: "secret",
                        consent: {
                            requestedClientId: appKey.key,
                            createdForUserId: "spoofed-user",
                            createdForApp: "spoofed-app",
                            redirectUri: "https://legit.example/callback",
                            redirectOrigin: "https://legit.example",
                        },
                    }),
                },
            );

            expect(matchingResponse.status).toBe(200);
            const matchingCreated = await matchingResponse.json();
            expect(matchingCreated.metadata.createdVia).toBe("redirect-auth");
            expect(matchingCreated.metadata.clientId).toBeUndefined();
            expect(matchingCreated.metadata.createdForApp).toBeUndefined();
            expect(matchingCreated.metadata.createdForUserId).toBeUndefined();
            expect(matchingCreated.byopClientKeyId).toBe(appKey.id);
        });

        test("stores app attribution even when rewards are currently disabled", async ({
            accountToken,
        }) => {
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "disabled-reward-app",
                        type: "publishable",
                        redirectUris: [
                            "https://disabled-reward.example/callback",
                        ],
                        earningsEnabled: false,
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "disabled-reward-attributed-secret",
                        type: "secret",
                        consent: {
                            requestedClientId: appKey.key,
                            redirectUri:
                                "https://disabled-reward.example/callback",
                            redirectOrigin: "https://disabled-reward.example",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.clientId).toBeUndefined();
            expect(created.byopClientKeyId).toBe(appKey.id);
        });

        test("allows device-flow attribution without redirect_uri when client_id matches the device code", async ({
            accountToken,
        }) => {
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "device-registered-app",
                        type: "publishable",
                        redirectUris: ["https://device.example/callback"],
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();
            const db = drizzle(env.DB, { schema });
            const userCode = crypto
                .randomUUID()
                .replace(/-/g, "")
                .slice(0, 8)
                .toUpperCase();
            await db.insert(schema.deviceCode).values({
                id: crypto.randomUUID(),
                deviceCode: crypto.randomUUID(),
                userCode,
                status: "pending",
                expiresAt: new Date(Date.now() + 600_000),
                clientId: appKey.key,
                scope: "generate",
            });

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "device-auth-key",
                        type: "secret",
                        consent: {
                            deviceUserCode: userCode,
                            requestedClientId: appKey.key,
                            createdForUserId: "spoofed-user",
                            createdForApp: "spoofed-device-app",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.createdVia).toBe("redirect-auth");
            expect(created.metadata.deviceUserCode).toBe(userCode);
            expect(created.metadata.clientId).toBeUndefined();
            expect(created.metadata.createdForApp).toBeUndefined();
            expect(created.metadata.createdForUserId).toBeUndefined();
            expect(created.byopClientKeyId).toBe(appKey.id);
        });

        test("allows unbranded device-flow key creation without caller attribution", async ({
            accountToken,
        }) => {
            const db = drizzle(env.DB, { schema });
            const userCode = crypto
                .randomUUID()
                .replace(/-/g, "")
                .slice(0, 8)
                .toUpperCase();
            await db.insert(schema.deviceCode).values({
                id: crypto.randomUUID(),
                deviceCode: crypto.randomUUID(),
                userCode,
                status: "pending",
                expiresAt: new Date(Date.now() + 600_000),
                clientId: null,
                scope: "generate",
            });

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "unbranded-device-auth-key",
                        type: "secret",
                        consent: {
                            deviceUserCode: userCode,
                            createdForUserId: "victim-user",
                            createdForApp: "spoofed-device-app",
                        },
                    }),
                },
            );

            expect(response.status).toBe(200);
            const created = await response.json();
            expect(created.metadata.createdVia).toBe("redirect-auth");
            expect(created.metadata.deviceUserCode).toBe(userCode);
            expect(created.metadata.clientId).toBeUndefined();
            expect(created.metadata.createdForUserId).toBeUndefined();
            expect(created.metadata.createdForApp).toBeUndefined();
        });

        test("rejects forged device-flow attribution when client_id does not match the device code", async ({
            accountToken,
        }) => {
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "victim-device-app",
                        type: "publishable",
                        redirectUris: ["https://device.example/callback"],
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();
            const db = drizzle(env.DB, { schema });
            const userCode = crypto
                .randomUUID()
                .replace(/-/g, "")
                .slice(0, 8)
                .toUpperCase();
            await db.insert(schema.deviceCode).values({
                id: crypto.randomUUID(),
                deviceCode: crypto.randomUUID(),
                userCode,
                status: "pending",
                expiresAt: new Date(Date.now() + 600_000),
                clientId: "pk_attacker",
                scope: "generate",
            });

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "forged-device-auth-key",
                        type: "secret",
                        consent: {
                            deviceUserCode: userCode,
                            requestedClientId: appKey.key,
                            createdForApp: "victim-device-app",
                        },
                    }),
                },
            );

            expect(response.status).toBe(400);
        });
    });

    describe("GET /api/app-lookup", () => {
        test("blocks redirect lookup when publishable key has no redirectUris", async ({
            accountToken,
        }) => {
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "generic-publishable",
                        type: "publishable",
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();

            const deviceStyleLookup = await SELF.fetch(
                `http://localhost:3000/api/app-lookup?client_id=${encodeURIComponent(appKey.key)}`,
            );
            expect(deviceStyleLookup.status).toBe(200);
            expect(await deviceStyleLookup.json()).toMatchObject({
                found: true,
            });

            const redirectLookup = await SELF.fetch(
                `http://localhost:3000/api/app-lookup?client_id=${encodeURIComponent(appKey.key)}&redirect_uri=${encodeURIComponent("https://any.example/callback")}`,
            );
            expect(redirectLookup.status).toBe(200);
            expect(await redirectLookup.json()).toMatchObject({
                found: false,
                error: "redirect_uri_mismatch",
            });
        });

        test("ignores query string differences but rejects path mismatches", async ({
            accountToken,
        }) => {
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "query-bound-app",
                        type: "publishable",
                        redirectUris: ["https://app.example/callback"],
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();

            // Extra query params on the incoming URL are allowed — apps
            // round-trip state (e.g. ?prompt=, ?next=) through the redirect.
            const withQuery = await SELF.fetch(
                `http://localhost:3000/api/app-lookup?client_id=${encodeURIComponent(appKey.key)}&redirect_uri=${encodeURIComponent("https://app.example/callback?prompt=hi&model=x")}`,
            );
            expect(withQuery.status).toBe(200);
            expect(await withQuery.json()).toMatchObject({ found: true });

            // Trailing slash on path is also insignificant.
            const trailingSlash = await SELF.fetch(
                `http://localhost:3000/api/app-lookup?client_id=${encodeURIComponent(appKey.key)}&redirect_uri=${encodeURIComponent("https://app.example/callback/")}`,
            );
            expect(trailingSlash.status).toBe(200);
            expect(await trailingSlash.json()).toMatchObject({ found: true });

            // But a different path still mismatches.
            const wrongPath = await SELF.fetch(
                `http://localhost:3000/api/app-lookup?client_id=${encodeURIComponent(appKey.key)}&redirect_uri=${encodeURIComponent("https://app.example/other")}`,
            );
            expect(wrongPath.status).toBe(200);
            expect(await wrongPath.json()).toMatchObject({
                found: false,
                error: "redirect_uri_mismatch",
            });
        });

        test("createApiKey enforces same flexible redirect_uri rules", async ({
            accountToken,
        }) => {
            // Mint a publishable key with one registered URI.
            const appResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "minting-app",
                        type: "publishable",
                        redirectUris: ["https://mint.example/cb"],
                    }),
                },
            );
            expect(appResponse.status).toBe(200);
            const appKey = await appResponse.json();

            // sk_ minting must accept query + trailing slash on the redirect
            // (matches what /authorize forwards from a browser address bar).
            const mint = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "minted-sk",
                        type: "secret",
                        consent: {
                            requestedClientId: appKey.key,
                            redirectUri:
                                "https://mint.example/cb/?prompt=hi&model=x",
                        },
                    }),
                },
            );
            expect(mint.status).toBe(200);

            // But mismatching host still fails.
            const evil = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "evil-sk",
                        type: "secret",
                        consent: {
                            requestedClientId: appKey.key,
                            redirectUri: "https://attacker.example/cb",
                        },
                    }),
                },
            );
            expect(evil.status).toBe(400);
        });
    });

    describe("GET /api/account/keys", () => {
        test("should list all API keys for authenticated user", async ({
            accountToken,
            apiKey,
            pubApiKey,
            restrictedApiKey,
        }) => {
            // Ensure we have created some test keys first
            expect(apiKey).toBeTruthy();
            expect(pubApiKey).toBeTruthy();
            expect(restrictedApiKey).toBeTruthy();

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            const data = (await response.json()) as ApiKeyListResponse;
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
                (k) => k.name === "restricted-test-key",
            );
            expect(restrictedKey).toBeTruthy();
            expect(restrictedKey.permissions).toEqual({
                models: ["text", "image"],
            });
        });

        test("should disable caching for authenticated key lists", async ({
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );

            expect(response.status).toBe(200);
            expect(response.headers.get("cache-control")).toBe(
                "private, no-store, max-age=0",
            );
            expect(response.headers.get("pragma")).toBe("no-cache");
        });

        test("widens model IDs and aliases to categories and rejects unknown values without changing permissions", async ({
            accountToken,
        }) => {
            const created = await createApiKeyViaApi(accountToken, {
                name: "category-permissions",
                allowedModels: ["flux", "nanobanana2"],
            });
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            };
            for (const model of ["retired-model", "community/nobody/missing"]) {
                for (const [method, path] of [
                    ["POST", "/api/account/keys"],
                    ["PATCH", `/api/account/keys/${created.id}`],
                ]) {
                    const response = await SELF.fetch(
                        `http://localhost:3000${path}`,
                        {
                            method,
                            headers,
                            body: JSON.stringify({
                                name: "invalid-model",
                                type: "secret",
                                allowedModels: [model],
                            }),
                        },
                    );
                    expect(response.status).toBe(400);
                    expect(JSON.stringify(await response.json())).toContain(
                        "is not a model category",
                    );
                }
            }
            const db = drizzle(env.DB, { schema });
            const stored = await db.query.apikey.findFirst({
                where: (apikey, { eq }) => eq(apikey.id, created.id),
            });
            expect(JSON.parse(stored?.permissions ?? "{}").models).toEqual([
                "image",
            ]);
        });

        test("widens community model IDs to their modality's category", async ({
            accountToken,
        }) => {
            const created = await createApiKeyViaApi(accountToken, {
                name: "key-with-community-model",
            });
            const db = drizzle(env.DB, { schema });
            const key = await db.query.apikey.findFirst({
                where: (apikey, { eq }) => eq(apikey.id, created.id),
            });
            const ownerUserId = key?.referenceId as string;
            await db
                .update(schema.user)
                .set({ githubUsername: "model-owner" })
                .where(eq(schema.user.id, ownerUserId));
            await db.insert(schema.communityEndpoint).values({
                id: "owner-private-image-model",
                ownerUserId,
                name: "private-model",
                title: "Owner private image model",
                baseUrl: "https://owner.example.com/v1",
                upstreamModel: "private-model",
                payload: JSON.stringify({
                    bearerTokenCiphertext: "encrypted-token",
                    modality: "image",
                    imagePricing: "request",
                    inputModalities: ["text"],
                    perUserRpm: null,
                    fallbacks: [],
                    prices: {},
                }),
                visibility: "private",
                promptTextPrice: 0,
                completionTextPrice: 0,
            });

            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            };
            for (const model of [
                communityModelId("model-owner", "private-model"),
                legacyCommunityModelId("model-owner", "private-model"),
            ]) {
                const update = await SELF.fetch(
                    `http://localhost:3000/api/account/keys/${created.id}`,
                    {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ allowedModels: [model] }),
                    },
                );
                expect(update.status).toBe(200);
            }

            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                { headers },
            );
            expect(response.status).toBe(200);
            const body = (await response.json()) as ApiKeyListResponse;
            const listed = body.data.find((item) => item.id === created.id);
            expect(listed?.permissions?.models).toEqual(["image"]);
        });

        test("should require authentication", async () => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
            );
            expect(response.status).toBe(401);
        });

        test("should allow API key authentication only with account:keys", async ({
            apiKey,
            accountToken,
        }) => {
            const denied = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                    },
                },
            );
            expect(denied.status).toBe(403);

            const keysKey = await createApiKeyViaApi(accountToken, {
                name: "keys-permission-list",
                accountPermissions: ["keys"],
            });
            const allowed = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${keysKey.key}`,
                    },
                },
            );
            expect(allowed.status).toBe(200);
            const listed = (await allowed.json()) as ApiKeyListResponse;
            expect(listed.data.some((key) => key.id === keysKey.id)).toBe(true);
        });
    });

    describe("PATCH /api/account/keys/:id", () => {
        test("should update API key name", async ({ accountToken }) => {
            // Create a new key for this test
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "original-name",
            });
            const keyId = createdKey.id;

            // Update the name
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResponse.json()) as ApiKeyListResponse;
            const updatedKey = keys.data.find((k) => k.id === keyId);
            expect(updatedKey.name).toBe("updated-name");
        });

        test("should update API key permissions", async ({ accountToken }) => {
            // Create a new key
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "permissions-test",
            });
            const keyId = createdKey.id;

            // Update with model restrictions
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: [
                            "black-forest-labs/flux.1-schnell",
                            "google/gemini-3.1-flash-image",
                            "google/gemini-3.1-flash-image",
                        ],
                        accountPermissions: ["profile", "usage"],
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);
            const result = await updateResponse.json();
            expect(result.permissions).toEqual({
                models: ["image"],
                account: ["profile", "usage"],
            });

            // Verify permissions in list
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResponse.json()) as ApiKeyListResponse;
            const updatedKey = keys.data.find((k) => k.id === keyId);
            expect(updatedKey.permissions).toEqual({
                models: ["image"],
                account: ["profile", "usage"],
            });
        });

        test("should reflect updated permissions immediately after update", async ({
            accountToken,
        }) => {
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "permissions-freshness-test",
            });

            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${createdKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["black-forest-labs/flux.1-schnell"],
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
            expect(keyInfo.permissions?.models).toEqual(["image"]);
        });

        test("should reflect updated metadata immediately after update", async ({
            accountToken,
        }) => {
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "metadata-freshness-test",
            });

            const metadataResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${createdKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        redirectUris: ["https://freshness.example/callback"],
                    }),
                },
            );
            expect(metadataResponse.status).toBe(200);
            const updated = await metadataResponse.json();
            expect(updated.metadata.redirectUris).toEqual([
                "https://freshness.example/callback",
            ]);

            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            expect(listResponse.status).toBe(200);
            const list = (await listResponse.json()) as ApiKeyListResponse;
            const refreshed = list.data.find((k) => k.id === createdKey.id);
            expect(refreshed?.metadata?.redirectUris).toEqual([
                "https://freshness.example/callback",
            ]);
        });

        test("rejects unsafe redirectUris during metadata updates", async ({
            accountToken,
        }) => {
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "metadata-unsafe-redirect-test",
                type: "publishable",
            });

            const metadataResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${createdKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        redirectUris: [
                            "javascript://x/%0afetch('https://example.com')//",
                        ],
                    }),
                },
            );

            expect(metadataResponse.status).toBe(400);
        });

        test("allows enabling rewards from app key metadata", async ({
            accountToken,
        }) => {
            const createResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "metadata-reward-toggle",
                        type: "publishable",
                        redirectUris: [
                            "https://metadata-reward.example/callback",
                        ],
                    }),
                },
            );
            expect(createResponse.status).toBe(200);
            const createdKey = await createResponse.json();

            const metadataResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${createdKey.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({ earningsEnabled: true }),
                },
            );

            expect(metadataResponse.status).toBe(200);
            const updated = await metadataResponse.json();
            expect(updated.metadata.earningsEnabled).toBe(true);
        });

        test("should update pollen budget", async ({ accountToken }) => {
            // Create a new key
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "budget-test",
            });
            const keyId = createdKey.id;
            await drizzle(env.DB)
                .update(schema.apikey)
                .set({
                    permissions: JSON.stringify({ models: ["image"] }),
                })
                .where(eq(schema.apikey.id, keyId));

            // Set budget to 50
            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        pollenBudget: 50,
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);
            const result = await updateResponse.json();
            expect(result.pollenBalance).toBe(50);
            expect(result.permissions.models).toEqual(["image"]);

            // Verify in list
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResponse.json()) as ApiKeyListResponse;
            const updatedKey = keys.data.find((k) => k.id === keyId);
            expect(updatedKey.pollenBalance).toBe(50);
        });

        test("should update expiry date", async ({ accountToken }) => {
            // Create a new key
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "expiry-test",
            });
            const keyId = createdKey.id;

            // Set expiry to 30 days from now
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 30);

            const updateResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        expiresAt: futureDate.toISOString(),
                    }),
                },
            );

            expect(updateResponse.status).toBe(200);

            // Verify in list
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResponse.json()) as ApiKeyListResponse;
            const updatedKey = keys.data.find((k) => k.id === keyId);
            expect(updatedKey.expiresAt).toBeTruthy();

            // Check the date is approximately correct (within 1 minute)
            const expiryTime = new Date(updatedKey.expiresAt).getTime();
            const expectedTime = futureDate.getTime();
            expect(Math.abs(expiryTime - expectedTime)).toBeLessThan(60000);
        });

        test("should clear permissions when set to null", async ({
            accountToken,
        }) => {
            // Create a key with permissions
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "clear-permissions-test",
            });
            const keyId = createdKey.id;

            // First set some permissions
            await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["black-forest-labs/flux.1-schnell"],
                        accountPermissions: ["usage"],
                    }),
                },
            );

            // Then clear them
            const clearResponse = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResponse.json()) as ApiKeyListResponse;
            const updatedKey = keys.data.find((k) => k.id === keyId);
            expect(updatedKey.permissions).toBeNull();
        });

        test("should return 404 for non-existent key", async ({
            accountToken,
        }) => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/account/keys/non-existent-id",
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "new-name",
                    }),
                },
            );

            expect(response.status).toBe(404);
        });

        test("should not allow updating another user's key", async ({
            accountToken,
        }) => {
            // This test would need a second user session to be comprehensive
            // For now, we'll just verify authentication is required
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "ownership-test",
            });
            const keyId = createdKey.id;

            // Try updating without authentication
            const response = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
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
            accountToken,
        }) => {
            // Create a key
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "multi-update-test",
            });
            const keyId = createdKey.id;

            // Update 1: Set name and budget
            await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "step-1",
                        pollenBudget: 25,
                    }),
                },
            );

            // Update 2: Add permissions
            await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        allowedModels: ["openai/gpt-5.4-nano"],
                    }),
                },
            );

            // Update 3: Change name and expiry
            const expiryDate = new Date();
            expiryDate.setDate(expiryDate.getDate() + 7);

            await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        name: "final-name",
                        expiresAt: expiryDate.toISOString(),
                    }),
                },
            );

            // Verify all changes persisted
            const listResponse = await SELF.fetch(
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResponse.json()) as ApiKeyListResponse;
            const finalKey = keys.data.find((k) => k.id === keyId);

            expect(finalKey.name).toBe("final-name");
            expect(finalKey.pollenBalance).toBe(25);
            expect(finalKey.permissions.models).toEqual(["text"]);
            expect(finalKey.expiresAt).toBeTruthy();
        });
    });

    describe("Permission enforcement", () => {
        test("should reject expired keys", async ({ accountToken }) => {
            // Create a key that expires immediately
            const createdKey = await createApiKeyViaApi(accountToken, {
                name: "expired-key",
            });
            const keyId = createdKey.id;
            const apiKey = createdKey.key;

            // Set expiry to past
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            const updateResp = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${keyId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
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
                "http://localhost:3000/api/account/keys",
                {
                    headers: {
                        Authorization: `Bearer ${accountToken}`,
                    },
                },
            );
            const keys = (await listResp.json()) as ApiKeyListResponse;
            const updatedKey = keys.data.find((k) => k.id === keyId);
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
