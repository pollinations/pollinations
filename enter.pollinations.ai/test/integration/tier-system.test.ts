import { createExecutionContext, env, SELF } from "cloudflare:test";
import {
    atomicDeductUserBalance,
    getUserBalances,
} from "@shared/billing/deduction.ts";
import { handleBalanceDeduction } from "@shared/billing/track-helpers.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getModelDefinition } from "@shared/registry/registry.ts";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

// Helper to trigger tier refill via admin API
async function triggerTierRefill() {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/admin/trigger-refill",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                "Content-Type": "application/json",
            },
        },
    );
    return response.json();
}

describe("Tier System End-to-End", () => {
    describe("Hourly Usage Pattern", () => {
        test("user exhausts tier balance and falls back to pack balance", async () => {
            const db = drizzle(env.DB);
            const _executionContext = createExecutionContext();
            const userId = "heavy-user";

            // User starts with flower tier (0.4 pollen/hour) and bought a pack (50 pollen)
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "heavy@test.com",
                    name: "Heavy User",
                    tier: "flower",
                    tierBalance: 0.4,
                    packBalance: 50,
                    lastTierGrant: Date.now() - 86400000, // Yesterday
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tier: "flower",
                        tierBalance: 0.4,
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
            expect(afterUsage[0]?.tierBalance).toBeCloseTo(0.4, 4);
            expect(afterUsage[0]?.packBalance).toBeCloseTo(30, 4);

            // Trigger tier refill
            await triggerTierRefill();

            // Check balance after refill
            const afterRefill = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                    lastTierGrant: userTable.lastTierGrant,
                })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            // Tier is already at its hourly floor and pack is unchanged.
            expect(afterRefill[0]?.tierBalance).toBeCloseTo(0.4, 4);
            expect(afterRefill[0]?.packBalance).toBeCloseTo(30, 4);
            expect(afterRefill[0]?.lastTierGrant).toBeGreaterThan(
                Date.now() - 5000,
            );
        });

        test("multiple users with different tiers get correct allowance", async () => {
            const db = drizzle(env.DB);
            const _executionContext = createExecutionContext();

            // Setup diverse user base
            // All tiers get hourly incremental refill
            const users = [
                {
                    id: "free-user",
                    tier: "spore",
                    expectedPollen: 0.01,
                },
                { id: "basic-user", tier: "seed", expectedPollen: 0.15 },
                { id: "pro-user", tier: "flower", expectedPollen: 0.4 },
                { id: "enterprise-user", tier: "nectar", expectedPollen: 0.8 },
                { id: "router-user", tier: "router", expectedPollen: 10 },
            ];

            // Create all users with depleted balances
            for (const user of users) {
                await db
                    .insert(userTable)
                    .values({
                        id: user.id,
                        email: `${user.id}@test.com`,
                        name: user.id,
                        tier: user.tier,
                        tierBalance: 0,
                        packBalance: 0,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tier: user.tier,
                            tierBalance: 0,
                        },
                    });
            }

            // Run cron
            await triggerTierRefill();

            // Verify each user got correct amount
            for (const user of users) {
                const result = await db
                    .select({ tierBalance: userTable.tierBalance })
                    .from(userTable)
                    .where(sql`${userTable.id} = ${user.id}`)
                    .limit(1);

                expect(result[0]?.tierBalance).toBe(user.expectedPollen);
            }
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

    describe("Tier Migration Integrity", () => {
        test("users migrated from legacy tier state maintain their tier and get hourly refills", async () => {
            const db = drizzle(env.DB);
            const _executionContext = createExecutionContext();

            // Simulate migrated users with various states
            const migratedUsers = [
                {
                    id: "migrated-active",
                    tier: "nectar",
                    tierBalance: 15, // Partially used
                    packBalance: 200, // Had purchased packs
                },
                {
                    id: "migrated-new",
                    tier: "seed",
                    tierBalance: 0.15, // Full hourly balance
                    packBalance: 0,
                },
                {
                    id: "migrated-depleted",
                    tier: "flower",
                    tierBalance: 0, // Fully depleted
                    packBalance: 50,
                },
            ];

            for (const user of migratedUsers) {
                await db
                    .insert(userTable)
                    .values({
                        id: user.id,
                        email: `${user.id}@test.com`,
                        name: user.id,
                        tier: user.tier,
                        tierBalance: user.tierBalance,
                        packBalance: user.packBalance,
                        lastTierGrant: Date.now() - 86400000, // Yesterday
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tier: user.tier,
                            tierBalance: user.tierBalance,
                            packBalance: user.packBalance,
                            lastTierGrant: Date.now() - 86400000,
                        },
                    });
            }

            // Run hourly refill
            await triggerTierRefill();

            // Verify correct refills
            const activeUser = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = 'migrated-active'`)
                .limit(1);

            expect(activeUser[0]?.tierBalance).toBe(15); // Above tier floor, preserved
            expect(activeUser[0]?.packBalance).toBe(200); // Unchanged

            const depletedUser = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = 'migrated-depleted'`)
                .limit(1);

            expect(depletedUser[0]?.tierBalance).toBe(0.4); // Flower tier (additive: MIN(0 + 0.4, 0.4) = 0.4)
            expect(depletedUser[0]?.packBalance).toBe(50); // Unchanged
        });
    });

    describe("Edge Cases", () => {
        test("handles tier changes correctly", async () => {
            const db = drizzle(env.DB);
            const _executionContext = createExecutionContext();
            const userId = "tier-change-user";

            // User starts as seed tier
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "tierchange@test.com",
                    name: "Tier Change User",
                    tier: "seed",
                    tierBalance: 2, // Partially used seed balance
                    packBalance: 0,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tier: "seed",
                        tierBalance: 2,
                    },
                });

            // Admin upgrades user to flower tier
            await db
                .update(userTable)
                .set({ tier: "flower" })
                .where(sql`${userTable.id} = ${userId}`);

            // Run hourly refill
            await triggerTierRefill();

            // User keeps balance above the new flower tier floor.
            const result = await db
                .select({ tierBalance: userTable.tierBalance })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            expect(result[0]?.tierBalance).toBe(2);
        });

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
            let balance = await getUserBalances(db, userId);
            expect(balance.tierBalance).toBeCloseTo(0.01, 10);
            expect(balance.packBalance).toBeCloseTo(-0.015, 10);

            await deduct();
            balance = await getUserBalances(db, userId);
            expect(balance.tierBalance).toBeCloseTo(-0.015, 10);
            expect(balance.packBalance).toBeCloseTo(-0.015, 10);

            await deduct();
            balance = await getUserBalances(db, userId);
            expect(balance.tierBalance).toBeCloseTo(-0.04, 10);
            expect(balance.packBalance).toBeCloseTo(-0.015, 10);
        });
    });
});
