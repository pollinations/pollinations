import { env, SELF } from "cloudflare:test";
import { user as userTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { createApiKeyViaApi, test } from "./fixtures.ts";

type BalanceBody = {
    balance: number;
    accountBalance?: { total: number; tier: number; paid: number };
};

const TIER = 10.5;
const PAID = 25.25;
const TOTAL = TIER + PAID;

async function setAccountBalances(userId: string) {
    const db = drizzle(env.DB);
    await db
        .update(userTable)
        .set({ tierBalance: TIER, packBalance: PAID })
        .where(eq(userTable.id, userId));
}

async function sessionUserId(sessionToken: string): Promise<string> {
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/get-session",
        { headers: { Cookie: `better-auth.session_token=${sessionToken}` } },
    );
    const session = (await sessionResponse.json()) as { user: { id: string } };
    return session.user.id;
}

async function createKey(
    sessionToken: string,
    options: {
        name: string;
        pollenBudget?: number | null;
        accountPermissions?: string[] | null;
    },
) {
    const response = await SELF.fetch(
        "http://localhost:3000/api/account/keys",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify(options),
        },
    );
    if (!response.ok) {
        throw new Error(`Failed to create API key: ${await response.text()}`);
    }
    return (await response.json()) as { id: string; key: string };
}

async function getBalance(headers: Record<string, string>) {
    return SELF.fetch("http://localhost:3000/api/account/balance", {
        headers,
    });
}

describe("GET /api/account/balance", () => {
    test("session sees account total in balance plus accountBalance breakdown", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const userId = await sessionUserId(sessionToken);
        await setAccountBalances(userId);

        const res = await getBalance({
            Cookie: `better-auth.session_token=${sessionToken}`,
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            balance: TOTAL,
            accountBalance: { total: TOTAL, tier: TIER, paid: PAID },
        });
    });

    test("budgeted key without account:usage sees only the key budget", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const userId = await sessionUserId(sessionToken);
        await setAccountBalances(userId);

        const created = await createKey(sessionToken, {
            name: "budget-only",
            pollenBudget: 7,
        });
        const res = await getBalance({
            Authorization: `Bearer ${created.key}`,
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as BalanceBody;
        expect(body.balance).toBe(7);
        expect(body.accountBalance).toBeUndefined();
    });

    test("budgeted key with account:usage keeps key budget and adds accountBalance", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const userId = await sessionUserId(sessionToken);
        await setAccountBalances(userId);

        const created = await createKey(sessionToken, {
            name: "budget-and-usage",
            pollenBudget: 7,
            accountPermissions: ["usage"],
        });
        const res = await getBalance({
            Authorization: `Bearer ${created.key}`,
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            balance: 7,
            accountBalance: { total: TOTAL, tier: TIER, paid: PAID },
        });
    });

    test("unbudgeted key with account:usage sees the account total", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const userId = await sessionUserId(sessionToken);
        await setAccountBalances(userId);

        const created = await createKey(sessionToken, {
            name: "usage-only",
            accountPermissions: ["usage"],
        });
        const res = await getBalance({
            Authorization: `Bearer ${created.key}`,
        });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            balance: TOTAL,
            accountBalance: { total: TOTAL, tier: TIER, paid: PAID },
        });
    });

    test("unbudgeted key without account:usage is 403", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const created = await createApiKeyViaApi(sessionToken, {
            name: "no-scope-no-budget",
        });
        const res = await getBalance({
            Authorization: `Bearer ${created.key}`,
        });
        expect(res.status).toBe(403);
    });

    test("publishable key with a zero budget does not leak accountBalance", async ({
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");
        const userId = await sessionUserId(sessionToken);
        await setAccountBalances(userId);

        const created = await createApiKeyViaApi(sessionToken, {
            name: "raw-pk",
            type: "publishable",
        });
        const res = await getBalance({
            Authorization: `Bearer ${created.key}`,
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as BalanceBody;
        expect(body.balance).toBe(0);
        expect(body.accountBalance).toBeUndefined();
    });
});
