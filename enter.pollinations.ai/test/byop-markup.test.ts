import { env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, test } from "vitest";
import {
    BYOP_MARKUP_PCT,
    computeBilledPrice,
    computeCreatorCredit,
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
    resolveCreatorMarkup,
} from "@/utils/track-helpers.ts";

describe("BYOP markup", () => {
    describe("computeCreatorCredit", () => {
        test("returns baseline × markup for positive prices", () => {
            expect(computeCreatorCredit(1)).toBeCloseTo(BYOP_MARKUP_PCT, 10);
            expect(computeCreatorCredit(4)).toBeCloseTo(
                4 * BYOP_MARKUP_PCT,
                10,
            );
        });

        test("returns 0 for zero or negative prices", () => {
            expect(computeCreatorCredit(0)).toBe(0);
            expect(computeCreatorCredit(-1)).toBe(0);
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

    describe("resolveCreatorMarkup", () => {
        test("returns null when clientId missing", async () => {
            const db = drizzle(env.DB);
            expect(await resolveCreatorMarkup(db, undefined, 1)).toBeNull();
            expect(await resolveCreatorMarkup(db, "", 1)).toBeNull();
        });

        test("returns null when baseline price is 0", async () => {
            const db = drizzle(env.DB);
            expect(
                await resolveCreatorMarkup(db, "pk_doesnotexist", 0),
            ).toBeNull();
        });

        test("returns null when pk_ row doesn't exist", async () => {
            const db = drizzle(env.DB);
            expect(
                await resolveCreatorMarkup(db, "pk_doesnotexist", 1),
            ).toBeNull();
        });

        test("returns markup resolution when pk_ row exists", async () => {
            const db = drizzle(env.DB);
            const creatorId = "test-creator-resolve";
            const pkId = "pk_test_resolve";

            await db
                .insert(userTable)
                .values({
                    id: creatorId,
                    email: `${creatorId}@test.com`,
                    name: creatorId,
                    tier: "spore",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoNothing();

            await db
                .insert(apikeyTable)
                .values({
                    id: pkId,
                    userId: creatorId,
                    name: "test-app",
                    key: `hashed-${pkId}`,
                    enabled: true,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoNothing();

            const result = await resolveCreatorMarkup(db, pkId, 4);
            expect(result).not.toBeNull();
            expect(result?.creatorUserId).toBe(creatorId);
            expect(result?.creatorCredit).toBeCloseTo(4 * BYOP_MARKUP_PCT, 10);
            expect(result?.markupPct).toBe(BYOP_MARKUP_PCT);
        });
    });

    describe("atomicCreditUserBalance (creator bucket)", () => {
        test("credits creator_balance; ok=true", async () => {
            const db = drizzle(env.DB);
            const userId = "test-creator-credit";
            await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: userId,
                tier: "spore",
                creatorBalance: 5,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const { ok, newBalance } = await atomicCreditUserBalance(
                db,
                userId,
                "creator",
                2,
            );
            expect(ok).toBe(true);
            expect(newBalance).toBe(7);
            expect((await getUserBalances(db, userId)).creatorBalance).toBe(7);
        });

        test("missing user → ok=false", async () => {
            const db = drizzle(env.DB);
            const { ok, newBalance } = await atomicCreditUserBalance(
                db,
                "user-does-not-exist",
                "creator",
                1,
            );
            expect(ok).toBe(false);
            expect(newBalance).toBeNull();
        });
    });

    describe("deduction priority with creator_balance", () => {
        test("spends tier → creator → crypto → pack", async () => {
            const db = drizzle(env.DB);
            const userId = "test-priority-creator";

            await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: userId,
                tier: "flower",
                tierBalance: 2,
                creatorBalance: 3,
                cryptoBalance: 5,
                packBalance: 10,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // 1 from tier (tier positive)
            await atomicDeductUserBalance(db, userId, 1);
            let b = await getUserBalances(db, userId);
            expect(b.tierBalance).toBe(1);
            expect(b.creatorBalance).toBe(3);

            // Drain tier, then next goes to creator
            await atomicDeductUserBalance(db, userId, 1); // tier → 0
            await atomicDeductUserBalance(db, userId, 2); // creator → 1 (tier 0 → goes negative)
            b = await getUserBalances(db, userId);
            // tier CASE: paid balance > 0, tier ≤ 0 → tier unchanged
            expect(b.tierBalance).toBe(0);
            expect(b.creatorBalance).toBe(1);
            expect(b.cryptoBalance).toBe(5);
            expect(b.packBalance).toBe(10);

            // Drain creator, then crypto
            await atomicDeductUserBalance(db, userId, 1); // creator → 0
            await atomicDeductUserBalance(db, userId, 2); // crypto → 3
            b = await getUserBalances(db, userId);
            expect(b.creatorBalance).toBe(0);
            expect(b.cryptoBalance).toBe(3);

            // Drain crypto, then pack
            await atomicDeductUserBalance(db, userId, 3); // crypto → 0
            await atomicDeductUserBalance(db, userId, 4); // pack → 6
            b = await getUserBalances(db, userId);
            expect(b.cryptoBalance).toBe(0);
            expect(b.packBalance).toBe(6);
        });
    });

    describe("handleBalanceDeduction — BYOP markup", () => {
        async function setupPayerAndCreator() {
            const db = drizzle(env.DB);
            const payerId = "test-payer-markup";
            const creatorId = "test-creator-markup";
            const pkId = "pk_markup_test";

            await db
                .delete(userTable)
                .where(sql`${userTable.id} IN (${payerId}, ${creatorId})`);
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
                    creatorBalance: 0,
                    cryptoBalance: 0,
                    packBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: creatorId,
                    email: `${creatorId}@test.com`,
                    name: creatorId,
                    tier: "spore",
                    creatorBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

            await db.insert(apikeyTable).values({
                id: pkId,
                userId: creatorId,
                name: "markup-app",
                key: `hashed-${pkId}`,
                enabled: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            return { db, payerId, creatorId, pkId };
        }

        test("non-BYOP request: bills baseline, no creator credit", async () => {
            const { db, payerId, creatorId } = await setupPayerAndCreator();

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
            expect((await getUserBalances(db, creatorId)).creatorBalance).toBe(
                0,
            );
        });

        test("BYOP request: bills baseline+markup, credits creator_balance", async () => {
            const { db, payerId, creatorId, pkId } =
                await setupPayerAndCreator();

            const { markup } = await handleBalanceDeduction({
                db,
                isBilledUsage: true,
                totalPrice: 1,
                userId: payerId,
                apiKeyClientId: pkId,
            });

            expect(markup).not.toBeNull();
            expect(markup?.creatorUserId).toBe(creatorId);
            expect(markup?.creatorCredit).toBeCloseTo(BYOP_MARKUP_PCT, 10);

            // Payer loses baseline + markup from tier_balance
            expect(
                (await getUserBalances(db, payerId)).tierBalance,
            ).toBeCloseTo(2 - 1 - BYOP_MARKUP_PCT, 10);

            // Creator's creator_balance (not pack_balance) gets the markup
            const creator = await getUserBalances(db, creatorId);
            expect(creator.creatorBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
            expect(creator.packBalance).toBe(0);
        });

        test("self-dealing: creator == payer still gets markup credited", async () => {
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
                creatorBalance: 0,
                cryptoBalance: 0,
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
            // Net: -1 - markup from tier, +markup to creator (tier → creator conversion)
            expect(b.tierBalance).toBeCloseTo(2 - 1 - BYOP_MARKUP_PCT, 10);
            expect(b.creatorBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
        });

        test("cache hit / unbilled: no credit, no deduction", async () => {
            const { db, payerId, creatorId, pkId } =
                await setupPayerAndCreator();

            const { markup } = await handleBalanceDeduction({
                db,
                isBilledUsage: false,
                totalPrice: 1,
                userId: payerId,
                apiKeyClientId: pkId,
            });

            expect(markup).toBeNull();
            expect((await getUserBalances(db, payerId)).tierBalance).toBe(2);
            expect((await getUserBalances(db, creatorId)).creatorBalance).toBe(
                0,
            );
        });

        test("unknown pk_: markup=null, payer billed baseline only", async () => {
            // Sk_ carries a clientId that resolves to no pk_ row.
            // resolveCreatorMarkup returns null, no markup is levied, payer
            // pays baseline. Event will record creator_credit=0.
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
    });
});
