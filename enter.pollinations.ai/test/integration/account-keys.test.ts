import { env, SELF } from "cloudflare:test";
import { signGrantAgent } from "@shared/auth/agent-run-token.ts";
import { communityModelId } from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import {
    initialKeyEditValues,
    keyEditUpdates,
} from "../../frontend/src/components/keys/key-edit-values.ts";
import type { ApiKey } from "../../frontend/src/components/keys/types.ts";
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
                models: [
                    "black-forest-labs/flux.1-schnell",
                    "openai/gpt-5.4-nano",
                ],
                account: ["profile", "usage"],
            });
            expect(data.pollenBudget).toBe(50);
        });

        test("should let a key with account:keys create a child that can create keys", async ({
            accountToken,
        }) => {
            const parentKey = await createApiKeyViaApi(accountToken, {
                name: "machine-parent",
                accountPermissions: ["profile", "keys", "usage"],
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

        test("refuses a publishable key even with account:keys permission", async ({
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
                    body: JSON.stringify({
                        name: "child-from-publishable",
                    }),
                },
            );

            expect(response.status).toBe(401);
        });
    });

    describe("PATCH /api/account/keys/:id (update)", () => {
        test("saving an older editor preserves concurrent budget, expiry and permission changes", async ({
            accountToken,
        }) => {
            const key = await createApiKeyViaApi(accountToken, {
                name: "before-edit",
                pollenBudget: 10,
            });
            const url = `http://localhost:3000/api/account/keys/${key.id}`;
            const headers = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            };
            const prepared = await SELF.fetch(url, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ expiresAt: "2030-01-07T23:54:52.123Z" }),
            });
            expect(prepared.status).toBe(200);
            const initial = initialKeyEditValues(
                (await prepared.json()) as ApiKey,
                Date.parse("2030-01-01T00:00:00Z"),
            );

            // Spending and another editor can change these while this form is open.
            const concurrent = await SELF.fetch(url, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    pollenBudget: 4.9987342,
                    expiresAt: "2030-01-03T11:22:33.456Z",
                    accountPermissions: ["usage"],
                    questPollenOnly: true,
                }),
            });
            expect(concurrent.status).toBe(200);
            const concurrentKey = (await concurrent.json()) as ApiKey;
            const updates = keyEditUpdates(
                initial,
                { ...initial, name: "after-edit" },
                Date.parse("2030-01-01T01:00:00Z"),
            );
            const saved = await SELF.fetch(url, {
                method: "PATCH",
                headers,
                body: JSON.stringify(updates),
            });
            expect(saved.status).toBe(200);
            expect(await saved.json()).toMatchObject({
                name: "after-edit",
                pollenBalance: 4.9987342,
                expiresAt: concurrentKey.expiresAt,
                permissions: { account: ["usage"] },
                questPollenOnly: true,
            });
        });

        test("accepts an ISO 8601 expiry with a UTC offset", async ({
            accountToken,
        }) => {
            const key = await createApiKeyViaApi(accountToken, {
                name: "offset-expiry",
            });

            const response = await SELF.fetch(
                `http://localhost:3000/api/account/keys/${key.id}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${accountToken}`,
                    },
                    body: JSON.stringify({
                        expiresAt: "2030-01-01T02:00:00+02:00",
                    }),
                },
            );

            expect(response.status).toBe(200);
            expect((await response.json()).expiresAt).toBe(
                "2030-01-01T00:00:00.000Z",
            );
        });
    });

    describe("keys managed with an API key stay within it", () => {
        const call = (
            key: string,
            path: string,
            method: string,
            body?: unknown,
        ) =>
            SELF.fetch(`http://localhost:3000/api/account${path}`, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${key}`,
                },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        const budgetOf = async (key: string) =>
            (
                await (
                    await call(key, "/key", "GET")
                ).json<{
                    pollenBudget: number | null;
                }>()
            ).pollenBudget;

        test("a created key can't get account permissions the calling key lacks", async ({
            accountToken,
        }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "keys-only",
                accountPermissions: ["keys"],
            });

            const escalated = await call(caller.key, "/keys", "POST", {
                name: "escalated",
                accountPermissions: ["keys", "profile"],
            });
            expect(escalated.status).toBe(403);
            const same = await call(caller.key, "/keys", "POST", {
                name: "same",
                accountPermissions: ["keys"],
            });
            expect(same.status).toBe(200);
        });

        test("a created key inherits and can't exceed the calling key's models and expiry", async ({
            accountToken,
        }) => {
            const caller = await (
                await call(accountToken, "/keys", "POST", {
                    name: "text-for-an-hour",
                    accountPermissions: ["keys"],
                    allowedModels: ["text"],
                    expiresIn: 3600,
                })
            ).json();

            const inherited = await (
                await call(caller.key, "/keys", "POST", { name: "inherited" })
            ).json();
            expect(inherited.permissions.models).toEqual(["text"]);
            expect(Date.parse(inherited.expiresAt)).toBeLessThanOrEqual(
                Date.parse(caller.expiresAt),
            );
            const narrower = await call(caller.key, "/keys", "POST", {
                name: "one-text-model",
                allowedModels: ["openai/gpt-5.4-nano"],
                expiresIn: 60,
            });
            expect(narrower.status).toBe(200);

            for (const wider of [
                { allowedModels: ["image"] },
                { allowedModels: null },
                { expiresIn: 7200 },
            ]) {
                const response = await call(caller.key, "/keys", "POST", {
                    name: "wider",
                    ...wider,
                });
                expect(response.status).toBe(403);
            }
        });

        test("a created key's budget comes out of the calling key's", async ({
            accountToken,
        }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "five",
                accountPermissions: ["keys"],
                pollenBudget: 5,
            });

            for (const tooMuch of [
                {},
                { pollenBudget: null },
                { pollenBudget: 6 },
            ]) {
                const response = await call(caller.key, "/keys", "POST", {
                    name: "too-much",
                    ...tooMuch,
                });
                expect(response.status).toBe(403);
            }
            // A key that isn't created gives its budget back.
            const failed = await call(caller.key, "/keys", "POST", {
                name: "bad-client",
                pollenBudget: 3,
                consent: { requestedClientId: "pk_invalid" },
            });
            expect(failed.status).toBe(400);
            expect(await budgetOf(caller.key)).toBe(5);

            const child = await call(caller.key, "/keys", "POST", {
                name: "three",
                pollenBudget: 3,
            });
            expect(child.status).toBe(200);
            expect(await budgetOf(caller.key)).toBe(2);
            const another = await call(caller.key, "/keys", "POST", {
                name: "three-more",
                pollenBudget: 3,
            });
            expect(another.status).toBe(403);
        });

        test("a key can't update itself", async ({ accountToken }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "self",
                accountPermissions: ["keys"],
                pollenBudget: 5,
            });

            const response = await call(
                caller.key,
                `/keys/${caller.id}`,
                "PATCH",
                { pollenBudget: 1000 },
            );
            expect(response.status).toBe(403);
            expect(await budgetOf(caller.key)).toBe(5);
        });

        test("an update can't grant more than the calling key has", async ({
            accountToken,
        }) => {
            const caller = await (
                await call(accountToken, "/keys", "POST", {
                    name: "limited",
                    accountPermissions: ["keys"],
                    allowedModels: ["text"],
                    pollenBudget: 5,
                    expiresIn: 3600,
                })
            ).json();
            const target = await (
                await call(caller.key, "/keys", "POST", {
                    name: "target",
                    pollenBudget: 1,
                })
            ).json();
            const update = (body: object) =>
                call(caller.key, `/keys/${target.id}`, "PATCH", body);

            for (const tooMuch of [
                { accountPermissions: ["profile"] },
                { allowedModels: null },
                { allowedModels: ["image"] },
                { expiresAt: null },
                { expiresAt: "2099-01-01T00:00:00Z" },
                { pollenBudget: null },
                // 5 more than the target has; the caller has 4 left.
                { pollenBudget: 6 },
            ]) {
                expect((await update(tooMuch)).status).toBe(403);
            }
            const within = await update({
                accountPermissions: ["keys"],
                allowedModels: ["text"],
                pollenBudget: 4,
            });
            expect(within.status).toBe(200);
            expect((await within.json()).pollenBalance).toBe(4);
            expect(await budgetOf(caller.key)).toBe(1);
        });

        test("a key can only edit keys that end up within its own limits", async ({
            accountToken,
        }) => {
            const caller = await (
                await call(accountToken, "/keys", "POST", {
                    name: "limited",
                    accountPermissions: ["keys"],
                    pollenBudget: 5,
                    expiresIn: 3600,
                })
            ).json();
            const expiresAt = new Date(Date.now() + 1800_000).toISOString();

            const broader = await createApiKeyViaApi(accountToken, {
                name: "broader",
                accountPermissions: ["keys", "profile"],
                pollenBudget: 1,
            });
            const extend = await call(
                caller.key,
                `/keys/${broader.id}`,
                "PATCH",
                { expiresAt },
            );
            expect(extend.status).toBe(403);

            // An unlimited key is within a budgeted one only once it gets a
            // budget, taken from the caller's.
            const unlimited = await createApiKeyViaApi(accountToken, {
                name: "unlimited",
            });
            const url = `/keys/${unlimited.id}`;
            expect(
                (await call(caller.key, url, "PATCH", { expiresAt })).status,
            ).toBe(403);
            expect(
                (
                    await call(caller.key, url, "PATCH", {
                        expiresAt,
                        pollenBudget: 1,
                    })
                ).status,
            ).toBe(200);
            expect(await budgetOf(caller.key)).toBe(4);
        });

        test("a key can't renew a budget beyond its allowance", async ({
            accountToken,
        }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "five",
                accountPermissions: ["keys"],
                pollenBudget: 5,
            });
            const created = await call(accountToken, "/keys", "POST", {
                name: "hundred-for-a-minute",
                pollenBudget: 100,
                expiresIn: 60,
            });
            expect(created.status).toBe(200);
            const target = await created.json();
            const expiresAt = new Date(Date.now() + 1800_000).toISOString();
            expect(Date.parse(expiresAt)).toBeGreaterThan(
                Date.parse(target.expiresAt),
            );

            for (const renewal of [
                { expiresAt },
                { expiresAt: null },
                { expiresAt, pollenBudget: 6 },
                { expiresAt: null, pollenBudget: 6 },
            ]) {
                const response = await call(
                    caller.key,
                    `/keys/${target.id}`,
                    "PATCH",
                    renewal,
                );
                expect(response.status).toBe(403);
            }
            expect(await budgetOf(caller.key)).toBe(5);
            const keys = await (
                await call(accountToken, "/keys", "GET")
            ).json();
            expect(
                keys.data.find((key: { id: string }) => key.id === target.id),
            ).toMatchObject({
                pollenBalance: 100,
                expiresAt: target.expiresAt,
            });
        });

        test("renewing a key reserves its entire resulting budget", async ({
            accountToken,
        }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "five",
                accountPermissions: ["keys"],
                pollenBudget: 5,
            });
            const created = await call(accountToken, "/keys", "POST", {
                name: "hundred-for-a-minute",
                pollenBudget: 100,
                expiresIn: 60,
            });
            expect(created.status).toBe(200);
            const target = await created.json();
            const url = `/keys/${target.id}`;
            const expiresAt = new Date(Date.now() + 1800_000).toISOString();
            const renewed = await call(caller.key, url, "PATCH", {
                expiresAt,
                pollenBudget: 3,
            });
            expect(renewed.status).toBe(200);
            expect((await renewed.json()).pollenBalance).toBe(3);
            expect(await budgetOf(caller.key)).toBe(2);

            // A second renewal must fit the caller's remaining allowance.
            expect(
                (await call(caller.key, url, "PATCH", { expiresAt: null }))
                    .status,
            ).toBe(403);
            // Keeping or shortening the expiry doesn't grant extra lifetime.
            const keys = await (
                await call(accountToken, "/keys", "GET")
            ).json();
            const current = keys.data.find(
                (key: { id: string }) => key.id === target.id,
            );
            for (const expiry of [current.expiresAt, target.expiresAt]) {
                expect(
                    (
                        await call(caller.key, url, "PATCH", {
                            expiresAt: expiry,
                        })
                    ).status,
                ).toBe(200);
            }
            expect(await budgetOf(caller.key)).toBe(2);
            expect(await budgetOf(target.key)).toBe(3);
            // The account owner can still renew existing grants directly.
            expect(
                (await call(accountToken, url, "PATCH", { expiresAt: null }))
                    .status,
            ).toBe(200);
        });

        test("concurrent updates of a key pay for its budget once", async ({
            accountToken,
        }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "two-hundred",
                accountPermissions: ["keys"],
                pollenBudget: 200,
            });
            const patchConcurrently = (id: string, body: unknown) =>
                Promise.all(
                    Array.from({ length: 16 }, () =>
                        call(caller.key, `/keys/${id}`, "PATCH", body),
                    ),
                );

            // A key without budget and an unlimited key.
            for (const pollenBudget of [0, null]) {
                const target = await (
                    await call(accountToken, "/keys", "POST", {
                        name: "target",
                        pollenBudget,
                    })
                ).json();
                const responses = await patchConcurrently(target.id, {
                    pollenBudget: 10,
                });
                for (const response of responses) {
                    expect(response.status).toBe(200);
                }
                expect(await budgetOf(target.key)).toBe(10);
            }
            expect(await budgetOf(caller.key)).toBe(180);

            // Renewing to the same expiry pays for the remaining budget once.
            const renewed = await (
                await call(accountToken, "/keys", "POST", {
                    name: "five-for-a-minute",
                    pollenBudget: 5,
                    expiresIn: 60,
                })
            ).json();
            const expiresAt = new Date(
                Math.floor(Date.now() / 1000) * 1000 + 1800_000,
            ).toISOString();
            await patchConcurrently(renewed.id, { expiresAt });
            expect(await budgetOf(caller.key)).toBe(175);
        });

        test("a budget update doesn't refill what the key loses meanwhile", async ({
            accountToken,
        }) => {
            const caller = await createApiKeyViaApi(accountToken, {
                name: "two-hundred",
                accountPermissions: ["keys"],
                pollenBudget: 200,
            });
            const target = await (
                await call(accountToken, "/keys", "POST", {
                    name: "hundred",
                    pollenBudget: 100,
                })
            ).json();
            // Lowering the budget while it is being kept at 100 stands in for
            // the key spending during those updates.
            await Promise.all(
                [100, 100, 100, 100, 100, 100, 100, 50, 100, 100, 100, 100].map(
                    (pollenBudget) =>
                        call(caller.key, `/keys/${target.id}`, "PATCH", {
                            pollenBudget,
                        }),
                ),
            );
            // Either the lowering came last, or a later update paid to undo it.
            expect([
                [50, 200],
                [100, 150],
            ]).toContainEqual([
                await budgetOf(target.key),
                await budgetOf(caller.key),
            ]);
        });

        test("a key limited to a category can grant community models in it", async ({
            accountToken,
        }) => {
            const db = drizzle(env.DB);
            const owner = await db.select().from(schema.user).get();
            await db.update(schema.user).set({ githubUsername: "model-owner" });
            for (const modality of ["text", "image"]) {
                await db.insert(schema.communityEndpoint).values({
                    id: `owner-${modality}-model`,
                    ownerUserId: owner?.id as string,
                    name: `${modality}-model`,
                    title: `Owner ${modality} model`,
                    baseUrl: "https://owner.example.com/v1",
                    upstreamModel: `${modality}-model`,
                    payload: JSON.stringify({
                        paidOnly: false,
                        bearerTokenCiphertext: "encrypted-token",
                        modality,
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
            }
            const caller = await createApiKeyViaApi(accountToken, {
                name: "text-only",
                accountPermissions: ["keys"],
                allowedModels: ["text"],
            });

            const textModel = communityModelId("model-owner", "text-model");
            const text = await call(caller.key, "/keys", "POST", {
                name: "community-text",
                allowedModels: [textModel],
            });
            expect(text.status).toBe(200);
            expect((await text.json()).permissions.models).toEqual([textModel]);
            const image = await call(caller.key, "/keys", "POST", {
                name: "community-image",
                allowedModels: [communityModelId("model-owner", "image-model")],
            });
            expect(image.status).toBe(403);
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
            // The refusal links the page where the owner allows it for this key.
            const { id } = await (
                await SELF.fetch("http://localhost:3000/api/account/key", {
                    headers: { Authorization: `Bearer ${apiKey}` },
                })
            ).json();
            const grant = `https://enter.pollinations.ai/grant?id=${id}&permission=keys&ref=agent_grant`;
            expect((await response.json()).error).toMatchObject({
                message: `API key does not have 'account:keys' permission. Allow it at ${grant}`,
                fixUrl: grant,
            });
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

    describe("GET /api/account/keys/:id/grant-agent", () => {
        test("names the asking agent only when gen signed it", async ({
            accountToken,
        }) => {
            const agent = "community/alice/research-buddy";
            const sig = signGrantAgent({
                secret: env.BETTER_AUTH_SECRET,
                apiKeyId: "key-1",
                grant: { model: "flux" },
                agent,
            });
            const named = async (
                keyId: string,
                grant: Record<string, string>,
                asker: string,
            ) => {
                const query = new URLSearchParams({
                    ...grant,
                    agent: asker,
                    sig,
                });
                const response = await SELF.fetch(
                    `http://localhost:3000/api/account/keys/${keyId}/grant-agent?${query}`,
                    { headers: { Authorization: `Bearer ${accountToken}` } },
                );
                expect(response.status).toBe(200);
                return (await response.json<{ agent: string | null }>()).agent;
            };

            expect(await named("key-1", { model: "flux" }, agent)).toBe(agent);
            // A signed name cannot be relabelled or moved to another key or grant.
            expect(
                await named(
                    "key-1",
                    { model: "flux" },
                    "community/pollinations/floret",
                ),
            ).toBeNull();
            expect(await named("key-2", { model: "flux" }, agent)).toBeNull();
            expect(
                await named("key-1", { category: "image" }, agent),
            ).toBeNull();
        });
    });
});
