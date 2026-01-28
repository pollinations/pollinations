import { createExecutionContext, env, SELF } from "cloudflare:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { user as userTable } from "@/db/schema/better-auth.ts";
import worker from "@/index.ts";
import { handleScheduled } from "@/scheduled.ts";
import { getTierPollen, TIER_POLLEN, tierNames } from "@/tier-config.ts";
import {
    atomicDeductPaidBalance,
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

            // Now deduct should come from tier first
            await atomicDeductUserBalance(db, userId, 2);
            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(3); // 5 - 2
            expect(balances.cryptoBalance).toBe(7); // Unchanged

            // Deduct more than tier, should spill to crypto
            await atomicDeductUserBalance(db, userId, 5);
            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0); // 3 - 3
            expect(balances.cryptoBalance).toBe(5); // 7 - 2
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

    describe("Tier Configuration", () => {
        test("getTierPollen should return correct pollen amounts", () => {
            expect(getTierPollen("spore")).toBe(TIER_POLLEN.spore);
            expect(getTierPollen("seed")).toBe(TIER_POLLEN.seed);
            expect(getTierPollen("flower")).toBe(TIER_POLLEN.flower);
            expect(getTierPollen("nectar")).toBe(TIER_POLLEN.nectar);
            expect(getTierPollen("router")).toBe(TIER_POLLEN.router);

            // Default tier
            expect(getTierPollen("spore")).toBe(1);
        });

        test("tierNames should contain all valid tier names", () => {
            expect(tierNames).toEqual([
                "spore",
                "seed",
                "flower",
                "nectar",
                "router",
            ]);
            expect(tierNames).toHaveLength(5);

            // Verify each name exists in TIER_POLLEN
            for (const tier of tierNames) {
                expect(TIER_POLLEN[tier]).toBeDefined();
                expect(TIER_POLLEN[tier]).toBeGreaterThan(0);
            }
        });
    });

    describe("Paid-Only Models", () => {
        test("should reject paid-only models when user has only tier balance", async ({
            apiKey,
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird", "vcr");
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

            // Setup user with only tier balance
            await db
                .update(userTable)
                .set({
                    tierBalance: 10,
                    packBalance: 0,
                    cryptoBalance: 0,
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Test paid-only text model: claude-large
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "claude-large",
                        messages: [{ role: "user", content: "test" }],
                    }),
                },
            );

            expect(response.status).toBe(402);
            const error = await response.json();
            expect(error.error?.message).toContain("requires a paid balance");
        });

        test("should accept paid-only models when user has crypto balance", async ({
            apiKey,
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird", "vcr");
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

            // Setup user with crypto balance
            await db
                .update(userTable)
                .set({
                    tierBalance: 0,
                    packBalance: 0,
                    cryptoBalance: 10,
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Test paid-only image model: seedream-pro
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/image/test?model=seedream-pro",
                {
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);
        });

        test("should accept paid-only models when user has pack balance", async ({
            apiKey,
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird", "vcr");
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

            // Setup user with pack balance
            await db
                .update(userTable)
                .set({
                    tierBalance: 0,
                    packBalance: 10,
                    cryptoBalance: 0,
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Test paid-only video model: veo
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/image/test?model=veo",
                {
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);
        });

        test("should allow regular models with tier balance", async ({
            apiKey,
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird", "vcr");
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

            // Setup user with only tier balance
            await db
                .update(userTable)
                .set({
                    tierBalance: 10,
                    packBalance: 0,
                    cryptoBalance: 0,
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Test regular model: openai
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai",
                        messages: [{ role: "user", content: "test" }],
                    }),
                },
            );

            expect(response.status).toBe(200);
        });

        test("atomicDeductPaidBalance should skip tier balance", async () => {
            const db = drizzle(env.DB);
            const userId = "test-paid-deduct";

            // Setup user with all balance types
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "paid@test.com",
                    name: "Paid Deduct Test",
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

            // Deduct 2 pollen using paid-only deduction
            await atomicDeductPaidBalance(db, userId, 2);

            let balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(10); // Unchanged - tier is skipped
            expect(balances.cryptoBalance).toBe(1); // 3 - 2
            expect(balances.packBalance).toBe(5); // Unchanged

            // Deduct 4 more (1 from crypto, 3 from pack)
            await atomicDeductPaidBalance(db, userId, 4);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(10); // Still unchanged
            expect(balances.cryptoBalance).toBe(0); // 1 - 1
            expect(balances.packBalance).toBe(2); // 5 - 3

            // Deduct 5 more (all from pack, goes negative)
            await atomicDeductPaidBalance(db, userId, 5);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(10); // Still unchanged
            expect(balances.cryptoBalance).toBe(0);
            expect(balances.packBalance).toBe(-3); // 2 - 5 = -3
        });

        test("should show paid_only field in model info", async () => {
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/models",
            );

            expect(response.status).toBe(200);
            const data = await response.json();

            // Check that paid-only models have the flag
            const claudeLarge = data.data.find(
                (m: any) => m.name === "claude-large",
            );
            expect(claudeLarge).toBeDefined();
            expect(claudeLarge.paid_only).toBe(true);

            // Check that regular models don't have the flag or have it as false
            const openai = data.data.find((m: any) => m.name === "openai");
            expect(openai).toBeDefined();
            expect(openai.paid_only).toBeUndefined();
        });

        test("should accept paid-only models with mixed balance (crypto + tier)", async ({
            apiKey,
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird", "vcr");
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

            // Setup user with mixed balance including crypto
            await db
                .update(userTable)
                .set({
                    tierBalance: 5,
                    packBalance: 0,
                    cryptoBalance: 2, // Has crypto, so should work
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Should succeed because user has crypto balance
            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "claude-large",
                        messages: [{ role: "user", content: "test" }],
                    }),
                },
            );

            expect(response.status).toBe(200);
        });

        test("should deduct only from crypto/pack for paid-only models", async () => {
            const db = drizzle(env.DB);
            const userId = "test-paid-deduct-verify";

            // Setup user with all balance types
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "verify@test.com",
                    name: "Verify Deduct Test",
                    tier: "flower",
                    tierBalance: 100, // Large tier balance
                    packBalance: 2,
                    cryptoBalance: 1,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 100,
                        packBalance: 2,
                        cryptoBalance: 1,
                    },
                });

            // Deduct 1.5 pollen using paid-only deduction
            await atomicDeductPaidBalance(db, userId, 1.5);

            const balances = await getUserBalances(db, userId);

            // Tier should be completely untouched
            expect(balances.tierBalance).toBe(100);
            // Crypto should be fully consumed first
            expect(balances.cryptoBalance).toBe(0);
            // Pack should have remainder deducted
            expect(balances.packBalance).toBe(1.5); // 2 - 0.5
        });

        test("should handle paid-only models when pack balance goes negative", async () => {
            const db = drizzle(env.DB);
            const userId = "test-paid-negative";

            // Setup user with small paid balances
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "negative@test.com",
                    name: "Negative Test",
                    tier: "flower",
                    tierBalance: 50, // Should not be used
                    packBalance: 1,
                    cryptoBalance: 0.5,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 50,
                        packBalance: 1,
                        cryptoBalance: 0.5,
                    },
                });

            // Deduct more than available paid balance
            await atomicDeductPaidBalance(db, userId, 3);

            const balances = await getUserBalances(db, userId);

            // Tier still untouched despite negative pack
            expect(balances.tierBalance).toBe(50);
            expect(balances.cryptoBalance).toBe(0);
            // Pack goes negative as expected
            expect(balances.packBalance).toBe(-1.5); // 1 - 2.5
        });

        test("should reject all paid-only model aliases with tier-only balance", async ({
            apiKey,
            sessionToken,
            mocks,
        }) => {
            await mocks.enable("polar", "tinybird", "vcr");
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

            // Setup user with only tier balance
            await db
                .update(userTable)
                .set({
                    tierBalance: 10,
                    packBalance: 0,
                    cryptoBalance: 0,
                })
                .where(sql`${userTable.id} = ${userId}`);

            // Test claude-large aliases
            const claudeAliases = ["claude-opus-4.5", "claude-opus"];
            for (const alias of claudeAliases) {
                const response = await SELF.fetch(
                    "http://localhost:3000/api/generate/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: alias,
                            messages: [{ role: "user", content: "test" }],
                        }),
                    },
                );
                expect(response.status).toBe(402);
            }

            // Test veo alias
            const veoResponse = await SELF.fetch(
                "http://localhost:3000/api/generate/image/test?model=video",
                {
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );
            expect(veoResponse.status).toBe(402);
        });

        test("should handle concurrent requests to paid-only models correctly", async () => {
            const db = drizzle(env.DB);
            const userId = "test-concurrent-paid";

            // Setup user with limited paid balance
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "concurrent-paid@test.com",
                    name: "Concurrent Paid Test",
                    tier: "flower",
                    tierBalance: 100, // Should never be touched
                    packBalance: 5,
                    cryptoBalance: 5,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 100,
                        packBalance: 5,
                        cryptoBalance: 5,
                    },
                });

            // Simulate multiple concurrent paid-only deductions
            const deductions = [1, 2, 1.5, 2.5, 1]; // Total: 8
            await Promise.all(
                deductions.map((amount) =>
                    atomicDeductPaidBalance(db, userId, amount),
                ),
            );

            const balances = await getUserBalances(db, userId);

            // Tier should remain untouched
            expect(balances.tierBalance).toBe(100);

            // Total paid balance should be reduced by exactly 8
            const totalPaidBalance =
                balances.cryptoBalance + balances.packBalance;
            expect(totalPaidBalance).toBe(2); // (5 + 5) - 8 = 2

            // Crypto should be fully consumed first
            expect(balances.cryptoBalance).toBe(0);
            expect(balances.packBalance).toBe(2);
        });

        test("regular and paid-only deductions should work correctly in sequence", async () => {
            const db = drizzle(env.DB);
            const userId = "test-mixed-deduct";

            // Setup user with all balance types
            await db
                .insert(userTable)
                .values({
                    id: userId,
                    email: "mixed@test.com",
                    name: "Mixed Deduct Test",
                    tier: "flower",
                    tierBalance: 5,
                    packBalance: 5,
                    cryptoBalance: 5,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: userTable.id,
                    set: {
                        tierBalance: 5,
                        packBalance: 5,
                        cryptoBalance: 5,
                    },
                });

            // First: Regular deduction (uses tier first)
            await atomicDeductUserBalance(db, userId, 3);

            let balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(2); // 5 - 3
            expect(balances.cryptoBalance).toBe(5); // Untouched
            expect(balances.packBalance).toBe(5); // Untouched

            // Second: Paid-only deduction (skips tier)
            await atomicDeductPaidBalance(db, userId, 4);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(2); // Still 2, not touched
            expect(balances.cryptoBalance).toBe(1); // 5 - 4
            expect(balances.packBalance).toBe(5); // Untouched

            // Third: Another regular deduction
            await atomicDeductUserBalance(db, userId, 6);

            balances = await getUserBalances(db, userId);
            expect(balances.tierBalance).toBe(0); // 2 - 2
            expect(balances.cryptoBalance).toBe(0); // 1 - 1
            expect(balances.packBalance).toBe(2); // 5 - 3
        });
    });
});
