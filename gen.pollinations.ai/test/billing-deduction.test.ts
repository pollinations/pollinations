import { env } from "cloudflare:test";
import {
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    getUserBalances,
    identifyDeductionSource,
} from "@shared/billing/deduction.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

const db = drizzle(env.DB);

async function createUser({
    tierBalance,
    devBalance = 0,
    packBalance,
}: {
    tierBalance: number;
    devBalance?: number;
    packBalance: number;
}) {
    const userId = `billing-${crypto.randomUUID()}`;
    await db.insert(userTable).values({
        id: userId,
        email: `${userId}@test.local`,
        name: "Billing Test User",
        tier: "flower",
        tierBalance,
        devBalance,
        packBalance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return userId;
}

describe("billing deduction", () => {
    it("identifies the single bucket a regular generation charge will use", () => {
        expect(
            identifyDeductionSource(
                { tierBalance: 5, devBalance: 0, packBalance: 5 },
                7,
            ),
        ).toEqual({
            fromTier: 7,
            fromDev: 0,
            fromPack: 0,
        });
        expect(
            identifyDeductionSource(
                { tierBalance: 0, devBalance: 8, packBalance: 5 },
                5,
            ),
        ).toEqual({
            fromTier: 0,
            fromDev: 5,
            fromPack: 0,
        });
        expect(
            identifyDeductionSource(
                { tierBalance: 0, devBalance: 0, packBalance: 8 },
                5,
            ),
        ).toEqual({
            fromTier: 0,
            fromDev: 0,
            fromPack: 5,
        });
        expect(
            identifyDeductionSource(
                { tierBalance: -3, devBalance: 0, packBalance: 0 },
                4,
            ),
        ).toEqual({
            fromTier: 4,
            fromDev: 0,
            fromPack: 0,
        });
        expect(
            identifyDeductionSource(
                { tierBalance: -3, devBalance: 0, packBalance: 2 },
                4,
            ),
        ).toEqual({
            fromTier: 0,
            fromDev: 0,
            fromPack: 4,
        });
    });

    it("deducts regular generation charges from tier before paid pack balance", async () => {
        const userId = await createUser({ tierBalance: 5, packBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 2,
            devBalance: 0,
            packBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 4);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: -2,
            devBalance: 0,
            packBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 5);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: -2,
            devBalance: 0,
            packBalance: 5,
        });
    });

    it("deducts regular generation charges from dev before pack after tier runs out", async () => {
        const userId = await createUser({
            tierBalance: 0,
            devBalance: 3,
            packBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 2);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 0,
            devBalance: 1,
            packBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 4);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 0,
            devBalance: -3,
            packBalance: 10,
        });
    });

    it("keeps paid pack balance untouched when the user has no positive pack balance", async () => {
        const userId = await createUser({ tierBalance: 0, packBalance: 0 });

        await atomicDeductUserBalance(db, userId, 3);

        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: -3,
            devBalance: 0,
            packBalance: 0,
        });
    });

    it("deducts paid-only generation charges only from paid pack balance", async () => {
        const userId = await createUser({
            tierBalance: 10,
            devBalance: 7,
            packBalance: 5,
        });

        await atomicDeductPaidBalance(db, userId, 2);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 10,
            devBalance: 7,
            packBalance: 3,
        });

        await atomicDeductPaidBalance(db, userId, 4);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 10,
            devBalance: 7,
            packBalance: -1,
        });
    });

    it("keeps regular and paid-only deductions independent in sequence", async () => {
        const userId = await createUser({ tierBalance: 5, packBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        await atomicDeductPaidBalance(db, userId, 4);
        await atomicDeductUserBalance(db, userId, 6);

        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: -4,
            devBalance: 0,
            packBalance: 6,
        });
    });
});
