import { createExecutionContext, env, SELF } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { handleScheduled } from "@/scheduled.ts";
import { TIER_POLLEN, getTierPollen, tierNames } from "@/tier-config.ts";
import {
    atomicDeductUserBalance,
    getUserBalances,
} from "@/utils/balance-deduction.ts";
import { test } from "../fixtures.ts";

describe("D1 Tier Migration Features", () => {
    describe("Router Tier", () => {
        test(
            "router tier provides 500 pollen per day",
            { timeout: 30000 },
            async ({ apiKey, mocks }) => {
                await mocks.enable("polar", "tinybird");
                const db = drizzle(env.DB);
                const executionContext = createExecutionContext();

                // Create a router user
                const userId = "router-test-user";
                await db
                    .insert(userTable)
                    .values({
                        id: userId,
                        email: "router@test.com",
                        name: "Router User",
                        tier: "router",
                        tierBalance: 0,
                        packBalance: 0,
                        cryptoBalance: 0,
                        lastTierGrant: Date.now() - 86400000, // Yesterday
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tier: "router",
                            tierBalance: 0,
                            lastTierGrant: Date.now() - 86400000,
                        },
                    });

                // Run daily refill
                const controller = {} as ScheduledController;
                await handleScheduled(controller, env, executionContext);

                // Check balance after refill
                const user = await db
                    .select({
                        tierBalance: userTable.tierBalance,
                        tier: userTable.tier,
                    })
                    .from(userTable)
                    .where(sql`${userTable.id} = ${userId}`)
                    .limit(1);

                expect(user[0]?.tier).toBe("router");
                expect(user[0]?.tierBalance).toBe(500); // Router tier gets 500 pollen
                expect(TIER_POLLEN.router).toBe(500);
            },
        );
    });

    describe("Balance Consumption Order", () => {
        test(
            "balance is consumed in order: tier → crypto → pack",
            { timeout: 30000 },
            async () => {
                const db = drizzle(env.DB);
                const userId = "balance-order-test";

                // Setup user with all three balance types
                await db
                    .insert(userTable)
                    .values({
                        id: userId,
                        email: "balance@test.com",
                        name: "Balance Test User",
                        tier: "flower",
                        tierBalance: 5,
                        cryptoBalance: 10,
                        packBalance: 15,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tierBalance: 5,
                            cryptoBalance: 10,
                            packBalance: 15,
                        },
                    });

                // Deduct 7 pollen (should take 5 from tier, 2 from crypto)
                await atomicDeductUserBalance(db, userId, 7);

                let user = await getUserBalances(db, userId);
                expect(user?.tierBalance).toBe(0);
                expect(user?.cryptoBalance).toBe(8);
                expect(user?.packBalance).toBe(15);

                // Deduct 12 more (should take 8 from crypto, 4 from pack)
                await atomicDeductUserBalance(db, userId, 12);

                user = await getUserBalances(db, userId);
                expect(user?.tierBalance).toBe(0);
                expect(user?.cryptoBalance).toBe(0);
                expect(user?.packBalance).toBe(11);

                // Deduct 15 more (should take all 11 from pack and go negative)
                await atomicDeductUserBalance(db, userId, 15);

                user = await getUserBalances(db, userId);
                expect(user?.tierBalance).toBe(0);
                expect(user?.cryptoBalance).toBe(0);
                expect(user?.packBalance).toBe(-4); // Pack can go negative
            },
        );
    });

    describe("Concurrent Balance Deduction", () => {
        test(
            "atomic deduction prevents race conditions",
            { timeout: 30000 },
            async () => {
                const db = drizzle(env.DB);
                const userId = "concurrent-test";

                // Setup user with limited balance
                await db
                    .insert(userTable)
                    .values({
                        id: userId,
                        email: "concurrent@test.com",
                        name: "Concurrent Test User",
                        tier: "flower",
                        tierBalance: 20,
                        cryptoBalance: 0,
                        packBalance: 0,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tierBalance: 20,
                            cryptoBalance: 0,
                            packBalance: 0,
                        },
                    });

                // Simulate concurrent requests
                const deductions = Array(10).fill(3); // 10 requests of 3 pollen each
                await Promise.all(
                    deductions.map((amount) =>
                        atomicDeductUserBalance(db, userId, amount),
                    ),
                );

                // Check final balance
                const user = await getUserBalances(db, userId);

                // Should have deducted 30 total: 20 from tier, 10 from pack (negative)
                expect(user?.tierBalance).toBe(0);
                expect(user?.cryptoBalance).toBe(0);
                expect(user?.packBalance).toBe(-10);
            },
        );
    });

    describe("Customer Balance Endpoint", () => {
        test(
            "/api/customer/balance returns all balance types",
            { timeout: 30000 },
            async ({ sessionToken, mocks }) => {
                await mocks.enable("polar", "tinybird");

                const response = await SELF.fetch(
                    "http://localhost:3000/api/customer/balance",
                    {
                        method: "GET",
                        headers: {
                            "cookie": `better-auth.session_token=${sessionToken}`,
                        },
                    },
                );

                expect(response.status).toBe(200);

                const balance = await response.json();

                // Should include all balance types and lastTierGrant
                expect(balance).toHaveProperty("tierBalance");
                expect(balance).toHaveProperty("cryptoBalance");
                expect(balance).toHaveProperty("packBalance");
                expect(balance).toHaveProperty("lastTierGrant");

                // Balance values should be numbers
                expect(typeof balance.tierBalance).toBe("number");
                expect(typeof balance.cryptoBalance).toBe("number");
                expect(typeof balance.packBalance).toBe("number");
            },
        );

        test(
            "/api/customer/balance requires session authentication",
            { timeout: 30000 },
            async ({ apiKey, mocks }) => {
                await mocks.enable("polar", "tinybird");

                // Try with API key (should fail)
                const response = await SELF.fetch(
                    "http://localhost:3000/api/customer/balance",
                    {
                        method: "GET",
                        headers: {
                            "authorization": `Bearer ${apiKey}`,
                        },
                    },
                );

                expect(response.status).toBe(401);
            },
        );
    });

    describe("Tier Configuration", () => {
        test("all tier names are defined in TIER_POLLEN", () => {
            for (const tierName of tierNames) {
                expect(TIER_POLLEN).toHaveProperty(tierName);
                expect(typeof TIER_POLLEN[tierName]).toBe("number");
                expect(TIER_POLLEN[tierName]).toBeGreaterThanOrEqual(0);
            }
        });

        test("getTierPollen returns correct values for all tiers", () => {
            expect(getTierPollen("spore")).toBe(1);
            expect(getTierPollen("seed")).toBe(3);
            expect(getTierPollen("flower")).toBe(10);
            expect(getTierPollen("nectar")).toBe(20);
            expect(getTierPollen("router")).toBe(500);
            // Invalid tier defaults to spore (1 pollen)
            expect(getTierPollen("invalid-tier" as any)).toBe(1);
        });
    });

    describe("Zero Balance Handling", () => {
        test(
            "atomicDeductUserBalance handles zero balance correctly",
            { timeout: 30000 },
            async () => {
                const db = drizzle(env.DB);
                const userId = "zero-balance-deduct";

                // Create user with zero balance
                await db
                    .insert(userTable)
                    .values({
                        id: userId,
                        email: "zero@test.com",
                        name: "Zero Balance User",
                        tier: "spore",
                        tierBalance: 0,
                        cryptoBalance: 0,
                        packBalance: 0,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tierBalance: 0,
                            cryptoBalance: 0,
                            packBalance: 0,
                        },
                    });

                // Try to deduct from zero balance - should go negative in pack
                await atomicDeductUserBalance(db, userId, 5);

                const user = await getUserBalances(db, userId);
                expect(user?.tierBalance).toBe(0);
                expect(user?.cryptoBalance).toBe(0);
                expect(user?.packBalance).toBe(-5); // Pack can go negative
            },
        );
    });

    describe("Daily Refill Edge Cases", () => {
        test(
            "users created today don't get double refill",
            { timeout: 30000 },
            async () => {
                const db = drizzle(env.DB);
                const executionContext = createExecutionContext();
                const userId = "new-user-today";

                // Create user with lastTierGrant set to now
                await db
                    .insert(userTable)
                    .values({
                        id: userId,
                        email: "newtoday@test.com",
                        name: "New Today User",
                        tier: "flower",
                        tierBalance: 10, // Already has initial balance
                        packBalance: 0,
                        cryptoBalance: 0,
                        lastTierGrant: Date.now(), // Just granted
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tierBalance: 10,
                            lastTierGrant: Date.now(),
                        },
                    });

                // Run daily refill
                const controller = {} as ScheduledController;
                await handleScheduled(controller, env, executionContext);

                // Check balance - should not be refilled
                const user = await db
                    .select({
                        tierBalance: userTable.tierBalance,
                    })
                    .from(userTable)
                    .where(sql`${userTable.id} = ${userId}`)
                    .limit(1);

                expect(user[0]?.tierBalance).toBe(10); // Unchanged
            },
        );

        test(
            "refill works correctly after tier upgrade",
            { timeout: 30000 },
            async () => {
                const db = drizzle(env.DB);
                const executionContext = createExecutionContext();
                const userId = "tier-upgrade-user";

                // Create user with seed tier
                await db
                    .insert(userTable)
                    .values({
                        id: userId,
                        email: "upgrade@test.com",
                        name: "Upgrade User",
                        tier: "seed",
                        tierBalance: 1, // Partially used
                        packBalance: 0,
                        cryptoBalance: 0,
                        lastTierGrant: Date.now() - 86400000, // Yesterday
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .onConflictDoUpdate({
                        target: userTable.id,
                        set: {
                            tier: "seed",
                            tierBalance: 1,
                            lastTierGrant: Date.now() - 86400000,
                        },
                    });

                // Upgrade tier to flower
                await db
                    .update(userTable)
                    .set({ tier: "flower" })
                    .where(sql`${userTable.id} = ${userId}`);

                // Run daily refill
                const controller = {} as ScheduledController;
                await handleScheduled(controller, env, executionContext);

                // Check balance - should get flower tier amount
                const user = await db
                    .select({
                        tierBalance: userTable.tierBalance,
                        tier: userTable.tier,
                    })
                    .from(userTable)
                    .where(sql`${userTable.id} = ${userId}`)
                    .limit(1);

                expect(user[0]?.tier).toBe("flower");
                expect(user[0]?.tierBalance).toBe(10); // Flower tier amount
            },
        );
    });
});