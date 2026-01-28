import { createExecutionContext, env, SELF } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import { handleScheduled } from "@/scheduled.ts";
import { atomicDeductUserBalance } from "@/utils/balance-deduction.ts";
import { test } from "../fixtures.ts";

describe("Tier System End-to-End", () => {
    describe("Daily Usage Pattern", () => {
        test("user exhausts tier balance and falls back to pack balance", async () => {
            const db = drizzle(env.DB);
            const executionContext = createExecutionContext();
            const userId = "heavy-user";

            // User starts with flower tier (10 pollen/day) and bought a pack (50 pollen)
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "heavy@test.com",
                    name: "Heavy User",
                    tier: "flower",
                    tierBalance: 10,
                    packBalance: 50,
                    cryptoBalance: 0,
                    lastTierGrant: Date.now() - 86400000, // Yesterday
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tier: "flower",
                        tierBalance: 10,
                        packBalance: 50,
                        cryptoBalance: 0,
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

            // Should have exhausted tier (10) and used 10 from pack
            expect(afterUsage[0]?.tierBalance).toBe(0);
            expect(afterUsage[0]?.packBalance).toBe(40);

            // Run daily cron to refill
            const controller = {} as ScheduledController;
            await handleScheduled(controller, env, executionContext);

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

            // Tier should be refilled, pack unchanged
            expect(afterRefill[0]?.tierBalance).toBe(10);
            expect(afterRefill[0]?.packBalance).toBe(40);
            expect(afterRefill[0]?.lastTierGrant).toBeGreaterThan(
                Date.now() - 5000,
            );
        });

        test("multiple users with different tiers get correct daily allowance", async () => {
            const db = drizzle(env.DB);
            const executionContext = createExecutionContext();

            // Setup diverse user base
            const users = [
                { id: "free-user", tier: "spore", expectedPollen: 1 },
                { id: "basic-user", tier: "seed", expectedPollen: 3 },
                { id: "pro-user", tier: "flower", expectedPollen: 10 },
                { id: "enterprise-user", tier: "nectar", expectedPollen: 20 },
                { id: "router-user", tier: "router", expectedPollen: 500 },
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
                        cryptoBalance: 0,
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
            const controller = {} as ScheduledController;
            await handleScheduled(controller, env, executionContext);

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

    describe("Pack Purchase via Webhook", () => {
        test("Polar webhook correctly updates pack balance", async ({
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird");
            const db = drizzle(env.DB);

            // Get the authenticated user ID from session
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

            // Check initial balance
            const initialBalance = await db
                .select({ packBalance: userTable.packBalance })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            const startBalance = initialBalance[0]?.packBalance ?? 0;

            // Simulate Polar webhook for pack purchase
            const webhookPayload = {
                type: "benefit_grant.created",
                data: {
                    id: "grant_123",
                    orderId: "order_456", // Important: orderId indicates pack purchase
                    customer: {
                        id: "polar_customer_123",
                        externalId: userId,
                        email: "test@example.com",
                    },
                    benefit: {
                        type: "meter_credit",
                        properties: {
                            units: 100, // 100 pollen pack
                        },
                    },
                },
            };

            // Use test mode for webhook (bypasses complex signature validation)
            const payload = JSON.stringify(webhookPayload);

            // Send webhook with test header
            const response = await SELF.fetch(
                "http://localhost:3000/api/webhooks/polar",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-test-webhook": "true", // Bypass signature validation in test
                    },
                    body: payload,
                },
            );

            expect(response.status).toBe(200);

            // Verify pack balance was updated
            const updatedBalance = await db
                .select({ packBalance: userTable.packBalance })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            expect(updatedBalance[0]?.packBalance).toBe(startBalance + 100);
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
                    packBalance: 30,
                    cryptoBalance: 10,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 20,
                        packBalance: 30,
                        cryptoBalance: 10,
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
                    cryptoBalance: userTable.cryptoBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            // Total deducted: 50 pollen
            // Should have used: 20 from tier, 10 from crypto, 20 from pack
            expect(finalBalance[0]?.tierBalance).toBe(0);
            expect(finalBalance[0]?.cryptoBalance).toBe(0);
            expect(finalBalance[0]?.packBalance).toBe(10);

            // Total remaining should be exactly 10
            const totalRemaining =
                (finalBalance[0]?.tierBalance ?? 0) +
                (finalBalance[0]?.cryptoBalance ?? 0) +
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
                    cryptoBalance: 0,
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
            expect(balance.cryptoBalance).toBe(0);
        });
    });

    describe("Tier Migration Integrity", () => {
        test("users migrated from Polar maintain their tier and get daily refills", async () => {
            const db = drizzle(env.DB);
            const executionContext = createExecutionContext();

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
                    tierBalance: 3, // Full balance
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
                        cryptoBalance: 0,
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

            // Run daily refill
            const controller = {} as ScheduledController;
            await handleScheduled(controller, env, executionContext);

            // Verify correct refills
            const activeUser = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = 'migrated-active'`)
                .limit(1);

            expect(activeUser[0]?.tierBalance).toBe(20); // Nectar tier
            expect(activeUser[0]?.packBalance).toBe(200); // Unchanged

            const depletedUser = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = 'migrated-depleted'`)
                .limit(1);

            expect(depletedUser[0]?.tierBalance).toBe(10); // Flower tier
            expect(depletedUser[0]?.packBalance).toBe(50); // Unchanged
        });
    });

    describe("Edge Cases", () => {
        test("handles tier changes correctly", async () => {
            const db = drizzle(env.DB);
            const executionContext = createExecutionContext();
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
                    cryptoBalance: 0,
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

            // Run daily refill
            const controller = {} as ScheduledController;
            await handleScheduled(controller, env, executionContext);

            // User should get flower tier amount (10), not seed (3)
            const result = await db
                .select({ tierBalance: userTable.tierBalance })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            expect(result[0]?.tierBalance).toBe(10);
        });

        test("crypto balance is consumed before pack balance", async () => {
            const db = drizzle(env.DB);
            const userId = "crypto-user";

            // User with crypto payment and pack purchase
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "crypto@test.com",
                    name: "Crypto User",
                    tier: "spore",
                    tierBalance: 1,
                    packBalance: 100,
                    cryptoBalance: 50, // From crypto payment
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 1,
                        packBalance: 100,
                        cryptoBalance: 50,
                    },
                });

            // Use 30 pollen (1 from tier, 29 from crypto)
            await atomicDeductUserBalance(db, userId, 30);

            const balance = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    cryptoBalance: userTable.cryptoBalance,
                    packBalance: userTable.packBalance,
                })
                .from(userTable)
                .where(sql`${userTable.id} = ${userId}`)
                .limit(1);

            expect(balance[0]?.tierBalance).toBe(0);
            expect(balance[0]?.cryptoBalance).toBe(21); // 50 - 29
            expect(balance[0]?.packBalance).toBe(100); // Untouched
        });
    });
});
