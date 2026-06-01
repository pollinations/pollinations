import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    atomicDeductApiKeyBalance,
    atomicDeductUserBalance,
} from "@shared/billing/deduction.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

const db = drizzle(env.DB);

async function createUser({
    tierBalance,
    packBalance,
}: {
    tierBalance: number;
    packBalance: number;
}) {
    const userId = `billing-${crypto.randomUUID()}`;
    await db.insert(userTable).values({
        id: userId,
        email: `${userId}@test.local`,
        name: "Billing Test User",
        tier: "flower",
        tierBalance,
        packBalance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return userId;
}

async function createApiKeyBudget(balance: number | null) {
    const userId = await createUser({ tierBalance: 10, packBalance: 10 });
    const keyId = `apikey-budget-${crypto.randomUUID()}`;
    await db.insert(apikeyTable).values({
        id: keyId,
        name: "Budget Test Key",
        start: "sk-test",
        prefix: "sk",
        key: `sk-test-${crypto.randomUUID()}`,
        userId,
        enabled: true,
        metadata: JSON.stringify({ keyType: "secret" }),
        pollenBalance: balance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return { keyId, userId };
}

async function getApiKeyBudget(keyId: string) {
    const [row] = await db
        .select({ pollenBalance: apikeyTable.pollenBalance })
        .from(apikeyTable)
        .where(eq(apikeyTable.id, keyId))
        .limit(1);
    return row?.pollenBalance;
}

describe("billing deduction", () => {
    it("deducts regular generation charges from tier, then positive pack, with empty-pack overage on tier", async () => {
        const userId = await createUser({ tierBalance: 5, packBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 4);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: 6,
        });

        await atomicDeductUserBalance(db, userId, 10);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: -4,
        });
    });

    it("uses tier debt when neither bucket covers a regular charge", async () => {
        const userId = await createUser({ tierBalance: 0, packBalance: 0 });

        await atomicDeductUserBalance(db, userId, 3);

        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: -3,
            packBalance: 0,
        });
    });

    it("deducts paid-only generation charges only from paid pack balance", async () => {
        const userId = await createUser({
            tierBalance: 10,
            packBalance: 5,
        });

        await atomicDeductUserBalance(db, userId, 2, true);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 10,
            packBalance: 3,
        });

        await atomicDeductUserBalance(db, userId, 4, true);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 10,
            packBalance: -1,
        });
    });

    it("keeps regular and paid-only deductions independent in sequence", async () => {
        const userId = await createUser({ tierBalance: 5, packBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        await atomicDeductUserBalance(db, userId, 4, true);
        await atomicDeductUserBalance(db, userId, 6);

        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: 0,
        });
    });

    it("deducts an Azure paid-only model only from pack balance", async () => {
        const modelResolved = "llama-maverick";
        const model = getModelDefinition(modelResolved);
        expect(model.provider).toBe("azure");
        expect(model.paidOnly).toBe(true);

        const userId = await createUser({
            tierBalance: 0.01,
            packBalance: 0.01,
        });

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 0.01,
            userId,
            modelResolved,
        });
        let balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBeCloseTo(0.01, 10);
        expect(balance.packBalance).toBeCloseTo(0, 10);

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 0.01,
            userId,
            modelResolved,
        });
        balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBeCloseTo(0.01, 10);
        expect(balance.packBalance).toBeCloseTo(-0.01, 10);
    });

    it("does not let finite API key budgets go negative", async () => {
        const { keyId } = await createApiKeyBudget(1);

        await expect(
            atomicDeductApiKeyBalance(db, keyId, 0.75),
        ).resolves.toEqual({ ok: true });
        expect(await getApiKeyBudget(keyId)).toBeCloseTo(0.25, 10);

        await expect(
            atomicDeductApiKeyBalance(db, keyId, 0.5),
        ).resolves.toEqual({ ok: false });
        expect(await getApiKeyBudget(keyId)).toBeCloseTo(0.25, 10);
    });

    it("keeps unlimited API key budgets untouched", async () => {
        const { keyId } = await createApiKeyBudget(null);

        await expect(atomicDeductApiKeyBalance(db, keyId, 1)).resolves.toEqual({
            ok: false,
        });
        expect(await getApiKeyBudget(keyId)).toBeNull();
    });

    it("does not debit user balance when finite API key budget settlement fails", async () => {
        const { keyId, userId } = await createApiKeyBudget(0.25);

        await expect(
            handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 0.5,
                userId,
                apiKeyId: keyId,
                apiKeyPollenBalance: 0.25,
            }),
        ).rejects.toThrow(/API key budget deduction affected 0 rows/);

        expect(await getApiKeyBudget(keyId)).toBeCloseTo(0.25, 10);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 10,
            packBalance: 10,
        });
    });
});
