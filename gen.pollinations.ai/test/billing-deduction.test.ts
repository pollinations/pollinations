import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { atomicDeductUserBalance } from "@shared/billing/deduction.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
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
        const model = getRegistryModelDefinition(modelResolved);
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
});
