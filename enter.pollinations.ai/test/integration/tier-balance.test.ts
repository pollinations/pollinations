import { createExecutionContext, env } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { handleScheduled } from "@/scheduled.ts";
import { TIER_POLLEN } from "@/tier-config.ts";
import {
    atomicDeductUserBalance,
    getUserBalances,
} from "@/utils/balance-deduction.ts";
import { test } from "../fixtures.ts";

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
            const controller = {} as ScheduledController;
            await handleScheduled(controller, env, executionContext);

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

            // Each user should have their tier balance set to the correct amount
            expect(users.find((u) => u.id === "user-spore")?.tierBalance).toBe(
                TIER_POLLEN.spore,
            );
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

            // All users should have lastTierGrant updated
            for (const user of users) {
                expect(user.lastTierGrant).toBeDefined();
                expect(user.lastTierGrant).toBeGreaterThan(Date.now() - 60000); // Within last minute
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
            const controller = {} as ScheduledController;
            await handleScheduled(controller, env, executionContext);

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

            // Deduct 3 pollen (should come from tier only)
            await atomicDeductUserBalance(db, userId, 3);

            let balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(2); // 5 - 3
            expect(balances.cryptoBalance).toBe(3); // Unchanged
            expect(balances.packBalance).toBe(10); // Unchanged

            // Deduct 4 more (2 from tier, 2 from crypto)
            await atomicDeductUserBalance(db, userId, 4);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0); // 2 - 2
            expect(balances.cryptoBalance).toBe(1); // 3 - 2
            expect(balances.packBalance).toBe(10); // Unchanged

            // Deduct 5 more (1 from crypto, 4 from pack)
            await atomicDeductUserBalance(db, userId, 5);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0);
            expect(balances.cryptoBalance).toBe(0); // 1 - 1
            expect(balances.packBalance).toBe(6); // 10 - 4

            // Deduct 10 more (all from pack, goes negative)
            await atomicDeductUserBalance(db, userId, 10);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0);
            expect(balances.cryptoBalance).toBe(0);
            expect(balances.packBalance).toBe(-4); // 6 - 10 = -4 (pack can go negative)
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

            // With atomic deductions, total should be exactly 10 (20 - 10 = 10)
            expect(totalBalance).toBe(10);
            expect(balances.tierBalance).toBeGreaterThanOrEqual(0);
            expect(balances.cryptoBalance).toBeGreaterThanOrEqual(0);
        });
    });
});
