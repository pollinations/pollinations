import { env } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { atomicDeductUserBalance } from "@shared/billing/deduction.ts";
import { atomicDeductOrganizationBalance } from "@shared/billing/organization-deduction.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import {
    organization as organizationTable,
    user as userTable,
} from "@shared/db/better-auth.ts";
import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
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
        tierBalance,
        packBalance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return userId;
}

async function createOrganization({
    packBalance,
    ownerUserId,
}: {
    packBalance: number;
    ownerUserId: string;
}) {
    const organizationId = `org-${crypto.randomUUID()}`;
    await db.insert(organizationTable).values({
        id: organizationId,
        name: "Billing Test Org",
        ownerUserId,
        packBalance,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    return organizationId;
}

async function getOrganizationPackBalance(organizationId: string) {
    const [row] = await db
        .select({ packBalance: organizationTable.packBalance })
        .from(organizationTable)
        .where(eq(organizationTable.id, organizationId));
    return row?.packBalance ?? null;
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

    it("handles concurrent regular deductions without lost updates", async () => {
        const userId = await createUser({ tierBalance: 20, packBalance: 40 });

        const results = await Promise.all(
            Array.from({ length: 10 }, () =>
                atomicDeductUserBalance(db, userId, 5),
            ),
        );

        expect(results.every((result) => result.ok)).toBe(true);
        expect(await getUserBalance(db, userId)).toEqual({
            tierBalance: 0,
            packBalance: 10,
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
            modelPaidOnly: model.paidOnly,
        });
        let balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBeCloseTo(0.01, 10);
        expect(balance.packBalance).toBeCloseTo(0, 10);

        await handleBalanceDeduction({
            db,
            isBilledUsage: true,
            totalPrice: 0.01,
            userId,
            modelPaidOnly: model.paidOnly,
        });
        balance = await getUserBalance(db, userId);
        expect(balance.tierBalance).toBeCloseTo(0.01, 10);
        expect(balance.packBalance).toBeCloseTo(-0.01, 10);
    });

    describe("organization-owned key spend", () => {
        it("atomicDeductOrganizationBalance deducts pack balance directly, with no tier bucket", async () => {
            const ownerUserId = await createUser({
                tierBalance: 0,
                packBalance: 0,
            });
            const organizationId = await createOrganization({
                packBalance: 10,
                ownerUserId,
            });

            const result = await atomicDeductOrganizationBalance(
                db,
                organizationId,
                4,
            );
            expect(result).toEqual({ ok: true, packBalance: 6 });
            expect(await getOrganizationPackBalance(organizationId)).toBe(6);
        });

        it("handleBalanceDeduction with organizationId deducts the org's balance and leaves the creating member's balance untouched", async () => {
            const creatorUserId = await createUser({
                tierBalance: 100,
                packBalance: 100,
            });
            const organizationId = await createOrganization({
                packBalance: 10,
                ownerUserId: creatorUserId,
            });

            const deduction = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 3,
                // The creating member is still passed through for
                // attribution (matches what track.ts does), but must not be
                // charged when organizationId is present.
                userId: creatorUserId,
                organizationId,
            });

            expect(deduction.payerBucket).toBe("pack");
            expect(deduction.postDeductionPackBalance).toBe(7);
            expect(await getOrganizationPackBalance(organizationId)).toBe(7);

            const creatorBalance = await getUserBalance(db, creatorUserId);
            expect(creatorBalance).toEqual({
                tierBalance: 100,
                packBalance: 100,
            });
        });

        it("allows the organization's pack balance to go negative on overage, same as user pack-only overage today", async () => {
            const ownerUserId = await createUser({
                tierBalance: 0,
                packBalance: 0,
            });
            const organizationId = await createOrganization({
                packBalance: 2,
                ownerUserId,
            });

            await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 5,
                userId: ownerUserId,
                organizationId,
            });

            expect(await getOrganizationPackBalance(organizationId)).toBe(-3);
        });
    });
});
