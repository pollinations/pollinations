import { env } from "cloudflare:test";
import {
    atomicDeductUserBalance,
    getUserBalances,
} from "@shared/billing/deduction.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

const db = drizzle(env.DB);

async function createUser({
    rewardBalance,
    paidBalance,
}: {
    rewardBalance: number;
    paidBalance: number;
}) {
    const userId = `billing-${crypto.randomUUID()}`;
    await db.insert(userTable).values({
        id: userId,
        email: `${userId}@test.local`,
        name: "Billing Test User",
        tier: "flower",
        tierBalance: rewardBalance,
        packBalance: paidBalance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return userId;
}

describe("billing deduction", () => {
    it("deducts regular generation charges from reward, then positive paid, with empty-paid overage on reward", async () => {
        const userId = await createUser({ rewardBalance: 5, paidBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: 2,
            paidBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 4);
        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: 2,
            paidBalance: 6,
        });

        await atomicDeductUserBalance(db, userId, 10);
        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: 2,
            paidBalance: -4,
        });
    });

    it("uses reward debt when neither bucket covers a regular charge", async () => {
        const userId = await createUser({ rewardBalance: 0, paidBalance: 0 });

        await atomicDeductUserBalance(db, userId, 3);

        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: -3,
            paidBalance: 0,
        });
    });

    it("deducts paid-only generation charges only from paid balance", async () => {
        const userId = await createUser({
            rewardBalance: 10,
            paidBalance: 5,
        });

        await atomicDeductUserBalance(db, userId, 2, true);
        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: 10,
            paidBalance: 3,
        });

        await atomicDeductUserBalance(db, userId, 4, true);
        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: 10,
            paidBalance: -1,
        });
    });

    it("keeps regular and paid-only deductions independent in sequence", async () => {
        const userId = await createUser({ rewardBalance: 5, paidBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        await atomicDeductUserBalance(db, userId, 4, true);
        await atomicDeductUserBalance(db, userId, 6);

        expect(await getUserBalances(db, userId)).toEqual({
            rewardBalance: 2,
            paidBalance: 0,
        });
    });

    it("deducts an Azure paid-only model only from paid balance", async () => {
        const modelResolved = "llama-maverick";
        const model = getModelDefinition(modelResolved);
        expect(model.provider).toBe("azure");
        expect(model.paidOnly).toBe(true);

        const userId = await createUser({
            rewardBalance: 0.01,
            paidBalance: 0.01,
        });

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 0.01,
            userId,
            modelResolved,
        });
        let balance = await getUserBalances(db, userId);
        expect(balance.rewardBalance).toBeCloseTo(0.01, 10);
        expect(balance.paidBalance).toBeCloseTo(0, 10);

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 0.01,
            userId,
            modelResolved,
        });
        balance = await getUserBalances(db, userId);
        expect(balance.rewardBalance).toBeCloseTo(0.01, 10);
        expect(balance.paidBalance).toBeCloseTo(-0.01, 10);
    });
});
