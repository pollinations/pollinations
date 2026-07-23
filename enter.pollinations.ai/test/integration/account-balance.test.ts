import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { createApiKeyViaApi, test } from "../fixtures.ts";

const endpoint = "http://localhost:3000/api/account/balance";

async function setWalletBalance(tierBalance: number, packBalance: number) {
    await drizzle(env.DB).update(userTable).set({ tierBalance, packBalance });
}

describe("GET /api/account/balance", () => {
    test("session auth returns the account wallet scope", async ({
        sessionToken,
    }) => {
        await setWalletBalance(2, 3);

        const response = await SELF.fetch(endpoint, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            balance: 5,
            scope: "account",
            keyBudget: null,
            accountBalance: 5,
        });
    });

    test("budgeted key without usage permission returns only its allowance", async ({
        sessionToken,
    }) => {
        await setWalletBalance(2, 3);
        const key = await createApiKeyViaApi(sessionToken, {
            name: "budget-only-key",
            pollenBudget: 7,
        });

        const response = await SELF.fetch(endpoint, {
            headers: { Authorization: `Bearer ${key.key}` },
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            balance: 7,
            scope: "key_budget",
            keyBudget: 7,
        });
    });

    test("budgeted key with usage permission also returns account balance", async ({
        sessionToken,
    }) => {
        await setWalletBalance(2, 3);
        const key = await createApiKeyViaApi(sessionToken, {
            name: "budget-and-wallet-key",
            pollenBudget: 7,
            accountPermissions: ["usage"],
        });

        const response = await SELF.fetch(endpoint, {
            headers: { Authorization: `Bearer ${key.key}` },
        });

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            balance: 7,
            scope: "key_budget",
            keyBudget: 7,
            accountBalance: 5,
        });
    });

    test("unbudgeted key without usage permission preserves the existing 403", async ({
        apiKey,
    }) => {
        const response = await SELF.fetch(endpoint, {
            headers: { Authorization: `Bearer ${apiKey}` },
        });

        expect(response.status).toBe(403);
    });
});
