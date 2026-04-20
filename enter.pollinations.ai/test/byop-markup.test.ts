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
    atomicCreditCreatorPack,
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

        test("returns 0 for zero or negative prices (error paths)", () => {
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
                    packBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: { packBalance: 0 },
                });

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

    describe("atomicCreditCreatorPack", () => {
        test("adds to existing pack_balance", async () => {
            const db = drizzle(env.DB);
            const userId = "test-creditor-add";
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: `${userId}@test.com`,
                    name: userId,
                    tier: "spore",
                    packBalance: 5,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: { packBalance: 5 },
                });

            await atomicCreditCreatorPack(db, userId, 2);

            const balances = await getUserBalances(db, userId);
            expect(balances.packBalance).toBe(7);
        });

        test("no-op for zero or negative amounts", async () => {
            const db = drizzle(env.DB);
            const userId = "test-creditor-noop";
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: `${userId}@test.com`,
                    name: userId,
                    tier: "spore",
                    packBalance: 3,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: { packBalance: 3 },
                });

            await atomicCreditCreatorPack(db, userId, 0);
            await atomicCreditCreatorPack(db, userId, -5);

            const balances = await getUserBalances(db, userId);
            expect(balances.packBalance).toBe(3);
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
                    packBalance: 0,
                    cryptoBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: creatorId,
                    email: `${creatorId}@test.com`,
                    name: creatorId,
                    tier: "spore",
                    packBalance: 0,
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
            const payer = await getUserBalances(db, payerId);
            expect(payer.tierBalance).toBeCloseTo(2 - 0.5, 10);
            const creator = await getUserBalances(db, creatorId);
            expect(creator.packBalance).toBe(0);
        });

        test("BYOP request: bills baseline+markup, credits creator", async () => {
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

            const payer = await getUserBalances(db, payerId);
            // Payer loses baseline + markup = 1.25 from tier_balance (2 - 1.25)
            expect(payer.tierBalance).toBeCloseTo(2 - 1 - BYOP_MARKUP_PCT, 10);

            const creator = await getUserBalances(db, creatorId);
            expect(creator.packBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
        });

        test("self-dealing allowed: creator == payer gets markup credited", async () => {
            const db = drizzle(env.DB);
            const userId = "test-self-deal";
            const pkId = "pk_self_deal";

            await db.delete(userTable).where(sql`${userTable.id} = ${userId}`);
            await db.delete(apikeyTable).where(sql`${apikeyTable.id} = ${pkId}`);

            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: userId,
                tier: "flower",
                tierBalance: 2,
                packBalance: 0,
                cryptoBalance: 0,
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

            const balances = await getUserBalances(db, userId);
            // Net: -1 - 0.25 tier, +0.25 pack (tier→pack conversion of markup)
            expect(balances.tierBalance).toBeCloseTo(2 - 1 - BYOP_MARKUP_PCT, 10);
            expect(balances.packBalance).toBeCloseTo(BYOP_MARKUP_PCT, 10);
        });

        test("no creator credit on cache hit / unbilled", async () => {
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
            const payer = await getUserBalances(db, payerId);
            expect(payer.tierBalance).toBe(2);
            const creator = await getUserBalances(db, creatorId);
            expect(creator.packBalance).toBe(0);
        });
    });
});
