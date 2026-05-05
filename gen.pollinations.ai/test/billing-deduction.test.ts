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
    it("identifies regular generation charges as one bucket", () => {
        expect(
            identifyDeductionSource({ tierBalance: 5, packBalance: 5 }, 4),
        ).toEqual({
            fromTier: 4,
            fromPack: 0,
        });
        expect(
            identifyDeductionSource({ tierBalance: 5, packBalance: 5 }, 7),
        ).toEqual({
            fromTier: 0,
            fromPack: 7,
        });
        expect(
            identifyDeductionSource({ tierBalance: 0, packBalance: 8 }, 5),
        ).toEqual({
            fromTier: 0,
            fromPack: 5,
        });
        expect(
            identifyDeductionSource({ tierBalance: -3, packBalance: 0 }, 4),
        ).toEqual({
            fromTier: 0,
            fromPack: 4,
        });
        expect(
            identifyDeductionSource({ tierBalance: -3, packBalance: 2 }, 4),
        ).toEqual({
            fromTier: 0,
            fromPack: 4,
        });
    });

    it("deducts regular generation charges from tier only when tier covers the full charge", async () => {
        const userId = await createUser({ tierBalance: 5, packBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: 10,
        });

        await atomicDeductUserBalance(db, userId, 4);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: 6,
        });

        await atomicDeductUserBalance(db, userId, 10);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: -4,
        });
    });

    it("uses pack debt when tier cannot cover a regular charge", async () => {
        const userId = await createUser({ tierBalance: 0, packBalance: 0 });

        await atomicDeductUserBalance(db, userId, 3);

        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 0,
            packBalance: -3,
        });
    });

    it("deducts paid-only generation charges only from paid pack balance", async () => {
        const userId = await createUser({
            tierBalance: 10,
            packBalance: 5,
        });

        await atomicDeductPaidBalance(db, userId, 2);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 10,
            packBalance: 3,
        });

        await atomicDeductPaidBalance(db, userId, 4);
        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 10,
            packBalance: -1,
        });
    });

    it("keeps regular and paid-only deductions independent in sequence", async () => {
        const userId = await createUser({ tierBalance: 5, packBalance: 10 });

        await atomicDeductUserBalance(db, userId, 3);
        await atomicDeductPaidBalance(db, userId, 4);
        await atomicDeductUserBalance(db, userId, 6);

        expect(await getUserBalances(db, userId)).toEqual({
            tierBalance: 2,
            packBalance: 0,
        });
    });
});
