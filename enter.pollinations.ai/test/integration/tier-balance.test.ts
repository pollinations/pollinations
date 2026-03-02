import { createExecutionContext, env, SELF } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import worker from "@/index.ts";
import { getTierPollen, TIER_POLLEN, tierNames } from "@/tier-config.ts";
import {
    atomicDeductPaidBalance,
    atomicDeductUserBalance,
    getUserBalances,
    identifyDeductionSource,
} from "@/utils/balance-deduction.ts";
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

describe("Tier Balance Management", () => {
    describe("Daily Cron Refill", () => {
        test("should refill tier balance for all users based on their tier", async () => {
            const db = drizzle(env.DB);
            const executionContext = createExecutionContext();

            // Setup: Create test users with different tiers and depleted balances
            const testUsers = [
                { id: "user-spore", tier: "spore", tierBalance: 0.5 },
                { id: "user-seed", tier: "seed", tierBalance: 1.0 },
                { id: "user-flower", tier: "flower", tierBalance: 2.0 },
                { id: "user-nectar", tier: "nectar", tierBalance: 0 },
                { id: "user-router", tier: "router", tierBalance: 100 },
            ];

            // Insert test users
            for (const user of testUsers) {
                await db
                    .insert(userTable)
                    .values({
                        id: user.id,
                        email: `${user.id}@test.com`,
                        name: user.id,
                        tier: user.tier,
                        tierBalance: user.tierBalance,
                        packBalance: 0,
                        cryptoBalance: 0,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tier: user.tier,
                            tierBalance: user.tierBalance,
                        },
                    });
            }

            // Execute the scheduled handler
            await triggerTierRefill();

            // Verify: Check that all users have their tier balance refilled
            const users = await db
                .select({
                    id: userTable.id,
                    tier: userTable.tier,
                    tierBalance: userTable.tierBalance,
                    lastTierGrant: userTable.lastTierGrant,
                })
                .from(userTable)
                .where(
                    sql`${userTable.id} IN (${sql.join(
                        testUsers.map((u) => sql`${u.id}`),
                        sql`, `,
                    )})`,
                );

            const isMonday = new Date().getUTCDay() === 1;

            // Daily tiers always get refilled
            expect(users.find((u) => u.id === "user-seed")?.tierBalance).toBe(
                TIER_POLLEN.seed,
            );
            expect(users.find((u) => u.id === "user-flower")?.tierBalance).toBe(
                TIER_POLLEN.flower,
            );
            expect(users.find((u) => u.id === "user-nectar")?.tierBalance).toBe(
                TIER_POLLEN.nectar,
            );
            expect(users.find((u) => u.id === "user-router")?.tierBalance).toBe(
                TIER_POLLEN.router,
            );

            // Spore: weekly refill (Monday only)
            const sporeUser = users.find((u) => u.id === "user-spore");
            if (isMonday) {
                expect(sporeUser?.tierBalance).toBe(TIER_POLLEN.spore);
            } else {
                // Not refilled on non-Monday — keeps pre-test balance
                expect(sporeUser?.tierBalance).toBe(0.5);
            }

            // Daily-refill users should have lastTierGrant updated
            for (const user of users.filter((u) => u.id !== "user-spore")) {
                expect(user.lastTierGrant).toBeDefined();
                expect(user.lastTierGrant).toBeGreaterThan(Date.now() - 60000);
            }
        });

        test("should not affect pack or crypto balance during refill", async () => {
            const db = drizzle(env.DB);
            const executionContext = createExecutionContext();

            // Create user with existing pack and crypto balance
            await db
                .insert(userTable)
                .values({
                    id: "user-multi-balance",
                    email: "multi@test.com",
                    name: "Multi Balance",
                    tier: "flower",
                    tierBalance: 2,
                    packBalance: 50,
                    cryptoBalance: 25,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tier: "flower",
                        tierBalance: 2,
                        packBalance: 50,
                        cryptoBalance: 25,
                    },
                });

            // Execute the scheduled handler
            await triggerTierRefill();

            // Check that only tier balance was updated
            const user = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                    cryptoBalance: userTable.cryptoBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = 'user-multi-balance'`)
                .limit(1);

            expect(user[0]?.tierBalance).toBe(TIER_POLLEN.flower);
            expect(user[0]?.packBalance).toBe(50); // Unchanged
            expect(user[0]?.cryptoBalance).toBe(25); // Unchanged
        });
    });

    describe("Atomic Balance Deduction", () => {
        test("should deduct from balances in correct order using atomicDeductUserBalance", async () => {
            const db = drizzle(env.DB);
            const userId = "test-atomic-deduct";

            // Setup user with all balance types
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "atomic@test.com",
                    name: "Atomic Deduct Test",
                    tier: "flower",
                    tierBalance: 5,
                    packBalance: 10,
                    cryptoBalance: 3,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 5,
                        packBalance: 10,
                        cryptoBalance: 3,
                    },
                });

            // Deduct 3 pollen (all from tier — single bucket)
            await atomicDeductUserBalance(db, userId, 3);

            let balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(2); // 5 - 3
            expect(balances.cryptoBalance).toBe(3); // Unchanged
            expect(balances.packBalance).toBe(10); // Unchanged

            // Deduct 4 more (all from tier — tier is still positive)
            await atomicDeductUserBalance(db, userId, 4);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(-2); // 2 - 4 (goes negative)
            expect(balances.cryptoBalance).toBe(3); // Unchanged
            expect(balances.packBalance).toBe(10); // Unchanged

            // Deduct 5 more (tier is negative, crypto is positive → all from crypto)
            await atomicDeductUserBalance(db, userId, 5);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(-2); // Unchanged
            expect(balances.cryptoBalance).toBe(-2); // 3 - 5 (goes negative)
            expect(balances.packBalance).toBe(10); // Unchanged

            // Deduct 15 more (tier/crypto negative → all from pack)
            await atomicDeductUserBalance(db, userId, 15);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(-2); // Unchanged
            expect(balances.cryptoBalance).toBe(-2); // Unchanged
            expect(balances.packBalance).toBe(-5); // 10 - 15 (goes negative)
        });

        test("should prioritize tier → crypto → pack balance order", async () => {
            const db = drizzle(env.DB);
            const userId = "test-priority-order";

            // Setup: User with only crypto balance
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "priority@test.com",
                    name: "Priority Test",
                    tier: "flower",
                    tierBalance: 0,
                    packBalance: 0,
                    cryptoBalance: 10,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 0,
                        packBalance: 0,
                        cryptoBalance: 10,
                    },
                });

            // Deduct from crypto when tier is 0
            await atomicDeductUserBalance(db, userId, 3);
            let balances = await getUserBalances(db, userId);
            expect(balances.cryptoBalance).toBe(7); // 10 - 3
            expect(balances.tierBalance).toBe(0);
            expect(balances.packBalance).toBe(0);

            // Add tier balance
            await db
                .update(userTable)
                .set({ tierBalance: 5 })
                .where(sql`${userTable.id} = ${userId}`);

            // Now deduct should come from tier first (tier > 0)
            await atomicDeductUserBalance(db, userId, 2);
            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(3); // 5 - 2
            expect(balances.cryptoBalance).toBe(7); // Unchanged

            // Deduct more than tier — no split, tier goes negative
            await atomicDeductUserBalance(db, userId, 5);
            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(-2); // 3 - 5 (goes negative)
            expect(balances.cryptoBalance).toBe(7); // Unchanged
        });

        test("should handle zero deductions gracefully", async () => {
            const db = drizzle(env.DB);
            const userId = "test-zero-deduct";

            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "zero@test.com",
                    name: "Zero Deduct Test",
                    tier: "flower",
                    tierBalance: 10,
                    packBalance: 5,
                    cryptoBalance: 3,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 10,
                        packBalance: 5,
                        cryptoBalance: 3,
                    },
                });

            // Deduct 0 should not change balances
            await atomicDeductUserBalance(db, userId, 0);

            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(10);
            expect(balances.cryptoBalance).toBe(3);
            expect(balances.packBalance).toBe(5);
        });

        test("identifyDeductionSource should pick single bucket", () => {
            // Tier is positive — full amount attributed to tier
            const fromTier = identifyDeductionSource(5, 3, 7);
            expect(fromTier.fromTier).toBe(7);
            expect(fromTier.fromCrypto).toBe(0);
            expect(fromTier.fromPack).toBe(0);

            // Tier is zero, crypto is positive — full amount from crypto
            const fromCrypto = identifyDeductionSource(0, 3, 7);
            expect(fromCrypto.fromTier).toBe(0);
            expect(fromCrypto.fromCrypto).toBe(7);
            expect(fromCrypto.fromPack).toBe(0);

            // Tier and crypto are zero — full amount from pack
            const fromPack = identifyDeductionSource(0, 0, 8);
            expect(fromPack.fromTier).toBe(0);
            expect(fromPack.fromCrypto).toBe(0);
            expect(fromPack.fromPack).toBe(8);

            // All zero — falls through to pack
            const allZero = identifyDeductionSource(0, 0, 3);
            expect(allZero.fromPack).toBe(3);

            // Negative tier, zero crypto — falls through to pack
            const negTier = identifyDeductionSource(-3, 0, 4);
            expect(negTier.fromTier).toBe(0);
            expect(negTier.fromCrypto).toBe(0);
            expect(negTier.fromPack).toBe(4);

            // Negative tier, positive crypto — skips tier, uses crypto
            const negTierPosCrypto = identifyDeductionSource(-3, 2, 4);
            expect(negTierPosCrypto.fromTier).toBe(0);
            expect(negTierPosCrypto.fromCrypto).toBe(4);
            expect(negTierPosCrypto.fromPack).toBe(0);

            // All negative — falls through to pack
            const allNeg = identifyDeductionSource(-3, -1, 5);
            expect(allNeg.fromTier).toBe(0);
            expect(allNeg.fromCrypto).toBe(0);
            expect(allNeg.fromPack).toBe(5);
        });

        test("should deduct from pack when all buckets are negative or zero", async () => {
            const db = drizzle(env.DB);
            const userId = "test-all-negative";

            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "allneg@test.com",
                    name: "All Negative Test",
                    tier: "flower",
                    tierBalance: -1,
                    packBalance: -2,
                    cryptoBalance: -1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: -1,
                        packBalance: -2,
                        cryptoBalance: -1,
                    },
                });

            // All buckets ≤ 0 — falls through to pack
            await atomicDeductUserBalance(db, userId, 3);

            const balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(-1); // Unchanged
            expect(balances.cryptoBalance).toBe(-1); // Unchanged
            expect(balances.packBalance).toBe(-5); // -2 - 3
        });
    });

    describe("Concurrent Balance Updates", () => {
        test("should handle concurrent deductions using atomicDeductUserBalance", async () => {
            const db = drizzle(env.DB);
            const userId = "test-concurrent";

            // Setup user with balance
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "concurrent@test.com",
                    name: "Concurrent Test",
                    tier: "flower",
                    tierBalance: 10,
                    packBalance: 5,
                    cryptoBalance: 5,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 10,
                        packBalance: 5,
                        cryptoBalance: 5,
                    },
                });

            // Simulate multiple concurrent deductions using the atomic function
            const deductions = [2, 3, 4, 1]; // Total: 10
            await Promise.all(
                deductions.map((amount) =>
                    atomicDeductUserBalance(db, userId, amount),
                ),
            );

            // Check final balance
            const balances = await getUserBalances(db, userId);
            const totalBalance =
                balances.tierBalance +
                balances.cryptoBalance +
                balances.packBalance;

            // With atomic deductions, total should be exactly 10 (20 - 10 = 10).
            // We only check the total sum, not per-bucket distribution, because
            // single-bucket deduction means the split depends on D1 write serialization order.
            expect(totalBalance).toBe(10);
        });
    });

    describe("Tier Configuration", () => {
        test("getTierPollen should return correct pollen amounts", () => {
            expect(getTierPollen("spore")).toBe(TIER_POLLEN.spore);
            expect(getTierPollen("seed")).toBe(TIER_POLLEN.seed);
            expect(getTierPollen("flower")).toBe(TIER_POLLEN.flower);
            expect(getTierPollen("nectar")).toBe(TIER_POLLEN.nectar);
            expect(getTierPollen("router")).toBe(TIER_POLLEN.router);

            // Default tier
            expect(getTierPollen("spore")).toBe(1.5);
        });

        test("tierNames should contain all valid tier names", () => {
            expect(tierNames).toEqual([
                "microbe",
                "spore",
                "seed",
                "flower",
                "nectar",
                "router",
            ]);
            expect(tierNames).toHaveLength(6);

            // Verify each name exists in TIER_POLLEN
            for (const tier of tierNames) {
                expect(TIER_POLLEN[tier]).toBeDefined();
                expect(TIER_POLLEN[tier]).toBeGreaterThanOrEqual(0);
            }
        });
    });
});
