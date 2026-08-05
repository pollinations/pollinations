import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { createApiKeyViaApi, test } from "../fixtures.ts";

const endpoint = "http://localhost:3000/api/account/balance";

test("returns account balance buckets for a session", async ({
    sessionToken,
}) => {
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/get-session",
        {
            headers: {
                cookie: `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    const session = (await sessionResponse.json()) as { user: { id: string } };
    const db = drizzle(env.DB);
    await db
        .update(userTable)
        .set({ tierBalance: 10.5, packBalance: 25.3 })
        .where(eq(userTable.id, session.user.id));

    const response = await SELF.fetch(endpoint, {
        headers: {
            cookie: `better-auth.session_token=${sessionToken}`,
        },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        total: 35.8,
        allowance: 10.5,
        pack: 25.3,
        currency: "pollen",
    });
});

test("rejects anonymous balance requests", async () => {
    const response = await SELF.fetch(endpoint);

    expect(response.status).toBe(401);
});

test("rejects an unbudgeted API key without usage permission", async ({
    apiKey,
}) => {
    const response = await SELF.fetch(endpoint, {
        headers: {
            authorization: `Bearer ${apiKey}`,
        },
    });

    expect(response.status).toBe(403);
});

test("returns a budgeted API key's budget as paid balance", async ({
    sessionToken,
}) => {
    const budgetedApiKey = await createApiKeyViaApi(sessionToken, {
        name: "balance-budget-test-key",
    });
    const updateResponse = await SELF.fetch(
        `http://localhost:3000/api/api-keys/${budgetedApiKey.id}/update`,
        {
            method: "POST",
            headers: {
                "content-type": "application/json",
                cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({ pollenBudget: 100 }),
        },
    );
    expect(updateResponse.status).toBe(200);

    const response = await SELF.fetch(endpoint, {
        headers: {
            authorization: `Bearer ${budgetedApiKey.key}`,
        },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        total: 100,
        allowance: 0,
        pack: 100,
        currency: "pollen",
    });
});
