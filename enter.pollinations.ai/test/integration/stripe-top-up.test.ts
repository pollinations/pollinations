import { env, SELF } from "cloudflare:test";
import {
    apikey as apiKeyTable,
    session as sessionTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { createApiKeyViaApi, test } from "../fixtures.ts";

const intentEndpoint = "http://localhost:3000/api/stripe/top-up-intents";

type IntentResponse = { url: string };
type StoredIntent = {
    userId: string;
    delegatedKeyId: string;
    parentAppKeyId: string;
    packKey: string;
    returnUri: string;
    topupState: string;
    intentExpiresAt: string;
    checkoutUrl?: string;
    checkoutExpiresAt?: string;
    checkoutMode?: "customer" | "guest";
};

async function createDelegatedKey(
    sessionToken: string,
    redirectUris = ["https://app.example.com/callback"],
) {
    const parent = await createApiKeyViaApi(sessionToken, {
        name: "Top-up test app",
        type: "publishable",
        redirectUris,
    });
    const delegated = await createApiKeyViaApi(sessionToken, {
        name: "Top-up delegated key",
        accountPermissions: ["usage"],
    });
    await drizzle(env.DB)
        .update(apiKeyTable)
        .set({ byopClientKeyId: parent.id })
        .where(eq(apiKeyTable.id, delegated.id));
    return { parent, delegated };
}

async function createIntent(
    delegatedKey: string,
    overrides: Partial<{
        packKey: string;
        returnUri: string;
        topupState: string;
    }> = {},
) {
    return SELF.fetch(intentEndpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${delegatedKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            packKey: "p5",
            returnUri: "https://app.example.com/callback",
            topupState: "state_123",
            ...overrides,
        }),
    });
}

async function readStoredIntent(url: string): Promise<StoredIntent | null> {
    const token = new URL(url).pathname.split("/").at(-1);
    if (!token) return null;
    return env.KV.get<StoredIntent>(`topup-intent:${token}`, "json");
}

async function createOtherSession() {
    const db = drizzle(env.DB);
    const userId = "top-up-other-user";
    const token = "top-up-other-session";
    const now = new Date();
    await db.insert(userTable).values({
        id: userId,
        name: "Other top-up user",
        email: "top-up-other@example.com",
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
    });
    await db.insert(sessionTable).values({
        id: "top-up-other-session-id",
        token,
        userId,
        expiresAt: new Date(now.getTime() + 60_000),
        createdAt: now,
        updatedAt: now,
    });
    return token;
}

describe("BYOP Stripe top-up intents", () => {
    test("rejects keys that were not delegated by a publishable app", async ({
        apiKey,
        pubApiKey,
    }) => {
        const [secretResponse, publishableResponse] = await Promise.all([
            createIntent(apiKey),
            createIntent(pubApiKey),
        ]);

        expect(secretResponse.status).toBe(403);
        expect(publishableResponse.status).toBe(403);
    });

    test("stores a wallet-bound intent with a canonical registered return URI", async ({
        sessionToken,
    }) => {
        const { parent, delegated } = await createDelegatedKey(sessionToken);

        const response = await createIntent(delegated.key, {
            returnUri:
                "https://app.example.com/callback?prompt=temporary&topup=stale#section",
            topupState: "state-with-dashes",
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const result = (await response.json()) as IntentResponse;
        expect(result.url).toMatch(
            /^http:\/\/localhost:3000\/api\/stripe\/top-up\/[A-Za-z0-9]{40}$/,
        );
        await expect(readStoredIntent(result.url)).resolves.toMatchObject({
            delegatedKeyId: delegated.id,
            parentAppKeyId: parent.id,
            packKey: "p5",
            returnUri: "https://app.example.com/callback",
            topupState: "state-with-dashes",
        });
    });

    test("preserves a registered query exactly and rejects extra query state", async ({
        sessionToken,
    }) => {
        const { delegated } = await createDelegatedKey(sessionToken, [
            "https://app.example.com/callback?view=checkout",
        ]);

        const accepted = await createIntent(delegated.key, {
            returnUri:
                "https://app.example.com/callback?view=checkout&topup=stale",
        });
        expect(accepted.status).toBe(200);
        const acceptedBody = (await accepted.json()) as IntentResponse;
        await expect(readStoredIntent(acceptedBody.url)).resolves.toMatchObject(
            {
                returnUri: "https://app.example.com/callback?view=checkout",
            },
        );

        const rejected = await createIntent(delegated.key, {
            returnUri: "https://app.example.com/callback?view=checkout&extra=1",
        });
        expect(rejected.status).toBe(400);
    });

    test("rejects an invalid pack, nonce, and unregistered return URI", async ({
        sessionToken,
    }) => {
        const { delegated } = await createDelegatedKey(sessionToken);
        const [pack, nonce, returnUri] = await Promise.all([
            createIntent(delegated.key, { packKey: "p999" }),
            createIntent(delegated.key, { topupState: "not url safe!" }),
            createIntent(delegated.key, {
                returnUri: "https://attacker.example/callback",
            }),
        ]);

        expect(pack.status).toBe(400);
        expect(nonce.status).toBe(400);
        expect(returnUri.status).toBe(400);
        for (const response of [pack, nonce, returnUri]) {
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        }
    });

    test("guest redemption creates a PII-free Checkout and replays one session", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { parent, delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;
        const storedIntent = await readStoredIntent(url);
        expect(storedIntent).toBeTruthy();

        const first = await SELF.fetch(url, { redirect: "manual" });
        const replay = await SELF.fetch(url, { redirect: "manual" });

        expect(first.status).toBe(302);
        expect(replay.status).toBe(302);
        expect(replay.headers.get("location")).toBe(
            first.headers.get("location"),
        );
        expect(first.headers.get("cache-control")).toBe("no-store");
        expect(first.headers.get("referrer-policy")).toBe("no-referrer");
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);

        const checkoutRequest = mocks.stripe.state.requests.find(
            (request) => request.path === "/v1/checkout/sessions",
        );
        expect(checkoutRequest?.body.customer).toBeUndefined();
        expect(checkoutRequest?.body.customer_email).toBeUndefined();
        expect(
            checkoutRequest?.body["customer_update[address]"],
        ).toBeUndefined();
        expect(checkoutRequest?.body["invoice_creation[enabled]"]).toBe("true");
        expect(checkoutRequest?.body["metadata[source]"]).toBe("byop_topup");
        expect(checkoutRequest?.body["metadata[userId]"]).toBe(
            storedIntent?.userId,
        );
        expect(checkoutRequest?.body["metadata[packKey]"]).toBe("p5");
        expect(checkoutRequest?.body["metadata[parentAppKeyId]"]).toBe(
            parent.id,
        );
        expect(checkoutRequest?.body["metadata[delegatedKeyId]"]).toBe(
            delegated.id,
        );
        expect(
            checkoutRequest?.body["payment_intent_data[metadata][userId]"],
        ).toBe(storedIntent?.userId);
        expect(
            checkoutRequest?.body["payment_intent_data[metadata][packKey]"],
        ).toBe("p5");
        expect(Number(checkoutRequest?.body.expires_at)).toBeGreaterThan(
            Math.floor(Date.now() / 1000) + 30 * 60,
        );
        expect(checkoutRequest?.idempotencyKey).toBe(
            new URL(url).pathname.split("/").at(-1),
        );

        const success = new URL(checkoutRequest?.body.success_url ?? "");
        const cancel = new URL(checkoutRequest?.body.cancel_url ?? "");
        expect(success.searchParams.get("topup")).toBe("success");
        expect(cancel.searchParams.get("topup")).toBe("canceled");
        expect(success.searchParams.get("topup_state")).toBe("state_123");
        expect(success.searchParams.has("session_id")).toBe(false);

        const replayWithOwnerSession = await SELF.fetch(url, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            redirect: "manual",
        });
        expect(replayWithOwnerSession.status).toBe(302);
        expect(replayWithOwnerSession.headers.get("location")).toBe(
            first.headers.get("location"),
        );
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
    });

    test("a different user's session redeems as a PII-free guest", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;
        const otherSession = await createOtherSession();

        const response = await SELF.fetch(url, {
            headers: {
                Cookie: `better-auth.session_token=${otherSession}`,
            },
            redirect: "manual",
        });

        expect(response.status).toBe(302);
        const checkoutRequest = mocks.stripe.state.requests.find(
            (request) => request.path === "/v1/checkout/sessions",
        );
        expect(checkoutRequest?.body.customer).toBeUndefined();
        expect(checkoutRequest?.body.customer_email).toBeUndefined();
        await expect(readStoredIntent(url)).resolves.toMatchObject({
            checkoutMode: "guest",
        });
    });

    test("registered callback query survives redemption", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const returnUri = "https://app.example.com/callback?view=checkout";
        const { delegated } = await createDelegatedKey(sessionToken, [
            returnUri,
        ]);
        const intentResponse = await createIntent(delegated.key, {
            returnUri,
        });
        const { url } = (await intentResponse.json()) as IntentResponse;

        const response = await SELF.fetch(url, { redirect: "manual" });
        expect(response.status).toBe(302);
        const checkoutRequest = mocks.stripe.state.requests.find(
            (request) => request.path === "/v1/checkout/sessions",
        );
        for (const key of ["success_url", "cancel_url"] as const) {
            const callback = new URL(checkoutRequest?.body[key] ?? "");
            expect(callback.searchParams.get("view")).toBe("checkout");
            expect(callback.searchParams.get("topup_state")).toBe("state_123");
        }
    });

    test("customer redemption requires the matching session again on replay", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;

        const first = await SELF.fetch(url, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            redirect: "manual",
        });
        expect(first.status).toBe(302);

        const checkoutRequest = mocks.stripe.state.requests.find(
            (request) => request.path === "/v1/checkout/sessions",
        );
        expect(checkoutRequest?.body.customer).toBe("cus_mock_1");
        expect(checkoutRequest?.body["customer_update[address]"]).toBe("auto");

        const replayWithoutSession = await SELF.fetch(url, {
            redirect: "manual",
        });
        expect(replayWithoutSession.status).toBe(403);
        expect(await replayWithoutSession.text()).toContain("original browser");

        const replayWithSession = await SELF.fetch(url, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            redirect: "manual",
        });
        expect(replayWithSession.status).toBe(302);
        expect(replayWithSession.headers.get("location")).toBe(
            first.headers.get("location"),
        );
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
    });

    test("a redeemed intent remains replayable through its Checkout expiry", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;
        const first = await SELF.fetch(url, { redirect: "manual" });
        const stored = await readStoredIntent(url);
        const token = new URL(url).pathname.split("/").at(-1);
        if (!token || !stored) throw new Error("Missing redeemed test intent");

        await env.KV.put(
            `topup-intent:${token}`,
            JSON.stringify({
                ...stored,
                intentExpiresAt: new Date(Date.now() - 1000).toISOString(),
            }),
            { expirationTtl: 60 },
        );

        const replay = await SELF.fetch(url, { redirect: "manual" });
        expect(replay.status).toBe(302);
        expect(replay.headers.get("location")).toBe(
            first.headers.get("location"),
        );
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
    });

    test("concurrent guest redemptions create one Stripe session", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;

        const responses = await Promise.all([
            SELF.fetch(url, { redirect: "manual" }),
            SELF.fetch(url, { redirect: "manual" }),
        ]);

        expect(responses.map((response) => response.status)).toEqual([
            302, 302,
        ]);
        expect(responses[0].headers.get("location")).toBe(
            responses[1].headers.get("location"),
        );
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
    });

    test("mixed-mode first redemption fixes one mode and one Stripe session", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;

        const [customerResponse, guestResponse] = await Promise.all([
            SELF.fetch(url, {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                redirect: "manual",
            }),
            SELF.fetch(url, { redirect: "manual" }),
        ]);

        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
        const stored = await readStoredIntent(url);
        expect(stored?.checkoutMode).toMatch(/^(customer|guest)$/);
        expect([302, 403, 409]).toContain(customerResponse.status);
        expect([302, 403, 409]).toContain(guestResponse.status);
        if (stored?.checkoutMode === "customer") {
            expect(customerResponse.status).toBe(302);
            expect([403, 409]).toContain(guestResponse.status);
        } else {
            expect(guestResponse.status).toBe(302);
        }
    });

    test("mixed-mode idempotency conflicts retry without overwriting intent state", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;
        const original = await readStoredIntent(url);
        expect(original).toBeTruthy();

        const guestWinner = await SELF.fetch(url, { redirect: "manual" });
        expect(guestWinner.status).toBe(302);
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);

        const token = new URL(url).pathname.split("/").at(-1);
        if (!token || !original) throw new Error("Missing test intent");
        await env.KV.put(`topup-intent:${token}`, JSON.stringify(original), {
            expirationTtl: 600,
        });

        const conflict = await SELF.fetch(url, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        });
        expect(conflict.status).toBe(409);
        expect(conflict.headers.get("retry-after")).toBe("1");
        expect(await conflict.text()).toContain("retry=1");
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(1);
        await expect(readStoredIntent(url)).resolves.toEqual(original);

        const finalConflict = await SELF.fetch(`${url}?retry=3`, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        });
        const finalHtml = await finalConflict.text();
        expect(finalConflict.status).toBe(409);
        expect(finalHtml).toContain("Retry Checkout");
        expect(finalHtml).not.toContain('http-equiv="refresh"');
        await expect(readStoredIntent(url)).resolves.toEqual(original);
    });

    test("an expired stored intent returns 410 without creating Checkout", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("stripe", "tinybird");
        const { delegated } = await createDelegatedKey(sessionToken);
        const intentResponse = await createIntent(delegated.key);
        const { url } = (await intentResponse.json()) as IntentResponse;
        const stored = await readStoredIntent(url);
        const token = new URL(url).pathname.split("/").at(-1);
        if (!token || !stored) throw new Error("Missing test intent");
        await env.KV.put(
            `topup-intent:${token}`,
            JSON.stringify({
                ...stored,
                intentExpiresAt: new Date(Date.now() - 1000).toISOString(),
            }),
            { expirationTtl: 60 },
        );

        const response = await SELF.fetch(url);

        expect(response.status).toBe(410);
        expect(mocks.stripe.state.checkoutSessions).toHaveLength(0);
    });

    test("malformed tokens fail immediately while valid misses retry before 410", async () => {
        const malformed = await SELF.fetch(
            "http://localhost:3000/api/stripe/top-up/missing",
        );
        expect(malformed.status).toBe(410);

        const validMissingUrl = `http://localhost:3000/api/stripe/top-up/${"A".repeat(40)}`;
        const retry = await SELF.fetch(validMissingUrl);
        expect(retry.status).toBe(409);
        expect(retry.headers.get("retry-after")).toBe("1");
        expect(await retry.text()).toContain("retry=1");

        const expired = await SELF.fetch(`${validMissingUrl}?retry=3`);
        expect(expired.status).toBe(410);

        for (const response of [malformed, retry, expired]) {
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect(response.headers.get("referrer-policy")).toBe("no-referrer");
        }
    });

    test("rate limits intent creation per delegated key", async ({
        sessionToken,
    }) => {
        const { delegated } = await createDelegatedKey(sessionToken);
        const responses = [];
        for (let index = 0; index < 11; index += 1) {
            responses.push(
                await createIntent(delegated.key, {
                    topupState: `state_${index}`,
                }),
            );
        }

        expect(responses.slice(0, 10).every((response) => response.ok)).toBe(
            true,
        );
        expect(responses[10].status).toBe(429);
    });
});
