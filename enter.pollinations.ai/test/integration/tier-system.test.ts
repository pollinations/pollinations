import { createExecutionContext, env, SELF } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { atomicDeductUserBalance } from "@shared/billing/deduction.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { TIER_POLLEN, type TierName } from "@shared/tier-config.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Tier System End-to-End", () => {
    describe("Balance Deduction", () => {
        test("user exhausts tier balance and falls back to pack balance", async () => {
            const db = drizzle(env.DB);
            const _executionContext = createExecutionContext();
            const userId = "heavy-user";
            const tier: TierName = "flower";
            const tierPollen = TIER_POLLEN[tier];

            // User starts with flower tier allowance and bought a pack.
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "heavy@test.com",
                    name: "Heavy User",
                    tier,
                    tierBalance: tierPollen,
                    packBalance: 50,
                    lastTierGrant: Date.now() - 86400000, // Yesterday
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tier,
                        tierBalance: tierPollen,
                        packBalance: 50,
                        lastTierGrant: Date.now() - 86400000,
                    },
                });

            // Simulate heavy usage throughout the day
            const usagePattern = [3, 2, 4, 5, 2, 3, 1]; // Total: 20 pollen
            for (const amount of usagePattern) {
                await atomicDeductUserBalance(db, userId, amount);
            }

            // Check balance after usage
            const afterUsage = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            // Binary deduction: each charge is larger than tier, so pack pays
            // the full 20 pollen and tier remains available for smaller calls.
            expect(afterUsage[0]?.tierBalance).toBeCloseTo(tierPollen, 4);
            expect(afterUsage[0]?.packBalance).toBeCloseTo(30, 4);
        });
    });

    describe("Race Condition Protection", () => {
        test("concurrent API calls don't corrupt balance", async () => {
            const db = drizzle(env.DB);
            const userId = "concurrent-user";

            // Setup user with specific balance
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "concurrent@test.com",
                    name: "Concurrent User",
                    tier: "flower",
                    tierBalance: 20,
                    packBalance: 40,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 20,
                        packBalance: 40,
                    },
                });

            // Simulate 10 concurrent API calls, each deducting 5 pollen
            const concurrentDeductions = Array(10)
                .fill(null)
                .map(() => atomicDeductUserBalance(db, userId, 5));

            await Promise.all(concurrentDeductions);

            // Check final balance
            const finalBalance = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            // Total deducted: 50 pollen
            // Should have used: 20 from tier, 30 from pack
            expect(finalBalance[0]?.tierBalance).toBe(0);
            expect(finalBalance[0]?.packBalance).toBe(10);

            // Total remaining should be exactly 10
            const totalRemaining =
                (finalBalance[0]?.tierBalance ?? 0) +
                (finalBalance[0]?.packBalance ?? 0);
            expect(totalRemaining).toBe(10);
        });
    });

    describe("Balance Validation", () => {
        test("user cannot use service when all balances are depleted", async ({
            sessionToken,
        }) => {
            const db = drizzle(env.DB);

            // Get user ID from session
            const sessionResponse = await SELF.fetch(
                "http://localhost:3000/api/auth/get-session",
                {
                    headers: {
                        cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const session = await sessionResponse.json();
            const userId = session.user.id;

            // Set all balances to 0
            await db
                .update(userTable)
                .set({
                    tierBalance: 0,
                    packBalance: 0,
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Try to use the API
            const response = await SELF.fetch(
                "http://localhost:3000/api/customer/balance",
                {
                    headers: {
                        cookie: `better-auth.session_token=${sessionToken}`,
                    },
                },
            );

            // Should get balance info even with 0 balance
            expect(response.status).toBe(200);
            const balance = await response.json();
            expect(balance.tierBalance).toBe(0);
            expect(balance.packBalance).toBe(0);
        });
    });

    describe("Edge Cases", () => {
        test("tier balance is consumed before pack balance", async () => {
            const db = drizzle(env.DB);
            const userId = "tier-pack-user";

            // User with tier balance and pack purchase
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "tier-pack@test.com",
                    name: "Tier Pack User",
                    tier: "spore",
                    tierBalance: 1,
                    packBalance: 100,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 1,
                        packBalance: 100,
                    },
                });

            // Use 30 pollen — tier cannot cover the full charge, so pack pays it.
            await atomicDeductUserBalance(db, userId, 30);

            const balance = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            expect(balance[0]?.tierBalance).toBe(1);
            expect(balance[0]?.packBalance).toBe(70);
        });

        test("regular Azure model puts overage on positive pack when tier cannot cover actual price", async () => {
            const db = drizzle(env.DB);
            const userId = `azure-depletion-${crypto.randomUUID()}`;
            const modelResolved = "openai-fast";
            const model = getModelDefinition(modelResolved);

            expect(model.provider).toBe("azure");
            expect(model.paidOnly).not.toBe(true);

            await db.insert(userTable).values({
                id: userId,
                email: `${userId}@test.com`,
                name: "Azure Depletion User",
                tier: "spore",
                tierBalance: 0.01,
                packBalance: 0.01,
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            const totalPrice = 0.025;

            const deduct = () =>
                handleBalanceDeduction({
                    db,
                    isBilledUsage: true,
                    totalPrice,
                    userId,
                    modelResolved,
                });

            await deduct();
            let balance = await getUserBalance(db, userId);
            expect(balance.tierBalance).toBeCloseTo(0.01, 10);
            expect(balance.packBalance).toBeCloseTo(-0.015, 10);

            await deduct();
            balance = await getUserBalance(db, userId);
            expect(balance.tierBalance).toBeCloseTo(-0.015, 10);
            expect(balance.packBalance).toBeCloseTo(-0.015, 10);

            await deduct();
            balance = await getUserBalance(db, userId);
            expect(balance.tierBalance).toBeCloseTo(-0.04, 10);
            expect(balance.packBalance).toBeCloseTo(-0.015, 10);
        });
    });
});
