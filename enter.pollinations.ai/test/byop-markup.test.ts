import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, test } from "vitest";
import {
    BYOP_MARKUP_PCT,
    computeBilledPrice,
    computeDevCredit,
} from "@/billing-config.ts";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@/db/schema/better-auth.ts";
import {
    atomicCreditUserBalance,
    atomicDeductUserBalance,
    getUserBalances,
} from "@/utils/balance-deduction.ts";
import {
    handleBalanceDeduction,
    resolveDevMarkup,
} from "@/utils/track-helpers.ts";

describe("BYOP markup", () => {
    describe("computeDevCredit", () => {
        test("returns baseline × markup for positive prices", () => {
            expect(computeDevCredit(1)).toBeCloseTo(BYOP_MARKUP_PCT, 10);
            expect(computeDevCredit(4)).toBeCloseTo(4 * BYOP_MARKUP_PCT, 10);
        });

        test("returns 0 for zero or negative prices", () => {
            expect(computeDevCredit(0)).toBe(0);
            expect(computeDevCredit(-1)).toBe(0);
        });
    });

    describe("computeBilledPrice", () => {
        test("billed = baseline + credit", () => {
            expect(computeBilledPrice(1)).toBeCloseTo(1 + BYOP_MARKUP_PCT, 10);
            expect(computeBilledPrice(4)).toBeCloseTo(
                4 * (1 + BYOP_MARKUP_PCT),
                10,
            );
        });
    });

    describe("resolveDevMarkup", () => {
        test("returns null when clientId missing", async () => {
            const db = drizzle(env.DB);
            expect(await resolveDevMarkup(db, undefined, 1)).toBeNull();
            expect(await resolveDevMarkup(db, "", 1)).toBeNull();
        });

        test("returns null when baseline price is 0", async () => {
            const db = drizzle(env.DB);
            expect(await resolveDevMarkup(db, "pk_doesnotexist", 0)).toBeNull();
        });

        test("returns null when pk_ row doesn't exist", async () => {
            const db = drizzle(env.DB);
            expect(await resolveDevMarkup(db, "pk_doesnotexist", 1)).toBeNull();
        });

        test("returns markup resolution when pk_ row exists", async () => {
            const db = drizzle(env.DB);
            const devId = "test-creator-resolve";
            const pkId = "pk_test_resolve";

            await db
                .insert(userTable)
                .values({
                    id: devId,
                    email: `${devId}@test.com`,
                    name: devId,
                    tier: "spore",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoNothing();

            await db
                .insert(apikeyTable)
                .values({
                    id: pkId,
                    userId: devId,
                    name: "test-app",
                    key: `hashed-${pkId}`,
                    enabled: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoNothing();

            const result = await resolveDevMarkup(db, pkId, 4);
            expect(result).not.toBeNull();
            expect(result?.devUserId).toBe(devId);
            expect(result?.devCredit).toBeCloseTo(4 * BYOP_MARKUP_PCT, 10);
            expect(result?.markupPct).toBe(BYOP_MARKUP_PCT);
        });
    });

    describe("atomicCreditUserBalance (dev bucket)", () => {
        test("credits dev_balance; ok=true", async () => {
            const db = drizzle(env.DB);
            const userId = "test-creator-credit";
            await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: userId,
                tier: "spore",
                devBalance: 5,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const { ok, newBalance } = await atomicCreditUserBalance(
                db,
                userId,
                "dev",
                2,
            );
            expect(ok).toBe(true);
            expect(newBalance).toBe(7);
            expect((await getUserBalances(db, userId)).devBalance).toBe(7);
        });

        test("missing user → ok=false", async () => {
            const db = drizzle(env.DB);
            const { ok, newBalance } = await atomicCreditUserBalance(
                db,
                "user-does-not-exist",
                "dev",
                1,
            );
            expect(ok).toBe(false);
            expect(newBalance).toBeNull();
        });
    });

    describe("deduction priority with dev_balance", () => {
        test("spends tier → dev → pack", async () => {
            const db = drizzle(env.DB);
            const userId = "test-priority-creator";

            await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: userId,
                tier: "flower",
                tierBalance: 2,
                devBalance: 3,
                packBalance: 10,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // 1 from tier (tier positive)
            await atomicDeductUserBalance(db, userId, 1);
            let b = await getUserBalances(db, userId);
            expect(b.tierBalance).toBe(1);
            expect(b.devBalance).toBe(3);

            // Drain tier, then next goes to dev
            await atomicDeductUserBalance(db, userId, 1); // tier → 0
            await atomicDeductUserBalance(db, userId, 2); // dev → 1 (tier 0 → goes negative)
            b = await getUserBalances(db, userId);
            // tier CASE: paid balance > 0, tier ≤ 0 → tier unchanged
            expect(b.tierBalance).toBe(0);
            expect(b.devBalance).toBe(1);
            expect(b.packBalance).toBe(10);

            // Drain dev, then pack
            await atomicDeductUserBalance(db, userId, 1); // dev → 0
            await atomicDeductUserBalance(db, userId, 4); // pack → 6
            b = await getUserBalances(db, userId);
            expect(b.devBalance).toBe(0);
            expect(b.packBalance).toBe(6);
        });
    });

    describe("handleBalanceDeduction — BYOP markup", () => {
        async function setupPayerAndDev() {
            const db = drizzle(env.DB);
            const payerId = "test-payer-markup";
            const devId = "test-creator-markup";
            const pkId = "pk_markup_test";

            await db
                .delete(userTable)
                .where(sql`${userTable.id} IN (${payerId}, ${devId})`);
            await db
                .delete(apikeyTable)
                .where(sql`${apikeyTable.id} = ${pkId}`);

            await db.insert(userTable).values([
                {
                    id: payerId,
                    email: `${payerId}@test.com`,
                    name: payerId,
                    tier: "flower",
                    tierBalance: 2,
                    devBalance: 0,
                    packBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: devId,
                    email: `${devId}@test.com`,
                    name: devId,
                    tier: "spore",
                    devBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

            await db.insert(apikeyTable).values({
                id: pkId,
                userId: devId,
                name: "markup-app",
                key: `hashed-${pkId}`,
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            return { db, payerId, devId, pkId };
        }

        test("non-BYOP request: bills baseline, no dev credit", async () => {
            const { db, payerId, devId } = await setupPayerAndDev();

            const { markup } = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 0.5,
                userId: payerId,
                apiKeyClientId: undefined,
            });

            expect(markup).toBeNull();
            expect(
                (await getUserBalances(db, payerId)).tierBalance,
            ).toBeCloseTo(2 - 0.5, 10);
            expect((await getUserBalances(db, devId)).devBalance).toBe(0);
        });

        test("BYOP request: bills baseline+markup, credits dev_balance", async () => {
            const { db, payerId, devId, pkId } = await setupPayerAndDev();

            const { markup } = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: payerId,
                apiKeyClientId: pkId,
            });

            expect(markup).not.toBeNull();
            expect(markup?.devUserId).toBe(devId);
            expect(markup?.devCredit).toBeCloseTo(BYOP_MARKUP_PCT, 10);

            // Payer loses baseline + markup from tier_balance
            expect(
                (await getUserBalances(db, payerId)).tierBalance,
            ).toBeCloseTo(2 - 1 - BYOP_MARKUP_PCT, 10);

            // Dev's dev_balance (not pack_balance) gets the markup
            const dev = await getUserBalances(db, devId);
            expect(dev.devBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
            expect(dev.packBalance).toBe(0);
        });

        test("self-dealing: dev == payer still gets markup credited", async () => {
            const db = drizzle(env.DB);
            const userId = "test-self-deal";
            const pkId = "pk_self_deal";

            await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
            await db
                .delete(apikeyTable)
                .where(sql`${apikeyTable.id} = ${pkId}`);

            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: userId,
                tier: "flower",
                tierBalance: 2,
                devBalance: 0,
                packBalance: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            await db.insert(apikeyTable).values({
                id: pkId,
                userId,
                name: "self-deal-app",
                key: `hashed-${pkId}`,
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId,
                apiKeyClientId: pkId,
            });

            const b = await getUserBalances(db, userId);
            // Net: -1 - markup from tier, +markup to dev (tier → dev conversion)
            expect(b.tierBalance).toBeCloseTo(2 - 1 - BYOP_MARKUP_PCT, 10);
            expect(b.devBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
        });

        test("cache hit / unbilled: no credit, no deduction", async () => {
            const { db, payerId, devId, pkId } = await setupPayerAndDev();

            const { markup } = await handleBalanceDeduction({
                db,
                isBilledUsage: false,
                totalPrice: 1,
                userId: payerId,
                apiKeyClientId: pkId,
            });

            expect(markup).toBeNull();
            expect((await getUserBalances(db, payerId)).tierBalance).toBe(2);
            expect((await getUserBalances(db, devId)).devBalance).toBe(0);
        });

        test("unknown pk_: markup=null, payer billed baseline only", async () => {
            // Sk_ carries a clientId that resolves to no pk_ row.
            // resolveDevMarkup returns null, no markup is levied, payer
            // pays baseline. Event will record dev_credit=0.
            const db = drizzle(env.DB);
            const payerId = "test-payer-unknown-pk";

            await db.delete(userTable).where(sql`${userTable.id} = ${payerId}`);
            await db.insert(userTable).values({
                id: payerId,
                email: `${payerId}@test.com`,
                name: payerId,
                tier: "flower",
                tierBalance: 2,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const { markup } = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: payerId,
                apiKeyClientId: "pk_nonexistent_creator",
            });

            expect(markup).toBeNull();
            expect(
                (await getUserBalances(db, payerId)).tierBalance,
            ).toBeCloseTo(2 - 1, 10);
        });

        test("reverts dev credit when payer deduction fails", async () => {
            const { db, devId, pkId } = await setupPayerAndDev();

            await expect(
                handleBalanceDeduction({
                    db,
                    isBilledUsage: true,
                    totalPrice: 1,
                    userId: "missing-payer-row",
                    apiKeyClientId: pkId,
                }),
            ).rejects.toThrow(/affected 0 rows/);

            expect((await getUserBalances(db, devId)).devBalance).toBe(0);
        });
    });
});
